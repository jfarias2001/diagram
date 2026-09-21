import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken } from '../src/lib/crypto.js';
import { MAX_FAILED_LOGINS } from '../src/modules/auth/routes.js';
import { call, createTestApp, createUser, login, ORIGIN, PASSWORD, userWithSession } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app?.close();
});

const postLogin = (email: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, payload: { email, password } });

describe('login', () => {
  it('loga, devolve o usuário e grava só o hash do token', async () => {
    const user = await createUser(app);
    const res = await postLogin(user.email.toUpperCase(), PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ id: user.id, email: user.email });
    expect(res.json().user.passwordHash).toBeUndefined();

    const cookie = res.cookies.find((c) => c.name === 'sid')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const stored = await app.prisma.session.findFirst({ where: { userId: user.id } });
    expect(stored!.tokenHash).not.toBe(cookie.value);
    expect(stored!.tokenHash).toBe(hashSessionToken(cookie.value, 's'.repeat(40)));
  });

  it('mesma resposta para e-mail inexistente, senha errada e usuário inativo', async () => {
    const user = await createUser(app);
    const inactive = await createUser(app, { active: false });
    const results = await Promise.all([
      postLogin('ninguem@teste.com', PASSWORD),
      postLogin(user.email, 'senha-errada-000'),
      postLogin(inactive.email, PASSWORD),
    ]);
    for (const r of results) {
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' } });
    }
  });

  it(`bloqueia a conta após ${MAX_FAILED_LOGINS} falhas seguidas`, async () => {
    const user = await createUser(app);
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      expect((await postLogin(user.email, 'errada-errada')).statusCode).toBe(401);
    }
    const locked = await postLogin(user.email, PASSWORD);
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rate limit de 10 tentativas por minuto por IP', async () => {
    const limited = await createTestApp({ LOGIN_RATE_LIMIT_MAX: '10' });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await limited.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin: ORIGIN },
          remoteAddress: '10.9.9.9',
          payload: { email: 'x@teste.com', password: 'y' },
        });
        statuses.push(r.statusCode);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      const last = await limited.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: ORIGIN }, remoteAddress: '10.9.9.9', payload: { email: 'x@teste.com', password: 'y' } });
      expect(last.json().error.code).toBe('RATE_LIMITED');
    } finally {
      await limited.close();
    }
  });

  it('X-Forwarded-For forjado não fura o rate limit', async () => {
    const limited = await createTestApp({ LOGIN_RATE_LIMIT_MAX: '10' });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await limited.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          // O atacante inventa um IP à esquerda; o Traefik anexa o IP real à direita.
          headers: { origin: ORIGIN, 'x-forwarded-for': `1.2.3.${i}, 10.7.7.7` },
          remoteAddress: '172.18.0.2',
          payload: { email: 'x@teste.com', password: 'y' },
        });
        statuses.push(r.statusCode);
      }
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });

  it('logout remove o cookie com os mesmos atributos de segurança', async () => {
    const secure = await createTestApp({ APP_URL: 'https://diagram.paglamp.com.br' });
    try {
      const res = await secure.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: 'https://diagram.paglamp.com.br' },
      });
      const cleared = res.cookies.find((c) => c.name === '__Host-sid');
      expect(cleared).toMatchObject({ secure: true, httpOnly: true, path: '/', value: '' });
    } finally {
      await secure.close();
    }
  });

  it('recusa login sem Origin (CSRF)', async () => {
    const user = await createUser(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: user.email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('sessão', () => {
  it('sem cookie → 401; cookie inventado → 401', async () => {
    expect((await call(app, null, 'GET', '/auth/me')).statusCode).toBe(401);
    expect((await call(app, 'sid=inventado', 'GET', '/auth/me')).statusCode).toBe(401);
  });

  it('logout invalida a sessão no servidor', async () => {
    const { cookie } = await userWithSession(app);
    expect((await call(app, cookie, 'POST', '/auth/logout')).statusCode).toBe(204);
    expect((await call(app, cookie, 'GET', '/auth/me')).statusCode).toBe(401);
  });

  it('sessão expirada é recusada e apagada', async () => {
    const { user, cookie } = await userWithSession(app);
    await app.prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(app, cookie, 'GET', '/auth/me')).statusCode).toBe(401);
    expect(await app.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('usuário desativado perde o acesso na hora', async () => {
    const { user, cookie } = await userWithSession(app);
    await app.prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await call(app, cookie, 'GET', '/auth/me')).statusCode).toBe(401);
  });
});

describe('troca de senha', () => {
  it('senha provisória bloqueia o resto da API até trocar', async () => {
    const { cookie } = await userWithSession(app, { mustChangePassword: true });
    expect((await call(app, cookie, 'GET', '/auth/me')).json().mustChangePassword).toBe(true);
    const blocked = await call(app, cookie, 'GET', '/documents');
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await call(app, cookie, 'POST', '/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'nova-senha-segura',
    });
    expect(changed.statusCode).toBe(200);
    expect((await call(app, cookie, 'GET', '/documents')).statusCode).toBe(200);
  });

  it('exige a senha atual correta e derruba as outras sessões', async () => {
    const { user, cookie } = await userWithSession(app);
    const other = await login(app, user.email);

    const wrong = await call(app, cookie, 'POST', '/auth/change-password', {
      currentPassword: 'errada-errada',
      newPassword: 'nova-senha-segura',
    });
    expect(wrong.statusCode).toBe(400);

    const ok = await call(app, cookie, 'POST', '/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'nova-senha-segura',
    });
    expect(ok.statusCode).toBe(200);
    expect((await call(app, cookie, 'GET', '/auth/me')).statusCode).toBe(200);
    expect((await call(app, other, 'GET', '/auth/me')).statusCode).toBe(401);
  });

  it('recusa senha curta e senha igual ao e-mail', async () => {
    const { user, cookie } = await userWithSession(app);
    const short = await call(app, cookie, 'POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'curta' });
    expect(short.statusCode).toBe(400);
    const sameAsEmail = await call(app, cookie, 'POST', '/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: user.email,
    });
    expect(sameAsEmail.statusCode).toBe(400);
  });
});
