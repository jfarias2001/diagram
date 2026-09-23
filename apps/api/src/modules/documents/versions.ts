import {
  copyVersionBodySchema,
  createVersionBodySchema,
  decodeDoc,
  type DocumentSummary,
  extractDocSearchText,
  idParamSchema,
  listVersionsQuerySchema,
  readStyle,
  renameVersionBodySchema,
  type RestoreResult,
  type VersionList,
  type VersionSummary,
  versionParamsSchema,
} from '@diagram/shared';
import type { FastifyPluginAsync } from 'fastify';
import { audit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/http-error.js';
import { currentUser, requireAuth } from '../auth/plugin.js';
import { assertDocumentAccess } from './access.js';
import { createSnapshot, restoreSnapshot } from './snapshots.js';

// SPEC-005 §3 — histórico de versões.

const PAGE_SIZE = 30;

const summarySelect = {
  id: true,
  kind: true,
  name: true,
  sizeBytes: true,
  editorIds: true,
  createdAt: true,
} as const;

type SnapshotRow = {
  id: string;
  kind: 'AUTO' | 'NAMED' | 'CHECKPOINT';
  name: string | null;
  sizeBytes: number;
  editorIds: string[];
  createdAt: Date;
};

export const versionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth());

  /** Estado mais novo: o da memória, se o documento estiver aberto (debounce). */
  const liveOrStored = async (id: string): Promise<Uint8Array | null> => {
    const live = app.collab.liveState(id);
    if (live) return live;
    const row = await app.prisma.document.findUnique({ where: { id }, select: { yState: true } });
    return row?.yState ? new Uint8Array(row.yState) : null;
  };

  /** Nomes de quem editou. Só nome e id — nunca e-mail (SPEC-005 §6). */
  const toSummaries = async (rows: SnapshotRow[]): Promise<VersionSummary[]> => {
    const ids = [...new Set(rows.flatMap((r) => r.editorIds))];
    const people = ids.length
      ? await app.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(people.map((p) => [p.id, p.name]));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      editors: row.editorIds.flatMap((id) => {
        const name = byId.get(id);
        return name ? [{ id, name }] : [];
      }),
    }));
  };

  /** A versão tem de ser deste documento — trocar o id na URL dá 404. */
  const findVersion = async (documentId: string, versionId: string) => {
    const snapshot = await app.prisma.snapshot.findFirst({
      where: { id: versionId, documentId },
      select: { ...summarySelect, state: true },
    });
    if (!snapshot) throw notFound();
    return snapshot;
  };

  app.get('/documents/:id/versions', async (request): Promise<VersionList> => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const { cursor } = listVersionsQuerySchema.parse(request.query);
    await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');

    const rows = await app.prisma.snapshot.findMany({
      where: { documentId: id },
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = await toSummaries(rows.slice(0, PAGE_SIZE));
    return { items, nextCursor: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null };
  });

  // Conteúdo binário da versão: nunca servido inline (CLAUDE.md §9).
  app.get('/documents/:id/versions/:versionId/content', async (request, reply) => {
    const user = currentUser(request);
    const { id, versionId } = versionParamsSchema.parse(request.params);
    await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    const snapshot = await findVersion(id, versionId);
    return reply
      .type('application/octet-stream')
      .header('Content-Disposition', 'attachment; filename="versao.bin"')
      .header('X-Content-Type-Options', 'nosniff')
      .send(Buffer.from(snapshot.state));
  });

  app.post(
    '/documents/:id/versions',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req) => req.auth?.user.id ?? req.ip,
        },
      },
    },
    async (request, reply): Promise<VersionSummary> => {
      const user = currentUser(request);
      const { id } = idParamSchema.parse(request.params);
      const { kind, name } = createVersionBodySchema.parse(request.body);
      await assertDocumentAccess(app.prisma, user.id, id, 'EDITOR');

      const state = await liveOrStored(id);
      if (!state) throw conflict('EMPTY_DOCUMENT', 'Este documento ainda não tem conteúdo para guardar.');
      const created = await createSnapshot(app.prisma, {
        documentId: id,
        state,
        kind,
        name,
        createdById: user.id,
        editorIds: [user.id],
      });
      if (!created) throw conflict('DOCUMENT_TOO_LARGE', 'O documento está grande demais para guardar uma versão.');
      await audit(app.prisma, {
        action: 'document.version_created',
        actorId: user.id,
        targetId: id,
        meta: { versionId: created.id, kind },
        ip: request.ip,
      });
      const [summary] = await toSummaries([
        { id: created.id, kind, name, sizeBytes: state.byteLength, editorIds: [user.id], createdAt: created.createdAt },
      ]);
      return reply.code(201).send(summary);
    },
  );

  app.post(
    '/documents/:id/versions/:versionId/restore',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req) => req.auth?.user.id ?? req.ip,
        },
      },
    },
    async (request): Promise<RestoreResult> => {
      const user = currentUser(request);
      const { id, versionId } = versionParamsSchema.parse(request.params);
      await assertDocumentAccess(app.prisma, user.id, id, 'EDITOR');
      const snapshot = await findVersion(id, versionId);

      // 1) o estado atual vira uma versão — restaurar nunca perde nada.
      const current = await liveOrStored(id);
      const checkpoint = current
        ? await createSnapshot(app.prisma, {
            documentId: id,
            state: current,
            kind: 'CHECKPOINT',
            name: `Antes de restaurar de ${formatMoment(snapshot.createdAt)}`,
            createdById: user.id,
            editorIds: [user.id],
          })
        : null;

      // 2) o conteúdo da versão entra no documento vivo (ou no banco, se fechado).
      await restoreSnapshot(app.prisma, { liveDocument: (docId) => app.collab.liveDocument(docId) }, id, new Uint8Array(snapshot.state));

      await audit(app.prisma, {
        action: 'document.version_restored',
        actorId: user.id,
        targetId: id,
        meta: { versionId, checkpointId: checkpoint?.id },
        ip: request.ip,
      });
      return { checkpointId: checkpoint?.id ?? '', restoredFrom: versionId };
    },
  );

  app.post('/documents/:id/versions/:versionId/copy', async (request, reply): Promise<DocumentSummary> => {
    const user = currentUser(request);
    const { id, versionId } = versionParamsSchema.parse(request.params);
    const { title } = copyVersionBodySchema.parse(request.body ?? {});
    const { document } = await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    const snapshot = await findVersion(id, versionId);

    const copy = await app.prisma.document.create({
      data: {
        title: (title ?? `${document.title} (de ${formatMoment(snapshot.createdAt)})`).slice(0, 200),
        type: document.type,
        ownerId: user.id,
        yState: Buffer.from(snapshot.state),
        sizeBytes: snapshot.sizeBytes,
        searchText: searchTextOf(snapshot.state),
        // A cópia nasce com o tema daquela versão (SPEC-008 §2.4).
        theme: themeOf(snapshot.state),
        lastEditedById: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
      select: {
        id: true,
        title: true,
        type: true,
        updatedAt: true,
        trashedAt: true,
        owner: { select: { id: true, name: true } },
      },
    });
    return reply.code(201).send({
      id: copy.id,
      title: copy.title,
      type: copy.type,
      myRole: 'OWNER',
      owner: copy.owner,
      updatedAt: copy.updatedAt.toISOString(),
      trashedAt: null,
    });
  });

  app.patch('/documents/:id/versions/:versionId', async (request): Promise<VersionSummary> => {
    const user = currentUser(request);
    const { id, versionId } = versionParamsSchema.parse(request.params);
    const { name } = renameVersionBodySchema.parse(request.body);
    await assertDocumentAccess(app.prisma, user.id, id, 'OWNER');
    const snapshot = await findVersion(id, versionId);
    if (snapshot.kind !== 'NAMED') {
      throw conflict('VERSION_NOT_NAMED', 'Só versões salvas com nome podem ser renomeadas.');
    }
    const updated = await app.prisma.snapshot.update({
      where: { id: versionId },
      data: { name },
      select: summarySelect,
    });
    const [summary] = await toSummaries([updated]);
    return summary as VersionSummary;
  });

  app.delete('/documents/:id/versions/:versionId', async (request, reply) => {
    const user = currentUser(request);
    const { id, versionId } = versionParamsSchema.parse(request.params);
    await assertDocumentAccess(app.prisma, user.id, id, 'OWNER');
    const snapshot = await findVersion(id, versionId);
    if (snapshot.kind !== 'NAMED') {
      throw conflict('VERSION_NOT_NAMED', 'Só versões salvas com nome podem ser apagadas.');
    }
    await app.prisma.snapshot.delete({ where: { id: versionId } });
    await audit(app.prisma, {
      action: 'document.version_deleted',
      actorId: user.id,
      targetId: id,
      meta: { versionId },
      ip: request.ip,
    });
    return reply.code(204).send();
  });
};

/** "21/09 às 14:30" — o mesmo texto que a faixa do editor mostra. */
function formatMoment(at: Date): string {
  const date = at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const time = at.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  return `${date} às ${time}`;
}

/** Texto da versão para a busca do painel, lido do próprio estado. */
function searchTextOf(state: Uint8Array | Buffer): string {
  return extractDocSearchText(decodeDoc(new Uint8Array(state)));
}

/** Tema da versão, para a capa do cartão da cópia (SPEC-008 §2.4). */
function themeOf(state: Uint8Array | Buffer): string | null {
  return readStyle(decodeDoc(new Uint8Array(state))).theme ?? null;
}
