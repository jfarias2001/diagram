import { addNode, createMindMapDoc, decodeDoc, encodeDoc, readNodes } from '@diagram/shared';
import type { MemberRole, User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pruneSnapshots } from '../src/modules/documents/snapshots.js';
import { call, createTestApp, userWithSession } from './helpers.js';

// SPEC-005 §7 — histórico de versões.

let app: FastifyInstance;
type Actor = { user: User; cookie: string };
const actors = {} as Record<'owner' | 'editor' | 'commenter' | 'viewer' | 'outsider' | 'admin', Actor>;

beforeAll(async () => {
  app = await createTestApp();
  for (const name of ['owner', 'editor', 'commenter', 'viewer', 'outsider'] as const) {
    actors[name] = await userWithSession(app);
  }
  actors.admin = await userWithSession(app, { role: 'ADMIN' });
});
afterAll(async () => {
  await app?.close();
});

/** Documento do `owner` com um mapa de três nós e os papéis de sempre. */
async function setupDocument(): Promise<string> {
  const res = await call(app, actors.owner.cookie, 'POST', '/documents', { title: 'Plano anual' });
  const id = res.json().id as string;
  const roles: Array<[User, MemberRole]> = [
    [actors.editor.user, 'EDITOR'],
    [actors.commenter.user, 'COMMENTER'],
    [actors.viewer.user, 'VIEWER'],
  ];
  await app.prisma.documentMember.createMany({
    data: roles.map(([u, role]) => ({ documentId: id, userId: u.id, role })),
  });
  await writeState(id, (doc) => {
    addNode(doc, { id: 'a', parentId: 'root', text: 'Comercial' });
    addNode(doc, { id: 'a1', parentId: 'a', text: 'Metas do trimestre' });
    addNode(doc, { id: 'b', parentId: 'root', text: 'Fábrica' });
  });
  return id;
}

/** Edita o documento direto no banco (nenhum cliente conectado). */
async function writeState(id: string, change: (doc: ReturnType<typeof createMindMapDoc>) => void) {
  const row = await app.prisma.document.findUniqueOrThrow({ where: { id }, select: { yState: true } });
  const doc = decodeDoc(new Uint8Array(row.yState!));
  change(doc);
  const state = encodeDoc(doc);
  await app.prisma.document.update({
    where: { id },
    data: { yState: Buffer.from(state), sizeBytes: state.byteLength },
  });
}

async function storedNodes(id: string) {
  const row = await app.prisma.document.findUniqueOrThrow({ where: { id }, select: { yState: true } });
  return readNodes(decodeDoc(new Uint8Array(row.yState!)));
}

const saveVersion = (id: string, cookie: string, name = 'Aprovado pela diretoria') =>
  call(app, cookie, 'POST', `/documents/${id}/versions`, { kind: 'NAMED', name });

