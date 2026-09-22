import { addNode, decodeDoc, readNodes, updateNode } from '@diagram/shared';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { call, createTestApp, ORIGIN, userWithSession } from './helpers.js';

let app: FastifyInstance;
let wsUrl: string;
const open: Array<{ destroy(): void }> = [];

beforeAll(async () => {
  app = await createTestApp();
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  wsUrl = `${address.replace('http', 'ws')}/collab`;
});
afterEach(() => {
  while (open.length) open.pop()!.destroy();
});
afterAll(async () => {
  await app?.close();
});

async function waitFor(check: () => boolean | Promise<boolean>, timeout = 8000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('timeout esperando condição');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** WebSocket de Node com cookie e Origin, como um navegador mandaria. */
function socketClass(cookie: string | null, origin = ORIGIN) {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { origin, ...(cookie ? { cookie } : {}) } });
    }
  };
}

function connect(cookie: string | null, documentId: string, origin = ORIGIN) {
  const doc = new Y.Doc();
  const state = { synced: false, failed: null as string | null, readOnly: null as boolean | null };
  const websocketProvider = new HocuspocusProviderWebsocket({
    url: wsUrl,
    WebSocketPolyfill: socketClass(cookie, origin),
  });
  const provider = new HocuspocusProvider({
    websocketProvider,
    name: documentId,
    document: doc,
    token: 'cookie',
    onSynced: () => {
      state.synced = true;
    },
    onAuthenticated: ({ scope }) => {
      state.readOnly = scope === 'readonly';
    },
    onAuthenticationFailed: ({ reason }) => {
      state.failed = reason;
    },
  });
  // Com websocketProvider explícito, a v4 exige attach().
  provider.attach();
  open.push(provider, websocketProvider);
  return { provider, doc, state };
}

async function setup() {
  const owner = await userWithSession(app, { name: 'Dona' });
  const editor = await userWithSession(app, { name: 'Editor Real' });
  const viewer = await userWithSession(app, { name: 'Leitor Real' });
  const outsider = await userWithSession(app);
  const id = (await call(app, owner.cookie, 'POST', '/documents', { title: 'Mapa' })).json().id as string;
  await app.prisma.documentMember.createMany({
    data: [
      { documentId: id, userId: editor.user.id, role: 'EDITOR' },
      { documentId: id, userId: viewer.user.id, role: 'VIEWER' },
    ],
  });
  return { id, owner, editor, viewer, outsider };
}

async function storedNodes(id: string) {
  app.collab.instance.flushPendingStores();
  await new Promise((r) => setTimeout(r, 300));
  const row = await app.prisma.document.findUniqueOrThrow({ where: { id }, select: { yState: true } });
  return readNodes(decodeDoc(new Uint8Array(row.yState!)));
}

