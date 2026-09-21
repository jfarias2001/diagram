import type { MemberRole, User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeTrash } from '../src/modules/documents/purge.js';
import { call, createUser, createTestApp, login, userWithSession } from './helpers.js';

let app: FastifyInstance;
type Actor = { user: User; cookie: string };
const actors = {} as Record<'owner' | 'editor' | 'commenter' | 'viewer' | 'outsider' | 'admin', Actor>;
let target: User; // membro extra, alvo das rotas de membros

beforeAll(async () => {
  app = await createTestApp();
  for (const name of ['owner', 'editor', 'commenter', 'viewer', 'outsider'] as const) {
    actors[name] = await userWithSession(app);
  }
  actors.admin = await userWithSession(app, { role: 'ADMIN' });
  target = await createUser(app);
});
afterAll(async () => {
  await app?.close();
});

/** Documento novo do `owner`, com editor/commenter/viewer/target como membros. */
async function setupDocument(): Promise<string> {
  const res = await call(app, actors.owner.cookie, 'POST', '/documents', { title: 'Planejamento' });
  expect(res.statusCode).toBe(201);
  const id = res.json().id as string;
  const roles: Array<[User, MemberRole]> = [
    [actors.editor.user, 'EDITOR'],
    [actors.commenter.user, 'COMMENTER'],
    [actors.viewer.user, 'VIEWER'],
    [target, 'VIEWER'],
  ];
  await app.prisma.documentMember.createMany({
    data: roles.map(([u, role]) => ({ documentId: id, userId: u.id, role })),
  });
  return id;
}

// PRD-001 §7 / SPEC-001 §3.3–3.4. `min` = papel mínimo.
const ROUTES: Array<{ name: string; min: MemberRole; run: (a: Actor, id: string) => ReturnType<typeof call> }> = [
  { name: 'ver documento', min: 'VIEWER', run: (a, id) => call(app, a.cookie, 'GET', `/documents/${id}`) },
  { name: 'renomear', min: 'EDITOR', run: (a, id) => call(app, a.cookie, 'PATCH', `/documents/${id}`, { title: 'Novo' }) },
  { name: 'duplicar', min: 'VIEWER', run: (a, id) => call(app, a.cookie, 'POST', `/documents/${id}/duplicate`, {}) },
  { name: 'listar membros', min: 'VIEWER', run: (a, id) => call(app, a.cookie, 'GET', `/documents/${id}/members`) },
  {
    name: 'compartilhar',
    min: 'OWNER',
    run: async (a, id) => {
      const extra = await createUser(app);
      return call(app, a.cookie, 'POST', `/documents/${id}/members`, { email: extra.email, role: 'VIEWER' });
    },
  },
  {
    name: 'mudar papel de membro',
    min: 'OWNER',
    run: (a, id) => call(app, a.cookie, 'PATCH', `/documents/${id}/members/${target.id}`, { role: 'EDITOR' }),
  },
  {
    name: 'remover membro',
    min: 'OWNER',
    run: (a, id) => call(app, a.cookie, 'DELETE', `/documents/${id}/members/${target.id}`),
  },
  { name: 'mandar para lixeira', min: 'OWNER', run: (a, id) => call(app, a.cookie, 'POST', `/documents/${id}/trash`) },
];

const RANK: Record<MemberRole, number> = { VIEWER: 0, COMMENTER: 1, EDITOR: 2, OWNER: 3 };
const ACTOR_ROLE: Record<keyof typeof actors, MemberRole | null> = {
  owner: 'OWNER',
  editor: 'EDITOR',
  commenter: 'COMMENTER',
  viewer: 'VIEWER',
  outsider: null,
  admin: null, // admin não tem exceção
};

describe('matriz de permissões (PRD-001 §7)', () => {
  for (const route of ROUTES) {
    for (const actorName of Object.keys(ACTOR_ROLE) as Array<keyof typeof actors>) {
      const role = ACTOR_ROLE[actorName];
      const expected = role === null ? 404 : RANK[role] >= RANK[route.min] ? 'ok' : 403;
      it(`${route.name} × ${actorName} → ${expected}`, async () => {
        const id = await setupDocument();
        const res = await route.run(actors[actorName], id);
        if (expected === 'ok') expect(res.statusCode, res.body).toBeLessThan(300);
        else expect(res.statusCode, res.body).toBe(expected);
      });
    }
  }

  it('id inexistente e id de outro dono dão a mesma resposta', async () => {
    const id = await setupDocument();
    const other = await call(app, actors.outsider.cookie, 'GET', `/documents/${id}`);
    const missing = await call(app, actors.outsider.cookie, 'GET', '/documents/nao-existe');
    expect(other.statusCode).toBe(404);
    expect(other.body).toBe(missing.body);
  });
});

