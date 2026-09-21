import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFirstAdmin } from '../src/modules/admin/seed.js';
import { call, createTestApp, login, testEnv, uniqueEmail, userWithSession } from './helpers.js';

let app: FastifyInstance;
let adminCookie: string;
let adminId: string;

beforeAll(async () => {
  app = await createTestApp();
  const admin = await userWithSession(app, { role: 'ADMIN' });
  adminCookie = admin.cookie;
  adminId = admin.user.id;
});
afterAll(async () => {
  await app?.close();
});

describe('admin de usuários', () => {
  it('MEMBER não acessa /admin', async () => {
    const { cookie } = await userWithSession(app);
    expect((await call(app, cookie, 'GET', '/admin/users')).statusCode).toBe(403);
    expect((await call(app, cookie, 'POST', '/admin/users', { name: 'X', email: uniqueEmail() })).statusCode).toBe(403);
  });

  it('cria acesso com senha provisória que funciona uma vez e exige troca', async () => {
    const email = uniqueEmail('novo');
    const res = await call(app, adminCookie, 'POST', '/admin/users', { name: 'Novo Colaborador', email });
    expect(res.statusCode).toBe(201);
    const { user, temporaryPassword } = res.json();
    expect(user).toMatchObject({ email, role: 'MEMBER', mustChangePassword: true, active: true });
    expect(temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);

    const cookie = await login(app, email, temporaryPassword);
    expect((await call(app, cookie, 'GET', '/auth/me')).json().mustChangePassword).toBe(true);
  });

  it('aceita e-mail de qualquer provedor e recusa duplicado', async () => {
    const email = `alguem-${Date.now()}@gmail.com`;
    expect((await call(app, adminCookie, 'POST', '/admin/users', { name: 'Ana', email })).statusCode).toBe(201);
    const dup = await call(app, adminCookie, 'POST', '/admin/users', { name: 'Ana 2', email: email.toUpperCase() });
    expect(dup.statusCode).toBe(409);
  });

  it('redefinir senha derruba as sessões do usuário', async () => {
    const { user, cookie } = await userWithSession(app);
    const res = await call(app, adminCookie, 'POST', `/admin/users/${user.id}/reset-password`);
    expect(res.statusCode).toBe(200);
    expect((await call(app, cookie, 'GET', '/auth/me')).statusCode).toBe(401);
    const fresh = await login(app, user.email, res.json().temporaryPassword);
    expect((await call(app, fresh, 'GET', '/auth/me')).json().mustChangePassword).toBe(true);
  });

  it('desativar derruba as sessões', async () => {
    const { user, cookie } = await userWithSession(app);
    const res = await call(app, adminCookie, 'PATCH', `/admin/users/${user.id}`, { active: false });
    expect(res.statusCode).toBe(200);
    expect((await call(app, cookie, 'GET', '/auth/me')).statusCode).toBe(401);
  });

  it('admin não remove o próprio acesso', async () => {
    const self = await call(app, adminCookie, 'PATCH', `/admin/users/${adminId}`, { role: 'MEMBER' });
    expect(self.statusCode).toBe(409);
    expect(self.json().error.code).toBe('SELF_LOCKOUT');
  });

  it('senha provisória nunca aparece no log de auditoria', async () => {
    const res = await call(app, adminCookie, 'POST', '/admin/users', { name: 'Log', email: uniqueEmail() });
    const { temporaryPassword, user } = res.json();
    const events = await app.prisma.auditEvent.findMany({ where: { targetId: user.id } });
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(temporaryPassword);
  });
});

describe('seed do primeiro admin', () => {
  it('não faz nada quando já existe admin', async () => {
    const env = testEnv({ SEED_ADMIN_EMAIL: uniqueEmail('seed'), SEED_ADMIN_PASSWORD: 'senha-inicial-123' });
    expect(await seedFirstAdmin(app.prisma, env, app.log)).toBe(false);
  });

  it('e-mail inválido no .env não derruba a API: só não cria o admin', async () => {
    const admins = await app.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await app.prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'MEMBER' } });
    try {
      const env = testEnv({ SEED_ADMIN_EMAIL: 'SEU_EMAIL', SEED_ADMIN_PASSWORD: 'senha-inicial-123' });
      await expect(seedFirstAdmin(app.prisma, env, app.log)).resolves.toBe(false);
      expect(await app.prisma.user.count({ where: { role: 'ADMIN' } })).toBe(0);
    } finally {
      await app.prisma.user.updateMany({ where: { id: { in: admins.map((a) => a.id) } }, data: { role: 'ADMIN' } });
    }
  });

  it('cria admin com troca obrigatória quando não existe nenhum', async () => {
    const admins = await app.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await app.prisma.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'MEMBER' } });
    try {
      const email = uniqueEmail('seed');
      const env = testEnv({ SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: 'senha-inicial-123' });
      expect(await seedFirstAdmin(app.prisma, env, app.log)).toBe(true);
      const seeded = await app.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(seeded).toMatchObject({ role: 'ADMIN', mustChangePassword: true });
      await login(app, email, 'senha-inicial-123');
    } finally {
      await app.prisma.user.updateMany({ where: { id: { in: admins.map((a) => a.id) } }, data: { role: 'ADMIN' } });
    }
  });
});
