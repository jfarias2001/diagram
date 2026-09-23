import {
  createDiagramDoc,
  createDocumentBodySchema,
  createMindMapDoc,
  type DocumentList,
  type DocumentSummary,
  duplicateDocumentBodySchema,
  encodeDoc,
  idParamSchema,
  listDocumentsQuerySchema,
  THEME_IDS,
  type ThemeId,
  updateDocumentBodySchema,
} from '@diagram/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { audit } from '../../lib/audit.js';
import { HttpError } from '../../lib/http-error.js';
import { currentUser, requireAuth } from '../auth/plugin.js';
import { assertFolderAccess } from '../folders/access.js';
import { assertDocumentAccess } from './access.js';

// SPEC-001 §3.3.

const PAGE_SIZE = 50;

const summarySelect = (userId: string) =>
  ({
    id: true,
    title: true,
    type: true,
    theme: true,
    updatedAt: true,
    trashedAt: true,
    owner: { select: { id: true, name: true } },
    members: { where: { userId }, select: { role: true } },
    // Pasta do documento para mim (SPEC-004 §3.3): a compartilhada que eu enxergo,
    // senão a minha pessoal.
    sharedFolder: {
      select: {
        id: true,
        name: true,
        kind: true,
        root: { select: { ownerId: true, members: { where: { userId }, select: { userId: true } } } },
      },
    },
    placements: { where: { userId }, select: { folder: { select: { id: true, name: true, kind: true } } } },
  }) satisfies Prisma.DocumentSelect;

export const documentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth());

  app.get('/documents', async (request): Promise<DocumentList> => {
    const user = currentUser(request);
    const { scope, q, cursor, type, folder } = listDocumentsQuerySchema.parse(request.query);

    // Documento que chega até mim por uma pasta compartilhada (SPEC-004 §2.3).
    const viaSharedFolder: Prisma.DocumentWhereInput = {
      sharedFolder: { root: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] } },
    };
    const membership: Prisma.DocumentMemberWhereInput =
      scope === 'shared' ? { userId: user.id, role: { not: 'OWNER' } } : { userId: user.id, role: 'OWNER' };

    // Dentro de uma pasta, vale tudo que eu enxergo; fora dela, a aba escolhida.
    const reach: Prisma.DocumentWhereInput = folder
      ? { OR: [{ members: { some: { userId: user.id } } }, viaSharedFolder] }
      : scope === 'shared'
        ? { OR: [{ members: { some: membership } }, { AND: [viaSharedFolder, { ownerId: { not: user.id } }] }] }
        : { members: { some: membership } };

    const where: Prisma.DocumentWhereInput = {
      ...reach,
      ...(folder ? await folderFilter(app.prisma, user.id, folder) : {}),
      trashedAt: scope === 'trash' ? { not: null } : null,
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { searchText: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await app.prisma.document.findMany({
      where,
      select: summarySelect(user.id),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const items: DocumentSummary[] = rows.slice(0, PAGE_SIZE).map((d) => toSummary(d, user.id));
    return { items, nextCursor: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null };
  });

  app.post('/documents', async (request, reply) => {
    const user = currentUser(request);
    const { title, type } = createDocumentBodySchema.parse(request.body);
    // SPEC-003 §3: fluxograma nasce como um quadro vazio.
    const state = encodeDoc(type === 'DIAGRAM' ? createDiagramDoc() : createMindMapDoc(title));
    const doc = await app.prisma.document.create({
      data: {
        title,
        type,
        ownerId: user.id,
        yState: Buffer.from(state),
        sizeBytes: state.byteLength,
        searchText: title,
        lastEditedById: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
      select: summarySelect(user.id),
    });
    return reply.code(201).send(toSummary(doc, user.id));
  });

  app.get('/documents/:id', async (request) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    const doc = await app.prisma.document.findUniqueOrThrow({ where: { id }, select: summarySelect(user.id) });
    return toSummary(doc, user.id);
  });

  app.patch('/documents/:id', async (request) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const { title } = updateDocumentBodySchema.parse(request.body);
    await assertDocumentAccess(app.prisma, user.id, id, 'EDITOR');
    const doc = await app.prisma.document.update({ where: { id }, data: { title }, select: summarySelect(user.id) });
    return toSummary(doc, user.id);
  });

  app.post('/documents/:id/duplicate', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const body = duplicateDocumentBodySchema.parse(request.body ?? {});
    const { document } = await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    const source = await app.prisma.document.findUniqueOrThrow({
      where: { id },
      select: { yState: true, searchText: true, type: true, theme: true },
    });
    // Se o mapa está aberto, o estado em memória pode estar à frente do banco (debounce).
    const live = app.collab.liveState(id);
    const state = live ? Buffer.from(live) : source.yState;
    const title = body.title ?? `${document.title} (cópia)`.slice(0, 200);
    const copy = await app.prisma.document.create({
      data: {
        title,
        type: source.type,
        ownerId: user.id,
        yState: state,
        sizeBytes: state?.byteLength ?? 0,
        searchText: source.searchText,
        theme: source.theme,
        lastEditedById: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
      select: summarySelect(user.id),
    });
    return reply.code(201).send(toSummary(copy, user.id));
  });

  app.post('/documents/:id/trash', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    await assertDocumentAccess(app.prisma, user.id, id, 'OWNER');
    await app.prisma.document.update({ where: { id }, data: { trashedAt: new Date() } });
    app.collab.closeDocument(id);
    await audit(app.prisma, { action: 'document.trashed', actorId: user.id, targetId: id, ip: request.ip });
    return reply.code(204).send();
  });

  app.post('/documents/:id/restore', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    await assertDocumentAccess(app.prisma, user.id, id, 'OWNER', { allowTrashed: true });
    await app.prisma.document.update({ where: { id }, data: { trashedAt: null } });
    await audit(app.prisma, { action: 'document.restored', actorId: user.id, targetId: id, ip: request.ip });
    return reply.code(204).send();
  });

  app.delete('/documents/:id', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const { document } = await assertDocumentAccess(app.prisma, user.id, id, 'OWNER', { allowTrashed: true });
    if (!document.trashedAt) {
      throw new HttpError(409, 'NOT_IN_TRASH', 'Mova o documento para a lixeira antes de apagar.');
    }
    app.collab.closeDocument(id);
    await app.prisma.document.delete({ where: { id } });
    await audit(app.prisma, { action: 'document.deleted', actorId: user.id, targetId: id, ip: request.ip });
    return reply.code(204).send();
  });
};

