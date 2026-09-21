import type { Session, User } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../../config/env.js';
import { forbidden, unauthorized } from '../../lib/http-error.js';
import { resolveSession, sessionCookieName } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: { user: User; session: Session } | null;
  }
}

/** Resolve a sessão em toda requisição; as rotas decidem se exigem login. */
export default fp<{ env: Env }>(async (app, { env }) => {
  const cookieName = sessionCookieName(env);
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    request.auth = await resolveSession(app.prisma, env, request.cookies[cookieName]);
  });
});

/**
 * preHandler: exige login. Com `allowPasswordChange`, deixa passar quem ainda
 * precisa trocar a senha provisória (só as rotas de /auth usam isso).
 */
export function requireAuth(options: { allowPasswordChange?: boolean } = {}) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.auth) throw unauthorized();
    if (request.auth.user.mustChangePassword && !options.allowPasswordChange) {
      throw forbidden('PASSWORD_CHANGE_REQUIRED', 'Troque sua senha provisória para continuar.');
    }
  };
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth()(request, reply);
  if (request.auth?.user.role !== 'ADMIN') throw forbidden();
}

/** Usuário da requisição (só chamar depois de requireAuth). */
export function currentUser(request: FastifyRequest): User {
  if (!request.auth) throw unauthorized();
  return request.auth.user;
}
