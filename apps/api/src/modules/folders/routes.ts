import {
  addFolderMemberBodySchema,
  createFolderBodySchema,
  folderMemberParamsSchema,
  folderParamsSchema,
  type FolderTree,
  type FolderView,
  idParamSchema,
  setDocumentFolderBodySchema,
  updateFolderBodySchema,
  updateFolderMemberBodySchema,
} from '@diagram/shared';
import type { FastifyPluginAsync } from 'fastify';
import { audit } from '../../lib/audit.js';
import { currentUser, requireAuth } from '../auth/plugin.js';
import { assertDocumentAccess } from '../documents/access.js';
import {
  addFolderMember,
  createFolder,
  deleteFolder,
  listFolderMembers,
  listFolders,
  removeFolderMember,
  setPersonalFolder,
  setSharedFolder,
  updateFolder,
  updateFolderMember,
} from './service.js';

// SPEC-004 §3 — pastas. As rotas só traduzem HTTP; a regra fica no service.

export const folderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth());

  app.get('/folders', async (request): Promise<FolderTree> => {
    const user = currentUser(request);
    return listFolders(app.prisma, user.id);
  });

  app.post('/folders', async (request, reply): Promise<FolderView> => {
    const user = currentUser(request);
    const body = createFolderBodySchema.parse(request.body);
    const folder = await createFolder(app.prisma, user.id, {
      kind: body.kind,
      name: body.name,
      parentId: body.parentId ?? null,
    });
    await audit(app.prisma, {
      action: 'folder.created',
      actorId: user.id,
      targetId: folder.id,
      meta: { kind: folder.kind },
      ip: request.ip,
    });
    return reply.code(201).send(folder);
  });

  app.patch('/folders/:id', async (request): Promise<FolderView> => {
    const user = currentUser(request);
    const { id } = folderParamsSchema.parse(request.params);
    const body = updateFolderBodySchema.parse(request.body);
    const folder = await updateFolder(app.prisma, user.id, id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.parentId !== undefined ? { parentId: body.parentId ?? null } : {}),
    });
    await audit(app.prisma, {
      action: body.parentId !== undefined ? 'folder.moved' : 'folder.renamed',
      actorId: user.id,
      targetId: id,
      ip: request.ip,
    });
    return folder;
  });

  app.delete('/folders/:id', async (request, reply) => {
    const user = currentUser(request);
    const { id } = folderParamsSchema.parse(request.params);
    const affected = await deleteFolder(app.prisma, user.id, id);
    // Quem só tinha acesso pela pasta perde na hora, inclusive com o documento aberto.
    for (const documentId of affected) app.collab.closeDocument(documentId);
    await audit(app.prisma, {
      action: 'folder.deleted',
      actorId: user.id,
      targetId: id,
      meta: { documents: affected.length },
      ip: request.ip,
    });
    return reply.code(204).send();
  });

  // ---------- membros ----------

  app.get('/folders/:id/members', async (request) => {
    const user = currentUser(request);
    const { id } = folderParamsSchema.parse(request.params);
    return { items: await listFolderMembers(app.prisma, user.id, id) };
  });

  app.post(
    '/folders/:id/members',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (req) => req.auth?.user.id ?? req.ip,
        },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const { id } = folderParamsSchema.parse(request.params);
      const body = addFolderMemberBodySchema.parse(request.body);
      const member = await addFolderMember(app.prisma, user.id, id, body);
      // Já pode estar com algum documento da pasta aberto: reconecta com o papel novo.
      app.collab.disconnectUser(member.userId);
      await audit(app.prisma, {
        action: 'folder.member_added',
        actorId: user.id,
        targetId: id,
        meta: { userId: member.userId, role: member.role },
        ip: request.ip,
      });
      return reply.code(201).send(member);
    },
  );

  app.patch('/folders/:id/members/:userId', async (request) => {
    const user = currentUser(request);
    const { id, userId } = folderMemberParamsSchema.parse(request.params);
    const { role } = updateFolderMemberBodySchema.parse(request.body);
    await updateFolderMember(app.prisma, user.id, id, userId, role);
    app.collab.disconnectUser(userId);
    await audit(app.prisma, {
      action: 'folder.member_updated',
      actorId: user.id,
      targetId: id,
      meta: { userId, role },
      ip: request.ip,
    });
    return { userId, role };
  });

  app.delete('/folders/:id/members/:userId', async (request, reply) => {
    const user = currentUser(request);
    const { id, userId } = folderMemberParamsSchema.parse(request.params);
    await removeFolderMember(app.prisma, user.id, id, userId);
    app.collab.disconnectUser(userId);
    await audit(app.prisma, {
      action: 'folder.member_removed',
      actorId: user.id,
      targetId: id,
      meta: { userId },
      ip: request.ip,
    });
    return reply.code(204).send();
  });

  // ---------- documento ↔ pasta ----------

  app.put('/documents/:id/personal-folder', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const { folderId } = setDocumentFolderBodySchema.parse(request.body);
    // Qualquer papel no documento basta: a pasta pessoal é só minha.
    await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    await setPersonalFolder(app.prisma, user.id, id, folderId);
    return reply.code(204).send();
  });

  app.put('/documents/:id/shared-folder', async (request, reply) => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const { folderId } = setDocumentFolderBodySchema.parse(request.body);
    const { document } = await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    await setSharedFolder(app.prisma, user.id, { id, ownerId: document.ownerId }, folderId);
    // Sair ou trocar de pasta tira o acesso herdado na hora (PRD-004 §5.17).
    app.collab.closeDocument(id);
    await audit(app.prisma, {
      action: 'document.folder_changed',
      actorId: user.id,
      targetId: id,
      meta: { folderId },
      ip: request.ip,
    });
    return reply.code(204).send();
  });
};
