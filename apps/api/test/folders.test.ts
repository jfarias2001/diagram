import type { User } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, userWithSession } from './helpers.js';

// SPEC-004 §7 — pastas pessoais, compartilhadas e o papel herdado.

let app: FastifyInstance;
type Actor = { user: User; cookie: string };
const actors = {} as Record<'dono' | 'ana' | 'bruno' | 'outro' | 'admin', Actor>;

beforeAll(async () => {
  app = await createTestApp();
  for (const name of ['dono', 'ana', 'bruno', 'outro'] as const) actors[name] = await userWithSession(app);
  actors.admin = await userWithSession(app, { role: 'ADMIN' });
});
afterAll(async () => {
  await app?.close();
});

const newDoc = async (actor: Actor, title = 'Documento') =>
  (await call(app, actor.cookie, 'POST', '/documents', { title })).json().id as string;

const newFolder = async (actor: Actor, kind: 'PERSONAL' | 'SHARED', name: string, parentId?: string) => {
  const res = await call(app, actor.cookie, 'POST', '/folders', { kind, name, ...(parentId ? { parentId } : {}) });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
};

const addMember = (actor: Actor, folderId: string, target: Actor, role: 'EDITOR' | 'VIEWER') =>
  call(app, actor.cookie, 'POST', `/folders/${folderId}/members`, { email: target.user.email, role });

const putShared = (actor: Actor, documentId: string, folderId: string | null) =>
  call(app, actor.cookie, 'PUT', `/documents/${documentId}/shared-folder`, { folderId });

const putPersonal = (actor: Actor, documentId: string, folderId: string | null) =>
  call(app, actor.cookie, 'PUT', `/documents/${documentId}/personal-folder`, { folderId });

const listIn = async (actor: Actor, folderId: string) => {
  const res = await call(app, actor.cookie, 'GET', `/documents?folder=${folderId}`);
  return { status: res.statusCode, ids: (res.json().items ?? []).map((d: { id: string }) => d.id) as string[] };
};

describe('pastas pessoais (PRD-004 §5.B)', () => {
  it('a pasta pessoal é invisível para os outros, inclusive o ADMIN', async () => {
    const folderId = await newFolder(actors.dono, 'PERSONAL', 'Meus rascunhos');
    const docId = await newDoc(actors.dono);
    expect((await putPersonal(actors.dono, docId, folderId)).statusCode).toBe(204);

    for (const intruso of [actors.ana, actors.admin] as const) {
      expect((await call(app, intruso.cookie, 'GET', `/documents?folder=${folderId}`)).statusCode).toBe(404);
      expect((await call(app, intruso.cookie, 'PATCH', `/folders/${folderId}`, { name: 'x' })).statusCode).toBe(404);
      expect((await call(app, intruso.cookie, 'DELETE', `/folders/${folderId}`)).statusCode).toBe(404);
      const meu = await newDoc(intruso);
      expect((await putPersonal(intruso, meu, folderId)).statusCode).toBe(404);
    }
    // A árvore do outro não mostra nada disso.
    const tree = (await call(app, actors.ana.cookie, 'GET', '/folders')).json();
    expect(tree.personal.map((f: { id: string }) => f.id)).not.toContain(folderId);
  });

  it('guardar um documento compartilhado comigo não muda nada para o dono', async () => {
    const docId = await newDoc(actors.dono, 'Compartilhado');
    await call(app, actors.dono.cookie, 'POST', `/documents/${docId}/members`, {
      email: actors.ana.user.email,
      role: 'VIEWER',
    });
    const anaFolder = await newFolder(actors.ana, 'PERSONAL', 'Clientes');
    expect((await putPersonal(actors.ana, docId, anaFolder)).statusCode).toBe(204);

    expect((await listIn(actors.ana, anaFolder)).ids).toContain(docId);
    const doDono = (await call(app, actors.dono.cookie, 'GET', `/documents/${docId}`)).json();
    expect(doDono.folder).toBeNull();
  });

  it('apagar a pasta pessoal deixa os documentos em "sem pasta"', async () => {
    const folderId = await newFolder(actors.dono, 'PERSONAL', 'Temporária');
    const docId = await newDoc(actors.dono, 'Sobrevivente');
    await putPersonal(actors.dono, docId, folderId);

    expect((await call(app, actors.dono.cookie, 'DELETE', `/folders/${folderId}`)).statusCode).toBe(204);
    const doc = await call(app, actors.dono.cookie, 'GET', `/documents/${docId}`);
    expect(doc.statusCode).toBe(200);
    expect(doc.json().folder).toBeNull();
    const semPasta = await call(app, actors.dono.cookie, 'GET', '/documents?folder=none');
    expect(semPasta.json().items.map((d: { id: string }) => d.id)).toContain(docId);
  });
});