describe('permissões do histórico (PRD-005 §7)', () => {
  it('leitor e comentador veem a lista e o conteúdo, mas não criam nem restauram', async () => {
    const id = await setupDocument();
    const created = await saveVersion(id, actors.owner.cookie);
    expect(created.statusCode).toBe(201);
    const versionId = created.json().id as string;

    for (const actor of [actors.viewer, actors.commenter] as const) {
      expect((await call(app, actor.cookie, 'GET', `/documents/${id}/versions`)).statusCode).toBe(200);
      expect((await call(app, actor.cookie, 'GET', `/documents/${id}/versions/${versionId}/content`)).statusCode).toBe(200);
      expect((await saveVersion(id, actor.cookie)).statusCode).toBe(403);
      const restore = await call(app, actor.cookie, 'POST', `/documents/${id}/versions/${versionId}/restore`);
      expect(restore.statusCode).toBe(403);
    }
  });

  it('editor cria e restaura; só o dono renomeia e apaga', async () => {
    const id = await setupDocument();
    const versionId = (await saveVersion(id, actors.editor.cookie)).json().id as string;

    expect((await call(app, actors.editor.cookie, 'POST', `/documents/${id}/versions/${versionId}/restore`)).statusCode).toBe(200);
    expect((await call(app, actors.editor.cookie, 'PATCH', `/documents/${id}/versions/${versionId}`, { name: 'Outro' })).statusCode).toBe(403);
    expect((await call(app, actors.editor.cookie, 'DELETE', `/documents/${id}/versions/${versionId}`)).statusCode).toBe(403);
    expect((await call(app, actors.owner.cookie, 'PATCH', `/documents/${id}/versions/${versionId}`, { name: 'Outro' })).statusCode).toBe(200);
    expect((await call(app, actors.owner.cookie, 'DELETE', `/documents/${id}/versions/${versionId}`)).statusCode).toBe(204);
  });

  it('quem não é membro (nem o ADMIN) recebe 404 em tudo', async () => {
    const id = await setupDocument();
    const versionId = (await saveVersion(id, actors.owner.cookie)).json().id as string;

    for (const actor of [actors.outsider, actors.admin] as const) {
      expect((await call(app, actor.cookie, 'GET', `/documents/${id}/versions`)).statusCode).toBe(404);
      expect((await call(app, actor.cookie, 'GET', `/documents/${id}/versions/${versionId}/content`)).statusCode).toBe(404);
      expect((await call(app, actor.cookie, 'POST', `/documents/${id}/versions/${versionId}/restore`)).statusCode).toBe(404);
      expect((await call(app, actor.cookie, 'POST', `/documents/${id}/versions/${versionId}/copy`)).statusCode).toBe(404);
    }
  });

  it('versão de outro documento dá 404 (IDOR)', async () => {
    const meu = await setupDocument();
    const outro = await setupDocument();
    const versionId = (await saveVersion(outro, actors.owner.cookie)).json().id as string;

    expect((await call(app, actors.owner.cookie, 'GET', `/documents/${meu}/versions/${versionId}/content`)).statusCode).toBe(404);
    expect((await call(app, actors.owner.cookie, 'POST', `/documents/${meu}/versions/${versionId}/restore`)).statusCode).toBe(404);
  });

  it('versão automática não pode ser renomeada nem apagada à mão', async () => {
    const id = await setupDocument();
    const auto = await app.prisma.snapshot.create({
      data: { documentId: id, kind: 'AUTO', state: Buffer.from([1, 2, 3]), sizeBytes: 3 },
      select: { id: true },
    });
    expect((await call(app, actors.owner.cookie, 'PATCH', `/documents/${id}/versions/${auto.id}`, { name: 'x' })).statusCode).toBe(409);
    expect((await call(app, actors.owner.cookie, 'DELETE', `/documents/${id}/versions/${auto.id}`)).statusCode).toBe(409);
  });
});

describe('restaurar (PRD-005 §5.6)', () => {
  it('devolve o conteúdo, guarda o estado atual e não apaga nada', async () => {
    const id = await setupDocument();
    const versionId = (await saveVersion(id, actors.owner.cookie, 'Antes da bagunça')).json().id as string;

    // Alguém apaga um ramo inteiro.
    await writeState(id, (doc) => {
      doc.getMap('nodes').delete('a');
      doc.getMap('nodes').delete('a1');
    });
    expect(Object.keys(await storedNodes(id)).sort()).toEqual(['b', 'root']);

    const restore = await call(app, actors.owner.cookie, 'POST', `/documents/${id}/versions/${versionId}/restore`);
    expect(restore.statusCode).toBe(200);
    expect(restore.json().checkpointId).toBeTruthy();

    // O ramo voltou, e o estado de antes virou uma versão a mais.
    expect(Object.keys(await storedNodes(id)).sort()).toEqual(['a', 'a1', 'b', 'root']);
    const list = (await call(app, actors.owner.cookie, 'GET', `/documents/${id}/versions`)).json();
    expect(list.items).toHaveLength(2);
    expect(list.items[0].kind).toBe('CHECKPOINT');
    expect(list.items[0].name).toMatch(/^Antes de restaurar de /);
  });

  it('o texto restaurado volta para a busca do painel', async () => {
    const id = await setupDocument();
    await writeState(id, (doc) => addNode(doc, { id: 'z', parentId: 'root', text: 'palavradificil' }));
    const versionId = (await saveVersion(id, actors.owner.cookie)).json().id as string;
    await writeState(id, (doc) => doc.getMap('nodes').delete('z'));

    await call(app, actors.owner.cookie, 'POST', `/documents/${id}/versions/${versionId}/restore`);
    const found = await call(app, actors.owner.cookie, 'GET', '/documents?scope=mine&q=palavradificil');
    expect(found.json().items.map((d: { id: string }) => d.id)).toContain(id);
  });
});

