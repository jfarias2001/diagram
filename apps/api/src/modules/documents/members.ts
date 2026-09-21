import {
  addMemberBodySchema,
  type DocumentMemberView,
  idParamSchema,
  memberParamsSchema,
  updateMemberBodySchema,
} from '@diagram/shared';
import type { FastifyPluginAsync } from 'fastify';
import { audit } from '../../lib/audit.js';
import { conflict, forbidden, HttpError, notFound } from '../../lib/http-error.js';
import { currentUser, requireAuth } from '../auth/plugin.js';
import { assertDocumentAccess } from './access.js';

// SPEC-001 §3.4 — compartilhamento digitando o e-mail.

export const memberRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth());

  app.get('/documents/:id/members', async (request): Promise<{ items: DocumentMemberView[] }> => {
    const user = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    await assertDocumentAccess(app.prisma, user.id, id, 'VIEWER');
    const members = await app.prisma.documentMember.findMany({
      where: { documentId: id },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      items: members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
    };
  });

  app.post(
    '/documents/:id/members',
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
      const { id } = idParamSchema.parse(request.params);
      const { email, role } = addMemberBodySchema.parse(request.body);
      await assertDocumentAccess(app.prisma, user.id, id, 'OWNER');

      const target = await app.prisma.user.findUnique({ where: { email } });
      if (!target || !target.active) {
        throw new HttpError(404, 'USER_NOT_FOUND', 'Nenhum colaborador ativo com este e-mail.');
      }
      const existing = await app.prisma.documentMember.findUnique({
        where: { documentId_userId: { documentId: id, userId: target.id } },
      });
      if (existing) throw conflict('ALREADY_MEMBER', 'Esta pessoa já tem acesso ao documento.');

      await app.prisma.documentMember.create({
        data: { documentId: id, userId: target.id, role, addedById: user.id },
      });
      await audit(app.prisma, {
        action: 'document.shared',
        actorId: user.id,
        targetId: id,
        meta: { userId: target.id, role },
        ip: request.ip,
      });
      const view: DocumentMemberView = { userId: target.id, name: target.name, email: target.email, role };
      return reply.code(201).send(view);
    },
  );

  app.patch('/documents/:id/members/:userId', async (request) => {
    const user = currentUser(request);
    const { id, userId } = memberParamsSchema.parse(request.params);
    const { role } = updateMemberBodySchema.parse(request.body);
    await assertDocumentAccess(app.prisma, user.id, id, 'OWNER');

    const member = await app.prisma.documentMember.findUnique({
      where: { documentId_userId: { documentId: id, userId } },
    });
    if (!member) throw notFound();
    if (member.role === 'OWNER') throw conflict('OWNER_ROLE_FIXED', 'O papel do dono não pode ser alterado.');

    await app.prisma.documentMember.update({ where: { documentId_userId: { documentId: id, userId } }, data: { role } });
    // Reconecta com o papel novo (ex.: Editor → Leitor vira somente leitura na hora).
    app.collab.disconnectUser(userId, id);
    await audit(app.prisma, {
      action: 'document.member_updated',
      actorId: user.id,
      targetId: id,
      meta: { userId, role },
      ip: request.ip,
    });
    return { userId, role };
  });

  app.delete('/documents/:id/members/:userId', async (request, reply) => {
    const user = currentUser(request);
    const { id, userId } = memberParamsSchema.parse(request.params);
    const leaving = userId === user.id;
    const { role } = await assertDocumentAccess(app.prisma, user.id, id, leaving ? 'VIEWER' : 'OWNER');

    if (leaving && role === 'OWNER') {
      throw forbidden('OWNER_CANNOT_LEAVE', 'O dono não pode sair do próprio documento.');
    }
    const removed = await app.prisma.documentMember.deleteMany({
      where: { documentId: id, userId, role: { not: 'OWNER' } },
    });
    if (removed.count === 0) throw notFound();

    app.collab.disconnectUser(userId, id);
    await audit(app.prisma, { action: 'document.unshared', actorId: user.id, targetId: id, meta: { userId }, ip: request.ip });
    return reply.code(204).send();
  });
};