describe('estrutura das pastas (PRD-004 §5.A)', () => {
  it('recusa nome repetido entre irmãs, ignorando acento e caixa', async () => {
    await newFolder(actors.bruno, 'PERSONAL', 'Comercial');
    const repetida = await call(app, actors.bruno.cookie, 'POST', '/folders', {
      kind: 'PERSONAL',
      name: 'comerciál',
    });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json().error.code).toBe('FOLDER_NAME_TAKEN');
  });

  it('vai até 3 níveis e recusa o quarto', async () => {
    const n1 = await newFolder(actors.bruno, 'PERSONAL', 'Nível 1');
    const n2 = await newFolder(actors.bruno, 'PERSONAL', 'Nível 2', n1);
    const n3 = await newFolder(actors.bruno, 'PERSONAL', 'Nível 3', n2);
    const n4 = await call(app, actors.bruno.cookie, 'POST', '/folders', {
      kind: 'PERSONAL',
      name: 'Nível 4',
      parentId: n3,
    });
    expect(n4.statusCode).toBe(409);
    expect(n4.json().error.code).toBe('FOLDER_TOO_DEEP');
  });

  it('recusa mover uma pasta para dentro dela mesma ou de uma filha', async () => {
    const pai = await newFolder(actors.bruno, 'PERSONAL', 'Pai');
    const filha = await newFolder(actors.bruno, 'PERSONAL', 'Filha', pai);

    const nela = await call(app, actors.bruno.cookie, 'PATCH', `/folders/${pai}`, { parentId: pai });
    expect(nela.json().error.code).toBe('FOLDER_CYCLE');
    const naFilha = await call(app, actors.bruno.cookie, 'PATCH', `/folders/${pai}`, { parentId: filha });
    expect(naFilha.json().error.code).toBe('FOLDER_CYCLE');
  });
});