describe('salvar como cópia (PRD-005 §5.7)', () => {
  it('um leitor cria a própria cópia sem mexer no original', async () => {
    const id = await setupDocument();
    const versionId = (await saveVersion(id, actors.owner.cookie)).json().id as string;

    const copy = await call(app, actors.viewer.cookie, 'POST', `/documents/${id}/versions/${versionId}/copy`);
    expect(copy.statusCode).toBe(201);
    expect(copy.json().myRole).toBe('OWNER');
    expect(copy.json().id).not.toBe(id);

    // A cópia tem o conteúdo da versão, e o original continua com o dono original.
    expect(Object.keys(await storedNodes(copy.json().id)).sort()).toEqual(['a', 'a1', 'b', 'root']);
    const original = await app.prisma.document.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
    expect(original.ownerId).toBe(actors.owner.user.id);
    // E é encontrada pela busca (searchText preenchido a partir da versão).
    const found = await call(app, actors.viewer.cookie, 'GET', '/documents?scope=mine&q=Comercial');
    expect(found.json().items.map((d: { id: string }) => d.id)).toContain(copy.json().id);
  });
});

describe('lixeira e exclusão (PRD-005 §5.9)', () => {
  it('lixeira preserva o histórico; apagar de vez apaga junto', async () => {
    const id = await setupDocument();
    await saveVersion(id, actors.owner.cookie);

    await call(app, actors.owner.cookie, 'POST', `/documents/${id}/trash`);
    expect(await app.prisma.snapshot.count({ where: { documentId: id } })).toBe(1);

    await call(app, actors.owner.cookie, 'DELETE', `/documents/${id}`);
    expect(await app.prisma.snapshot.count({ where: { documentId: id } })).toBe(0);
  });
});

describe('retenção (PRD-005 §5.8)', () => {
  it('guarda tudo dos 30 dias, uma por dia até 1 ano, e nada depois disso', async () => {
    const id = await setupDocument();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const at = (daysAgo: number, hour: number) => new Date(now - daysAgo * day + hour * 60 * 60 * 1000);

    const make = (kind: 'AUTO' | 'NAMED' | 'CHECKPOINT', createdAt: Date) =>
      app.prisma.snapshot.create({
        data: { documentId: id, kind, state: Buffer.from([1]), sizeBytes: 1, createdAt },
        select: { id: true },
      });

    const recentes = [await make('AUTO', at(2, 0)), await make('AUTO', at(2, 3))];
    const doMesmoDia = [await make('AUTO', at(100, 1)), await make('AUTO', at(100, 5))];
    const velha = await make('AUTO', at(400, 0));
    const comNome = await make('NAMED', at(400, 0));
    const checkpoint = await make('CHECKPOINT', at(400, 0));

    const removed = await pruneSnapshots(app.prisma, now);
    expect(removed).toBeGreaterThanOrEqual(2);

    const left = await app.prisma.snapshot.findMany({ where: { documentId: id }, select: { id: true } });
    const ids = new Set(left.map((s) => s.id));
    for (const s of recentes) expect(ids.has(s.id)).toBe(true);
    expect(ids.has(velha.id)).toBe(false);
    expect(ids.has(comNome.id)).toBe(true);
    expect(ids.has(checkpoint.id)).toBe(true);
    // Do dia repetido sobra só a mais recente.
    expect(ids.has(doMesmoDia[1]!.id)).toBe(true);
    expect(ids.has(doMesmoDia[0]!.id)).toBe(false);
  });
});