/**
 * Filtro de pasta (SPEC-004 §3.3). `none` = sem pasta nenhuma minha. Pasta que
 * não é minha nem compartilhada comigo dá 404, sem revelar que existe.
 */
async function folderFilter(
  prisma: FastifyInstance['prisma'],
  userId: string,
  folder: string,
): Promise<Prisma.DocumentWhereInput> {
  if (folder === 'none') {
    return { sharedFolderId: null, placements: { none: { userId } } };
  }
  const { folder: row } = await assertFolderAccess(prisma, userId, folder, 'VIEWER');
  return row.kind === 'PERSONAL'
    ? { placements: { some: { userId, folderId: row.id } } }
    : { sharedFolderId: row.id };
}

type SummaryRow = {
  id: string;
  title: string;
  type: 'MINDMAP' | 'DIAGRAM';
  updatedAt: Date;
  trashedAt: Date | null;
  owner: { id: string; name: string };
  theme: string | null;
  members: { role: DocumentSummary['myRole'] }[];
  sharedFolder: {
    id: string;
    name: string;
    kind: 'PERSONAL' | 'SHARED';
    root: { ownerId: string; members: { userId: string }[] };
  } | null;
  placements: { folder: { id: string; name: string; kind: 'PERSONAL' | 'SHARED' } }[];
};

/** A pasta compartilhada só aparece para quem participa dela. */
function folderOf(d: SummaryRow, userId: string): DocumentSummary['folder'] {
  const shared = d.sharedFolder;
  if (shared && (shared.root.ownerId === userId || shared.root.members.length > 0)) {
    return { id: shared.id, name: shared.name, kind: shared.kind };
  }
  const personal = d.placements[0]?.folder;
  return personal ? { id: personal.id, name: personal.name, kind: personal.kind } : null;
}

function toSummary(d: SummaryRow, userId: string): DocumentSummary {
  return {
    id: d.id,
    title: d.title,
    type: d.type,
    myRole: d.members[0]?.role ?? 'VIEWER',
    owner: d.owner,
    updatedAt: d.updatedAt.toISOString(),
    trashedAt: d.trashedAt?.toISOString() ?? null,
    folder: folderOf(d, userId),
    // A coluna é derivada do documento, mas quem lê não confia nela (SPEC-008 §3).
    theme: (THEME_IDS as readonly string[]).includes(d.theme ?? '') ? (d.theme as ThemeId) : null,
  };
}
