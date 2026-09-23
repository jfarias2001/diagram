import { extractDocSearchText, hasRole, readStyle, type Role } from '@diagram/shared';
import { Database } from '@hocuspocus/extension-database';
import { type Connection, Hocuspocus } from '@hocuspocus/server';
import websocket from '@fastify/websocket';
import fp from 'fastify-plugin';
import * as Y from 'yjs';
import type { Env } from '../config/env.js';
import { resolveSession, sessionCookieName } from '../modules/auth/session.js';
import { assertDocumentAccess } from '../modules/documents/access.js';
import { createSnapshot } from '../modules/documents/snapshots.js';

// SPEC-001 §4 — Hocuspocus embutido em /collab.

export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_SOCKETS_PER_USER = 20;
/** Código de fechamento que faz o cliente reconectar e reautenticar. */
export const CLOSE_REAUTH = 4000;

export interface CollabContext {
  userId: string;
  name: string;
  role: Role;
}

export interface CollabControl {
  /** Derruba as conexões do usuário (todas, ou só de um documento). O cliente reconecta e reautentica. */
  disconnectUser(userId: string, documentId?: string): void;
  /** Derruba todo mundo de um documento (lixeira / exclusão). */
  closeDocument(documentId: string): void;
  /** Estado atual em memória, se o documento estiver aberto. */
  liveState(documentId: string): Uint8Array | null;
  /** Y.Doc em memória, para o servidor escrever nele (restaurar, SPEC-005 §4). */
  liveDocument(documentId: string): Y.Doc | null;
  instance: Hocuspocus<CollabContext>;
}

declare module 'fastify' {
  interface FastifyInstance {
    collab: CollabControl;
  }
}

class Rejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export default fp<{ env: Env }>(async (app, { env }) => {
  const cookieName = sessionCookieName(env);
  const allowedOrigin = new URL(env.APP_URL).origin;
  const socketsPerUser = new Map<string, number>();

  // Versões automáticas (SPEC-005 §4): o servidor guarda uma a cada
  // SNAPSHOT_INTERVAL e quando o último editor sai. Não depende do navegador.
  const snapshotInterval = env.SNAPSHOT_INTERVAL_MINUTES * 60 * 1000;
  interface DocActivity {
    lastSnapshotAt: number;
    dirty: boolean;
    editors: Set<string>;
  }
  const activity = new Map<string, DocActivity>();
  const activityOf = (documentId: string): DocActivity => {
    let entry = activity.get(documentId);
    if (!entry) {
      entry = { lastSnapshotAt: Date.now(), dirty: false, editors: new Set() };
      activity.set(documentId, entry);
    }
    return entry;
  };

  const saveAutoSnapshot = async (documentId: string, state: Uint8Array, entry: DocActivity) => {
    const editorIds = [...entry.editors];
    entry.lastSnapshotAt = Date.now();
    entry.dirty = false;
    entry.editors.clear();
    try {
      await createSnapshot(app.prisma, { documentId, state, kind: 'AUTO', editorIds });
    } catch (err) {
      // Histórico nunca derruba a edição: só registra.
      app.log.error({ err, documentId }, 'versão automática falhou');
    }
  };

  const hocuspocus = new Hocuspocus<CollabContext>({
    name: 'diagram',
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,

    async afterUnloadDocument({ documentName }) {
      const entry = activity.get(documentName);
      activity.delete(documentName);
      if (!entry?.dirty) return;
      const stored = await app.prisma.document.findUnique({
        where: { id: documentName },
        select: { yState: true },
      });
      if (stored?.yState) await saveAutoSnapshot(documentName, new Uint8Array(stored.yState), entry);
    },

    // Roda para cada documento aberto no socket, sempre (não depende de token).
    async onConnect({ requestHeaders, documentName, connectionConfig }) {
      if (requestHeaders.get('origin') !== allowedOrigin) throw new Rejected('forbidden-origin');
      const cookies = app.parseCookie(requestHeaders.get('cookie') ?? '');
      const resolved = await resolveSession(app.prisma, env, cookies[cookieName]);
      if (!resolved) throw new Rejected('unauthenticated');
      if (resolved.user.mustChangePassword) throw new Rejected('password-change-required');

      let role: Role;
      try {
        ({ role } = await assertDocumentAccess(app.prisma, resolved.user.id, documentName, 'VIEWER'));
      } catch {
        throw new Rejected('not-found');
      }
      // VIEWER/COMMENTER: updates descartados no servidor (CLAUDE.md §9).
      connectionConfig.readOnly = !hasRole(role, 'EDITOR');
      const context: CollabContext = { userId: resolved.user.id, name: resolved.user.name, role };
      return context;
    },

    // Nome/id na presença vêm do servidor — ninguém se passa por outro.
    async beforeHandleAwareness({ states, context }) {
      if (!context) return;
      for (const state of states.values()) {
        const user = typeof state.user === 'object' && state.user ? (state.user as Record<string, unknown>) : {};
        // Só campos conhecidos; a cor vai para um `style` no cliente, então só hex.
        const color = typeof user.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(user.color) ? user.color : '#5c7cfa';
        state.user = { id: context.userId, name: context.name, color };
        if (state.selected !== null && (typeof state.selected !== 'string' || state.selected.length > 64)) {
          state.selected = null;
        }
      }
    },

    extensions: [
      new Database({
        fetch: async ({ documentName }) => {
          const doc = await app.prisma.document.findFirst({
            where: { id: documentName, trashedAt: null },
            select: { yState: true },
          });
          return doc?.yState ? new Uint8Array(doc.yState) : null;
        },
        store: async ({ documentName, state, document, lastContext }) => {
          if (state.byteLength > MAX_DOCUMENT_BYTES) {
            app.log.error({ documentId: documentName, bytes: state.byteLength }, 'documento acima do limite — congelado');
            hocuspocus.closeConnections(documentName);
            return;
          }
          // updateMany: não falha se o documento foi apagado nesse meio tempo.
          await app.prisma.document.updateMany({
            where: { id: documentName },
            data: {
              yState: new Uint8Array(state),
              sizeBytes: state.byteLength,
              searchText: extractDocSearchText(document),
              // Tema do documento só para a capa do cartão no painel (SPEC-008 §2.4).
              theme: readStyle(document).theme ?? null,
              lastEditedById: (lastContext as CollabContext | undefined)?.userId ?? undefined,
            },
          });

          // SPEC-005 §4: marca a atividade e guarda a versão do intervalo.
          const entry = activityOf(documentName);
          entry.dirty = true;
          const editorId = (lastContext as CollabContext | undefined)?.userId;
          if (editorId) entry.editors.add(editorId);
          if (Date.now() - entry.lastSnapshotAt >= snapshotInterval) {
            await saveAutoSnapshot(documentName, state, entry);
          }
        },
      }),
    ],
  });

  const connectionsOf = (filter: (c: Connection<CollabContext>, docName: string) => boolean) => {
    const found: Connection<CollabContext>[] = [];
    for (const [name, document] of hocuspocus.documents) {
      for (const connection of document.connections.keys()) {
        if (filter(connection as Connection<CollabContext>, name)) found.push(connection as Connection<CollabContext>);
      }
    }
    return found;
  };

  const control: CollabControl = {
    instance: hocuspocus,
    disconnectUser(userId, documentId) {
      const targets = connectionsOf(
        (c, name) => c.context?.userId === userId && (documentId === undefined || name === documentId),
      );
      // Fecha o socket inteiro: o provider reconecta e passa de novo pelo onConnect.
      for (const c of targets) c.webSocket.close(CLOSE_REAUTH, 'reauth');
    },
    closeDocument(documentId) {
      for (const c of connectionsOf((_c, name) => name === documentId)) c.webSocket.close(CLOSE_REAUTH, 'reauth');
      hocuspocus.closeConnections(documentId);
    },
    liveState(documentId) {
      const doc = hocuspocus.documents.get(documentId);
      return doc ? Y.encodeStateAsUpdate(doc) : null;
    },
    liveDocument(documentId) {
      return hocuspocus.documents.get(documentId) ?? null;
    },
  };
  app.decorate('collab', control);

  await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  app.get('/collab', { websocket: true }, async (socket, request) => {
    // Checagens baratas antes de entregar ao Hocuspocus (CSRF de WebSocket).
    if (request.headers.origin !== allowedOrigin) {
      socket.close(4403, 'forbidden-origin');
      return;
    }
    const auth = request.auth;
    if (!auth || auth.user.mustChangePassword) {
      socket.close(4401, 'unauthenticated');
      return;
    }
    const userId = auth.user.id;
    const current = socketsPerUser.get(userId) ?? 0;
    if (current >= MAX_SOCKETS_PER_USER) {
      socket.close(4429, 'too-many-connections');
      return;
    }
    socketsPerUser.set(userId, current + 1);
    socket.on('close', () => {
      const n = (socketsPerUser.get(userId) ?? 1) - 1;
      if (n <= 0) socketsPerUser.delete(userId);
      else socketsPerUser.set(userId, n);
    });

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }
    const url = new URL(request.url, allowedOrigin);
    const connection = hocuspocus.handleConnection(socket, new Request(url, { headers }));
    // Na v4 quem integra repassa mensagens e fechamento (igual ao adaptador crossws deles).
    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      connection.handleMessage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    });
    socket.on('close', (code: number, reason: Buffer) => {
      connection.handleClose({ code, reason: reason.toString() });
    });
  });

  app.addHook('onClose', async () => {
    hocuspocus.flushPendingStores();
    hocuspocus.closeConnections();
  });
});
