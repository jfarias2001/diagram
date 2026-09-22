import {
  addEdge,
  addNode,
  addShape,
  decodeDoc,
  deleteBranch,
  readDiagram,
  readNodes,
  setNodeOffset,
  updateNode,
} from '@diagram/shared';
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
  // Intervalo curto para as versões automáticas caberem no teste (SPEC-005 §4).
  app = await createTestApp({ SNAPSHOT_INTERVAL_MINUTES: '0.0001' });
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

  it('leitor não move, não pinta e não troca o formato do bloco (SPEC-006 §6)', async () => {
    const { id, owner, viewer } = await setup();
    const a = connect(owner.cookie, id);
    const v = connect(viewer.cookie, id);
    await waitFor(() => a.state.synced && v.state.synced);

    setNodeOffset(v.doc, 'root', { dx: 400, dy: 400 });
    updateNode(v.doc, 'root', { shape: 'hexagon', fill: '#1b2230' });
    await new Promise((r) => setTimeout(r, 800));

    expect(readNodes(a.doc).root?.dx).toBeUndefined();
    expect(readNodes(a.doc).root?.shape).toBeUndefined();
    const stored = await storedNodes(id);
    expect(stored.root?.dx).toBeUndefined();
    expect(stored.root?.fill).toBeUndefined();
  });

  it('editor move e pinta o bloco, e o colega recebe (SPEC-006 §4)', async () => {
    const { id, owner, editor } = await setup();
    const a = connect(owner.cookie, id);
    const e = connect(editor.cookie, id);
    await waitFor(() => a.state.synced && e.state.synced);

    setNodeOffset(e.doc, 'root', { dx: 120, dy: -80 });
    updateNode(e.doc, 'root', { shape: 'ellipse', fill: '#d0ebff' });
    await waitFor(() => readNodes(a.doc).root?.dx === 120);

    expect(readNodes(a.doc).root).toMatchObject({ dy: -80, shape: 'ellipse', fill: '#d0ebff' });
    const stored = await storedNodes(id);
    expect(stored.root).toMatchObject({ dx: 120, shape: 'ellipse' });
  });

  it('restaurar uma versão chega a quem está com o documento aberto (SPEC-005 §4)', async () => {
    const { id, owner, editor } = await setup();
    const a = connect(owner.cookie, id);
    const e = connect(editor.cookie, id);
    await waitFor(() => a.state.synced && e.state.synced);

    addNode(e.doc, { id: 'ramo', parentId: 'root', text: 'Ramo importante' });
    await waitFor(() => readNodes(a.doc).ramo !== undefined);

    const versao = await call(app, owner.cookie, 'POST', `/documents/${id}/versions`, {
      kind: 'NAMED',
      name: 'Com o ramo',
    });
    expect(versao.statusCode).toBe(201);

    // Alguém apaga o ramo, e os dois veem sumir.
    deleteBranch(e.doc, 'ramo');
    await waitFor(() => readNodes(a.doc).ramo === undefined);

    const restore = await call(app, owner.cookie, `POST`, `/documents/${id}/versions/${versao.json().id}/restore`);
    expect(restore.statusCode).toBe(200);

    // Sem recarregar: o ramo volta nas duas abas.
    await waitFor(() => readNodes(a.doc).ramo !== undefined && readNodes(e.doc).ramo !== undefined);
    expect(readNodes(a.doc).ramo?.text).toBe('Ramo importante');
  });

  it('versão automática é criada pelo servidor, com quem editou (SPEC-005 §4)', async () => {
    const { id, editor } = await setup();
    const e = connect(editor.cookie, id);
    await waitFor(() => e.state.synced);

    // A primeira gravação só marca o começo do intervalo; a versão sai na seguinte.
    addNode(e.doc, { id: 'auto', parentId: 'root', text: 'Editado por quem tem papel' });
    await waitFor(async () => (await storedNodes(id)).auto !== undefined);
    updateNode(e.doc, 'auto', { text: 'Editado por quem tem papel, de novo' });
    await waitFor(async () => (await app.prisma.snapshot.count({ where: { documentId: id, kind: 'AUTO' } })) > 0);

    const snapshot = await app.prisma.snapshot.findFirstOrThrow({
      where: { documentId: id, kind: 'AUTO' },
      select: { editorIds: true, state: true, name: true },
    });
    expect(snapshot.name).toBeNull();
    expect(snapshot.editorIds).toContain(editor.user.id);
    expect(readNodes(decodeDoc(new Uint8Array(snapshot.state))).auto?.text).toContain('Editado por quem tem papel');
  });

  it('acesso herdado da pasta vale no WebSocket, e sair da pasta derruba (SPEC-004 §4)', async () => {
    const { id, owner, outsider } = await setup();
    // Sem vínculo nenhum: o documento não existe para ela.
    const antes = connect(outsider.cookie, id);
    await waitFor(() => antes.state.failed !== null);
    expect(antes.state.failed).toBe('not-found');

    const pasta = (await call(app, owner.cookie, 'POST', '/folders', { kind: 'SHARED', name: 'Setor' })).json()
      .id as string;
    expect((await call(app, owner.cookie, 'PUT', `/documents/${id}/shared-folder`, { folderId: pasta })).statusCode).toBe(204);
    expect(
      (await call(app, owner.cookie, 'POST', `/folders/${pasta}/members`, {
        email: outsider.user.email,
        role: 'VIEWER',
      })).statusCode,
    ).toBe(201);

    // Agora entra, mas só de leitura: o que ela escrever é descartado.
    const leitora = connect(outsider.cookie, id);
    await waitFor(() => leitora.state.synced && leitora.state.readOnly !== null);
    expect(leitora.state.readOnly).toBe(true);

    const dona = connect(owner.cookie, id);
    await waitFor(() => dona.state.synced);
    addNode(leitora.doc, { id: 'invasor', parentId: 'root', text: 'não deveria entrar' });
    await new Promise((r) => setTimeout(r, 800));
    expect(readNodes(dona.doc).invasor).toBeUndefined();
    expect((await storedNodes(id)).invasor).toBeUndefined();

    // Tirando o documento da pasta, ela perde o acesso e não volta.
    await call(app, owner.cookie, 'PUT', `/documents/${id}/shared-folder`, { folderId: null });
    const depois = connect(outsider.cookie, id);
    await waitFor(() => depois.state.failed !== null);
    expect(depois.state.failed).toBe('not-found');
  });

  it('fluxograma: editor desenha, colega recebe, busca encontra; leitor forjando é descartado (SPEC-003 §7)', async () => {
    const { owner, editor, viewer } = await setup();
    const id = (await call(app, owner.cookie, 'POST', '/documents', { title: 'Fluxo', type: 'DIAGRAM' })).json().id as string;
    await app.prisma.documentMember.createMany({
      data: [
        { documentId: id, userId: editor.user.id, role: 'EDITOR' },
        { documentId: id, userId: viewer.user.id, role: 'VIEWER' },
      ],
    });
    const e = connect(editor.cookie, id);
    const v = connect(viewer.cookie, id);
    const o = connect(owner.cookie, id);
    await waitFor(() => e.state.synced && v.state.synced && o.state.synced);

    addShape(e.doc, { id: 's1', kind: 'decision', x: 0, y: 0, text: 'Pedido aprovado quasimodoforma?' });
    addShape(e.doc, { id: 's2', kind: 'process', x: 0, y: 160, text: 'Faturar' });
    addEdge(e.doc, { id: 'c1', source: 's1', target: 's2', label: 'Sim' });
    await waitFor(() => readDiagram(o.doc).edges.c1?.label === 'Sim');

    addShape(v.doc, { id: 'hack', kind: 'process', x: 0, y: 0, text: 'invasão' });
    addEdge(v.doc, { id: 'hack-edge', source: 's2', target: 's1' });
    await new Promise((r) => setTimeout(r, 800));
    expect(readDiagram(o.doc).shapes.hack).toBeUndefined();
    expect(readDiagram(o.doc).edges['hack-edge']).toBeUndefined();

    app.collab.instance.flushPendingStores();
    await new Promise((r) => setTimeout(r, 300));
    const row = await app.prisma.document.findUniqueOrThrow({ where: { id } });
    const stored = readDiagram(decodeDoc(new Uint8Array(row.yState!)));
    expect(Object.keys(stored.shapes).sort()).toEqual(['s1', 's2']);
    expect(stored.edges['hack-edge']).toBeUndefined();
    const res = await call(app, owner.cookie, 'GET', '/documents?q=quasimodoforma');
    expect(res.json().items.map((d: { id: string }) => d.id)).toContain(id);
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
