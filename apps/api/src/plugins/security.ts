import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Proteções de base (CLAUDE.md §9). A API só serve JSON, então a CSP aqui é
 * a mais restrita possível; a CSP do app fica no nginx do `web`.
 */
export default fp<{ env: Env }>(async (app, { env }) => {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

  await app.register(cookie, { secret: env.SESSION_SECRET });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) =>
      new HttpError(context.statusCode, 'RATE_LIMITED', 'Muitas tentativas. Aguarde um pouco e tente de novo.'),
  });

  // CSRF: métodos que alteram estado precisam vir da nossa própria origem.
  const allowedOrigin = new URL(env.APP_URL).origin;
  app.addHook('onRequest', async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== allowedOrigin) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origem não permitida.' } });
    }
  });
});