describe('documentos', () => {
  it('lista por escopo e busca pelo texto', async () => {
    const id = await setupDocument();
    await app.prisma.document.update({ where: { id }, data: { searchText: 'orçamento trimestral' } });

    const mine = (await call(app, actors.owner.cookie, 'GET', '/documents?scope=mine')).json();
    expect(mine.items.map((d: { id: string }) => d.id)).toContain(id);
    const shared = (await call(app, actors.viewer.cookie, 'GET', '/documents?scope=shared')).json();
    expect(shared.items.find((d: { id: string }) => d.id === id)?.myRole).toBe('VIEWER');
    const notMine = (await call(app, actors.viewer.cookie, 'GET', '/documents?scope=mine')).json();
    expect(notMine.items.map((d: { id: string }) => d.id)).not.toContain(id);

    const found = (await call(app, actors.owner.cookie, 'GET', '/documents?q=TRIMESTRAL')).json();
    expect(found.items.map((d: { id: string }) => d.id)).toContain(id);
  });

  it('duplicar cria cópia da qual quem duplicou é dono', async () => {
    const id = await setupDocument();
    const res = await call(app, actors.viewer.cookie, 'POST', `/documents/${id}/duplicate`, {});
    expect(res.json()).toMatchObject({ title: 'Planejamento (cópia)', myRole: 'OWNER' });
  });

  it('lixeira: some para todos, só o dono restaura, apagar exige estar na lixeira', async () => {
    const id = await setupDocument();
    expect((await call(app, actors.owner.cookie, 'DELETE', `/documents/${id}`)).statusCode).toBe(409);
    expect((await call(app, actors.owner.cookie, 'POST', `/documents/${id}/trash`)).statusCode).toBe(204);

    expect((await call(app, actors.editor.cookie, 'GET', `/documents/${id}`)).statusCode).toBe(404);
    expect((await call(app, actors.owner.cookie, 'GET', `/documents/${id}`)).statusCode).toBe(404);
    const trash = (await call(app, actors.owner.cookie, 'GET', '/documents?scope=trash')).json();
    expect(trash.items.map((d: { id: string }) => d.id)).toContain(id);
    expect((await call(app, actors.editor.cookie, 'POST', `/documents/${id}/restore`)).statusCode).toBe(404);

    expect((await call(app, actors.owner.cookie, 'POST', `/documents/${id}/restore`)).statusCode).toBe(204);
    expect((await call(app, actors.editor.cookie, 'GET', `/documents/${id}`)).statusCode).toBe(200);

    await call(app, actors.owner.cookie, 'POST', `/documents/${id}/trash`);
    expect((await call(app, actors.owner.cookie, 'DELETE', `/documents/${id}`)).statusCode).toBe(204);
    expect(await app.prisma.document.count({ where: { id } })).toBe(0);
  });

  it('purga apaga o que passou da retenção', async () => {
    const id = await setupDocument();
    await app.prisma.document.update({ where: { id }, data: { trashedAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect(await purgeTrash(app.prisma, 30)).toBeGreaterThanOrEqual(1);
    expect(await app.prisma.document.count({ where: { id } })).toBe(0);
  });
});

describe('compartilhamento', () => {
  it('compartilha digitando o e-mail; e-mail desconhecido ou inativo dá 404', async () => {
    const id = await setupDocument();
    const colleague = await createUser(app, { name: 'Colega' });
    const ok = await call(app, actors.owner.cookie, 'POST', `/documents/${id}/members`, {
      email: colleague.email.toUpperCase(),
      role: 'EDITOR',
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ userId: colleague.id, role: 'EDITOR' });

    const dup = await call(app, actors.owner.cookie, 'POST', `/documents/${id}/members`, { email: colleague.email, role: 'VIEWER' });
    expect(dup.statusCode).toBe(409);

    const unknown = await call(app, actors.owner.cookie, 'POST', `/documents/${id}/members`, {
      email: 'ninguem@teste.com',
      role: 'VIEWER',
    });
    expect(unknown.json().error.code).toBe('USER_NOT_FOUND');

    const inactive = await createUser(app, { active: false });
    const res = await call(app, actors.owner.cookie, 'POST', `/documents/${id}/members`, { email: inactive.email, role: 'VIEWER' });
    expect(res.statusCode).toBe(404);
  });

  it('não dá para compartilhar como OWNER nem mexer no papel do dono', async () => {
    const id = await setupDocument();
    const extra = await createUser(app);
    const asOwner = await call(app, actors.owner.cookie, 'POST', `/documents/${id}/members`, { email: extra.email, role: 'OWNER' });
    expect(asOwner.statusCode).toBe(400);
    const demoteOwner = await call(app, actors.owner.cookie, 'PATCH', `/documents/${id}/members/${actors.owner.user.id}`, {
      role: 'VIEWER',
    });
    expect(demoteOwner.statusCode).toBe(409);
  });

  it('membro pode sair; dono não', async () => {
    const id = await setupDocument();
    expect((await call(app, actors.viewer.cookie, 'DELETE', `/documents/${id}/members/${actors.viewer.user.id}`)).statusCode).toBe(204);
    expect((await call(app, actors.viewer.cookie, 'GET', `/documents/${id}`)).statusCode).toBe(404);
    const ownerLeaves = await call(app, actors.owner.cookie, 'DELETE', `/documents/${id}/members/${actors.owner.user.id}`);
    expect(ownerLeaves.statusCode).toBe(403);
  });

  it('usuário com senha provisória não acessa documentos compartilhados', async () => {
    const id = await setupDocument();
    const fresh = await createUser(app, { mustChangePassword: true });
    await app.prisma.documentMember.create({ data: { documentId: id, userId: fresh.id, role: 'EDITOR' } });
    const cookie = await login(app, fresh.email);
    expect((await call(app, cookie, 'GET', `/documents/${id}`)).statusCode).toBe(403);
  });
});