describe('pastas compartilhadas e papel herdado (PRD-004 §5.C)', () => {
  it('quem entra na pasta abre os documentos dela, com o papel da pasta', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Processos da fábrica');
    const docId = await newDoc(actors.dono, 'Processo de compra');
    expect((await putShared(actors.dono, docId, pasta)).statusCode).toBe(204);

    // Antes de entrar na pasta: não existe para a Ana.
    expect((await call(app, actors.ana.cookie, 'GET', `/documents/${docId}`)).statusCode).toBe(404);

    expect((await addMember(actors.dono, pasta, actors.ana, 'VIEWER')).statusCode).toBe(201);
    const comoLeitora = await call(app, actors.ana.cookie, 'GET', `/documents/${docId}`);
    expect(comoLeitora.statusCode).toBe(200);
    expect(comoLeitora.json().myRole).toBe('VIEWER');
    // Leitora não edita, e não é dona: não manda para a lixeira nem apaga.
    expect((await call(app, actors.ana.cookie, 'PATCH', `/documents/${docId}`, { title: 'Meu' })).statusCode).toBe(403);
    expect((await call(app, actors.ana.cookie, 'POST', `/documents/${docId}/trash`)).statusCode).toBe(403);

    // Promovida a editora da pasta, passa a editar — mas continua sem apagar.
    await call(app, actors.dono.cookie, 'PATCH', `/folders/${pasta}/members/${actors.ana.user.id}`, {
      role: 'EDITOR',
    });
    expect((await call(app, actors.ana.cookie, 'PATCH', `/documents/${docId}`, { title: 'Editado' })).statusCode).toBe(200);
    expect((await call(app, actors.ana.cookie, 'POST', `/documents/${docId}/trash`)).statusCode).toBe(403);
    expect((await call(app, actors.ana.cookie, 'DELETE', `/documents/${docId}`)).statusCode).toBe(403);
  });

  it('o documento aparece na aba "compartilhados comigo" só pela pasta', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Comercial');
    const docId = await newDoc(actors.dono, 'Tabela de preços');
    await putShared(actors.dono, docId, pasta);
    await addMember(actors.dono, pasta, actors.bruno, 'VIEWER');

    const compartilhados = await call(app, actors.bruno.cookie, 'GET', '/documents?scope=shared');
    expect(compartilhados.json().items.map((d: { id: string }) => d.id)).toContain(docId);
    // E a busca mostra em que pasta ele está.
    const item = compartilhados.json().items.find((d: { id: string }) => d.id === docId);
    expect(item.folder).toMatchObject({ id: pasta, kind: 'SHARED' });
  });

  it('o papel maior vence: leitor direto + editor da pasta = editor', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Projetos');
    const docId = await newDoc(actors.dono, 'Projeto X');
    await putShared(actors.dono, docId, pasta);
    await call(app, actors.dono.cookie, 'POST', `/documents/${docId}/members`, {
      email: actors.ana.user.email,
      role: 'VIEWER',
    });
    await addMember(actors.dono, pasta, actors.ana, 'EDITOR');

    const doc = await call(app, actors.ana.cookie, 'GET', `/documents/${docId}`);
    expect(doc.statusCode).toBe(200);
    expect((await call(app, actors.ana.cookie, 'PATCH', `/documents/${docId}`, { title: 'Pode' })).statusCode).toBe(200);
  });

  it('só o dono do documento o coloca numa pasta compartilhada', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Diretoria');
    await addMember(actors.dono, pasta, actors.ana, 'EDITOR');

    // Documento da Ana, do qual o dono é só editor: o dono não pode publicá-lo.
    const daAna = await newDoc(actors.ana, 'Documento da Ana');
    await call(app, actors.ana.cookie, 'POST', `/documents/${daAna}/members`, {
      email: actors.dono.user.email,
      role: 'EDITOR',
    });
    const recusado = await putShared(actors.dono, daAna, pasta);
    expect(recusado.statusCode).toBe(403);
    expect(recusado.json().error.code).toBe('NOT_DOCUMENT_OWNER');

    // A própria Ana, como editora da pasta e dona do documento, consegue.
    expect((await putShared(actors.ana, daAna, pasta)).statusCode).toBe(204);
  });

  it('tirar o documento da pasta tira o acesso herdado na hora', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Temporários');
    const docId = await newDoc(actors.dono, 'Só enquanto está na pasta');
    await putShared(actors.dono, docId, pasta);
    await addMember(actors.dono, pasta, actors.ana, 'VIEWER');
    expect((await call(app, actors.ana.cookie, 'GET', `/documents/${docId}`)).statusCode).toBe(200);

    expect((await putShared(actors.dono, docId, null)).statusCode).toBe(204);
    expect((await call(app, actors.ana.cookie, 'GET', `/documents/${docId}`)).statusCode).toBe(404);
  });

  it('remover o membro tira o acesso a todos os documentos da pasta', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Setor');
    const a = await newDoc(actors.dono, 'Doc A');
    const b = await newDoc(actors.dono, 'Doc B');
    await putShared(actors.dono, a, pasta);
    await putShared(actors.dono, b, pasta);
    await addMember(actors.dono, pasta, actors.ana, 'EDITOR');
    expect((await listIn(actors.ana, pasta)).ids.sort()).toEqual([a, b].sort());

    const removida = await call(
      app,
      actors.dono.cookie,
      'DELETE',
      `/folders/${pasta}/members/${actors.ana.user.id}`,
    );
    expect(removida.statusCode).toBe(204);
    expect((await call(app, actors.ana.cookie, 'GET', `/documents/${a}`)).statusCode).toBe(404);
    expect((await call(app, actors.ana.cookie, 'GET', `/documents/${b}`)).statusCode).toBe(404);
  });

  it('apagar a pasta compartilhada deixa os documentos com os donos', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Vai sumir');
    const sub = await newFolder(actors.dono, 'SHARED', 'Subpasta', pasta);
    const docId = await newDoc(actors.dono, 'Continua existindo');
    await putShared(actors.dono, docId, sub);
    await addMember(actors.dono, pasta, actors.ana, 'VIEWER');

    expect((await call(app, actors.dono.cookie, 'DELETE', `/folders/${pasta}`)).statusCode).toBe(204);
    const doc = await call(app, actors.dono.cookie, 'GET', `/documents/${docId}`);
    expect(doc.statusCode).toBe(200);
    expect(doc.json().folder).toBeNull();
    // A subpasta foi junto, e a Ana perdeu o acesso herdado.
    expect(await app.prisma.folder.count({ where: { id: { in: [pasta, sub] } } })).toBe(0);
    expect((await call(app, actors.ana.cookie, 'GET', `/documents/${docId}`)).statusCode).toBe(404);
  });

  it('só o dono da pasta gerencia membros e renomeia a pasta principal', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Governança');
    await addMember(actors.dono, pasta, actors.ana, 'EDITOR');

    expect((await addMember(actors.ana, pasta, actors.bruno, 'VIEWER')).statusCode).toBe(403);
    expect((await call(app, actors.ana.cookie, 'PATCH', `/folders/${pasta}`, { name: 'Outro nome' })).statusCode).toBe(403);
    expect((await call(app, actors.ana.cookie, 'DELETE', `/folders/${pasta}`)).statusCode).toBe(403);

    // Mas editor cria e renomeia subpasta.
    const sub = await newFolder(actors.ana, 'SHARED', 'Subpasta da Ana', pasta);
    expect((await call(app, actors.ana.cookie, 'PATCH', `/folders/${sub}`, { name: 'Renomeada' })).statusCode).toBe(200);
  });

  it('não-membro e ADMIN não veem a pasta compartilhada', async () => {
    const pasta = await newFolder(actors.dono, 'SHARED', 'Fechada');
    for (const intruso of [actors.outro, actors.admin] as const) {
      expect((await call(app, intruso.cookie, 'GET', `/documents?folder=${pasta}`)).statusCode).toBe(404);
      expect((await call(app, intruso.cookie, 'GET', `/folders/${pasta}/members`)).statusCode).toBe(404);
      expect((await addMember(intruso, pasta, actors.bruno, 'VIEWER')).statusCode).toBe(404);
    }
  });
});

describe('lixeira e pastas (PRD-004 §5.8)', () => {
  it('documento na lixeira some da pasta e volta ao ser restaurado', async () => {
    const pasta = await newFolder(actors.dono, 'PERSONAL', 'Com lixeira');
    const docId = await newDoc(actors.dono, 'Vai e volta');
    await putPersonal(actors.dono, docId, pasta);
    expect((await listIn(actors.dono, pasta)).ids).toContain(docId);

    await call(app, actors.dono.cookie, 'POST', `/documents/${docId}/trash`);
    expect((await listIn(actors.dono, pasta)).ids).not.toContain(docId);

    await call(app, actors.dono.cookie, 'POST', `/documents/${docId}/restore`);
    expect((await listIn(actors.dono, pasta)).ids).toContain(docId);
  });
});
