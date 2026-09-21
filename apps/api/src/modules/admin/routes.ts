import { type AdminUser, createUserBodySchema, idParamSchema, updateUserBodySchema } from '@diagram/shared';
import type { User } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import { generateTemporaryPassword, hashPassword } from '../../lib/crypto.js';
import { conflict, HttpError, notFound } from '../../lib/http-error.js';
import { currentUser, requireAdmin } from '../auth/plugin.js';

// SPEC-001 §3.2 — gestão manual de acessos (somente ADMIN).

const toAdminUser = (u: User): AdminUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

export function isEmailDomainAllowed(email: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && allowed.includes(domain);
}

export const adminRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/admin/users', async (request) => {
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(request.query);
    const users = await app.prisma.user.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      take: 500,
    });
    return { items: users.map(toAdminUser) };
  });

  app.post('/admin/users', async (request, reply) => {
    const admin = currentUser(request);
    const body = createUserBodySchema.parse(request.body);
    if (!isEmailDomainAllowed(body.email, env.ALLOWED_EMAIL_DOMAINS)) {
      throw new HttpError(400, 'EMAIL_DOMAIN_NOT_ALLOWED', 'Domínio de e-mail não permitido.');
    }
    if (await app.prisma.user.findUnique({ where: { email: body.email } })) {
      throw conflict('EMAIL_TAKEN', 'Já existe um acesso com este e-mail.');
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = await app.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
      },
    });
    await audit(app.prisma, { action: 'user.created', actorId: admin.id, targetId: user.id, meta: { role: user.role }, ip: request.ip });
    // A senha provisória só aparece nesta resposta e nunca é logada.
    return reply.code(201).send({ user: toAdminUser(user), temporaryPassword });
  });

  app.patch('/admin/users/:id', async (request) => {
    const admin = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const body = updateUserBodySchema.parse(request.body);
    const target = await app.prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound();

    const losesAdmin = target.role === 'ADMIN' && (body.role === 'MEMBER' || body.active === false);
    if (target.id === admin.id && losesAdmin) {
      throw conflict('SELF_LOCKOUT', 'Você não pode remover o próprio acesso de administrador.');
    }
    if (losesAdmin && target.active) {
      const otherAdmins = await app.prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: id } } });
      if (otherAdmins === 0) throw conflict('LAST_ADMIN', 'Precisa existir pelo menos um administrador ativo.');
    }

    const updated = await app.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: body });
      if (body.active === false) await tx.session.deleteMany({ where: { userId: id } });
      return u;
    });
    if (body.active === false) app.collab.disconnectUser(id);
    await audit(app.prisma, {
      action: body.active === false ? 'user.deactivated' : 'user.updated',
      actorId: admin.id,
      targetId: id,
      meta: { fields: Object.keys(body) },
      ip: request.ip,
    });
    return { user: toAdminUser(updated) };
  });

  app.post('/admin/users/:id/reset-password', async (request) => {
    const admin = currentUser(request);
    const { id } = idParamSchema.parse(request.params);
    const target = await app.prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound();

    const temporaryPassword = generateTemporaryPassword();
    await app.prisma.$transaction([
      app.prisma.user.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      app.prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    app.collab.disconnectUser(id);
    await audit(app.prisma, { action: 'user.password_reset', actorId: admin.id, targetId: id, ip: request.ip });
    return { temporaryPassword };
  });
};