describe('WebSocket /collab', () => {
  it('recusa conexão sem sessão', async () => {
    const { id } = await setup();
    const code = await new Promise<number>((resolve) => {
      const ws = new (socketClass(null))(wsUrl);
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4401);
    expect(await app.prisma.document.count({ where: { id } })).toBe(1);
  });

  it('recusa Origin de outro site (CSRF de WebSocket)', async () => {
    const { owner } = await setup();
    const code = await new Promise<number>((resolve) => {
      const ws = new (socketClass(owner.cookie, 'https://evil.com'))(wsUrl);
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4403);
  });

  it('não-membro recebe permission-denied, mesmo sabendo o id', async () => {
    const { id, outsider } = await setup();
    const { state } = connect(outsider.cookie, id);
    await waitFor(() => state.failed !== null);
    expect(state.failed).toBe('not-found');
    expect(state.synced).toBe(false);
  });

  it('editor sincroniza, colega recebe na hora e o servidor persiste', async () => {
    const { id, owner, editor } = await setup();
    const a = connect(owner.cookie, id);
    const b = connect(editor.cookie, id);
    await waitFor(() => a.state.synced && b.state.synced);
    expect(b.state.readOnly).toBe(false);
    expect(readNodes(b.doc).root?.text).toBe('Mapa');

    addNode(b.doc, { id: 'n1', parentId: 'root', text: 'Ideia do editor' });
    await waitFor(() => readNodes(a.doc).n1?.text === 'Ideia do editor');

    const stored = await storedNodes(id);
    expect(stored.n1?.text).toBe('Ideia do editor');
    const row = await app.prisma.document.findUniqueOrThrow({ where: { id } });
    expect(row.searchText).toContain('Ideia do editor');
    expect(row.lastEditedById).toBe(editor.user.id);
  });

  it('leitor fica somente leitura: alterações forjadas são descartadas no servidor', async () => {
    const { id, owner, viewer } = await setup();
    const a = connect(owner.cookie, id);
    const v = connect(viewer.cookie, id);
    await waitFor(() => a.state.synced && v.state.synced);
    expect(v.state.readOnly).toBe(true);

    // O leitor "hackeia" o próprio doc local e o provider tenta enviar.
    addNode(v.doc, { id: 'hack', parentId: 'root', text: 'invasão' });
    updateNode(v.doc, 'root', { text: 'título trocado' });
    await new Promise((r) => setTimeout(r, 800));

    expect(readNodes(a.doc).hack).toBeUndefined();
    expect(readNodes(a.doc).root?.text).toBe('Mapa');
    const stored = await storedNodes(id);
    expect(stored.hack).toBeUndefined();
    expect(stored.root?.text).toBe('Mapa');
  });

  it('nota do editor entra na busca do painel (SPEC-002 §7)', async () => {
    const { id, owner, editor } = await setup();
    const e = connect(editor.cookie, id);
    await waitFor(() => e.state.synced);
    const a = connect(owner.cookie, id);
    await waitFor(() => a.state.synced);
    updateNode(e.doc, 'root', { note: 'Detalhe com a palavra xilofonenota' });
    await waitFor(() => readNodes(a.doc).root?.note !== undefined);

    const stored = await storedNodes(id);
    expect(stored.root?.note).toContain('xilofonenota');
    const res = await call(app, owner.cookie, 'GET', '/documents?scope=mine&q=xilofonenota');
    expect(res.json().items.map((d: { id: string }) => d.id)).toContain(id);
  });

  it('leitor não consegue gravar nota nem link forjando o WebSocket', async () => {
    const { id, owner, viewer } = await setup();
    const a = connect(owner.cookie, id);
    const v = connect(viewer.cookie, id);
    await waitFor(() => a.state.synced && v.state.synced);

    updateNode(v.doc, 'root', { note: 'nota invasora', link: 'https://evil.com' });
    await new Promise((r) => setTimeout(r, 800));

    expect(readNodes(a.doc).root?.note).toBeUndefined();
    const stored = await storedNodes(id);
    expect(stored.root?.note).toBeUndefined();
    expect(stored.root?.link).toBeUndefined();
  });

  it('remover o membro derruba a conexão e ele não volta', async () => {
    const { id, owner, editor } = await setup();
    const e = connect(editor.cookie, id);
    await waitFor(() => e.state.synced);

    const res = await call(app, owner.cookie, 'DELETE', `/documents/${id}/members/${editor.user.id}`);
    expect(res.statusCode).toBe(204);
    await waitFor(() => e.state.failed === 'not-found');

    const a = connect(owner.cookie, id);
    await waitFor(() => a.state.synced);
    addNode(e.doc, { id: 'depois', parentId: 'root', text: 'depois de removido' });
    await new Promise((r) => setTimeout(r, 500));
    expect(readNodes(a.doc).depois).toBeUndefined();
  });

  it('rebaixar Editor → Leitor vale na hora', async () => {
    const { id, owner, editor } = await setup();
    const e = connect(editor.cookie, id);
    await waitFor(() => e.state.synced && e.state.readOnly === false);

    await call(app, owner.cookie, 'PATCH', `/documents/${id}/members/${editor.user.id}`, { role: 'VIEWER' });
    await waitFor(() => e.state.readOnly === true);

    const a = connect(owner.cookie, id);
    await waitFor(() => a.state.synced);
    addNode(e.doc, { id: 'rebaixado', parentId: 'root', text: 'x' });
    await new Promise((r) => setTimeout(r, 500));
    expect(readNodes(a.doc).rebaixado).toBeUndefined();
  });

  it('presença: o nome exibido vem do servidor, não do cliente', async () => {
    const { id, owner, viewer } = await setup();
    const a = connect(owner.cookie, id);
    const v = connect(viewer.cookie, id);
    await waitFor(() => a.state.synced && v.state.synced);

    v.provider.setAwarenessField('user', { id: owner.user.id, name: 'Diretor Falso', color: '#ff0000' });
    await waitFor(() =>
      [...a.provider.awareness!.getStates().values()].some((s) => s.user?.color === '#ff0000'),
    );
    const fake = [...a.provider.awareness!.getStates().values()].find((s) => s.user?.color === '#ff0000');
    expect(fake?.user).toMatchObject({ id: viewer.user.id, name: 'Leitor Real' });

    // Cor que não é hex (tentativa de injetar CSS) é trocada pela padrão.
    v.provider.setAwarenessField('user', { name: 'x', color: 'red;background:url(https://evil.com/x)' });
    await waitFor(() =>
      [...a.provider.awareness!.getStates().values()].some((s) => s.user?.id === viewer.user.id && s.user?.color === '#5c7cfa'),
    );
  });

  it('mandar para a lixeira derruba todo mundo', async () => {
    const { id, owner, editor } = await setup();
    const e = connect(editor.cookie, id);
    await waitFor(() => e.state.synced);
    await call(app, owner.cookie, 'POST', `/documents/${id}/trash`);
    await waitFor(() => e.state.failed === 'not-found');
  });
});
