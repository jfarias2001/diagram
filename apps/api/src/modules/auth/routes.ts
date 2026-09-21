import { changePasswordBodySchema, loginBodySchema, type Me } from '@diagram/shared';
import type { User } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import type { Env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import { hashPassword, verifyDummy, verifyPassword } from '../../lib/crypto.js';
import { HttpError } from '../../lib/http-error.js';
import { currentUser, requireAuth } from './plugin.js';
import { createSession, sessionCookieName, sessionCookieOptions } from './session.js';

export const MAX_FAILED_LOGINS = 10;
export const LOCK_MS = 15 * 60 * 1000;

const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');

export const toMe = (user: User): Me => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  mustChangePassword: user.mustChangePassword,
});

export const authRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const cookieName = sessionCookieName(env);

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { email, password } = loginBodySchema.parse(request.body);
      const user = await app.prisma.user.findUnique({ where: { email } });

      if (!user) {
        await verifyDummy(password);
        await audit(app.prisma, { action: 'auth.login_failed', meta: { reason: 'unknown_email' }, ip: request.ip });
        throw invalidCredentials();
      }

      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        throw new HttpError(423, 'ACCOUNT_LOCKED', 'Muitas tentativas. Tente de novo em alguns minutos.');
      }

      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok || !user.active) {
        if (user.active) {
          const failed = user.failedLoginCount + 1;
          const lock = failed >= MAX_FAILED_LOGINS;
          await app.prisma.user.update({
            where: { id: user.id },
            data: lock
              ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
              : { failedLoginCount: failed },
          });
          if (lock) await audit(app.prisma, { action: 'auth.locked', targetId: user.id, ip: request.ip });
        }
        await audit(app.prisma, { action: 'auth.login_failed', targetId: user.id, ip: request.ip });
        throw invalidCredentials();
      }

      const updated = await app.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      const { token, expiresAt } = await createSession(app.prisma, env, user.id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      await audit(app.prisma, { action: 'auth.login', actorId: user.id, ip: request.ip });
      reply.setCookie(cookieName, token, sessionCookieOptions(env, expiresAt));
      return { user: toMe(updated) };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    if (request.auth) {
      await app.prisma.session.deleteMany({ where: { id: request.auth.session.id } });
      await audit(app.prisma, { action: 'auth.logout', actorId: request.auth.user.id, ip: request.ip });
    }
    // Mesmos atributos do set: sem `Secure`, o navegador ignora a remoção de um cookie __Host-.
    const { expires: _expires, ...cookieOptions } = sessionCookieOptions(env, new Date(0));
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireAuth({ allowPasswordChange: true }) }, async (request) =>
    toMe(currentUser(request)),
  );

  app.post(
    '/auth/change-password',
    {
      preHandler: requireAuth({ allowPasswordChange: true }),
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const user = currentUser(request);
      const { currentPassword, newPassword } = changePasswordBodySchema.parse(request.body);

      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new HttpError(400, 'WRONG_PASSWORD', 'A senha atual está incorreta.');
      }
      if (newPassword.toLowerCase() === user.email) {
        throw new HttpError(400, 'WEAK_PASSWORD', 'A senha não pode ser igual ao e-mail.');
      }
      if (newPassword === currentPassword) {
        throw new HttpError(400, 'SAME_PASSWORD', 'A nova senha precisa ser diferente da atual.');
      }

      const updated = await app.prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
        });
        // Derruba as outras sessões (SPEC-001 §3.1); a atual continua.
        await tx.session.deleteMany({ where: { userId: user.id, id: { not: request.auth!.session.id } } });
        return u;
      });
      app.collab.disconnectUser(user.id);
      await audit(app.prisma, { action: 'auth.password_changed', actorId: user.id, ip: request.ip });
      return { user: toMe(updated) };
    },
  );
};
