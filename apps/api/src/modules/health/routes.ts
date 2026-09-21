import type { HealthResponse } from '@diagram/shared';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      const body: HealthResponse = { status: 'ok', db: 'ok' };
      return body;
    } catch (err) {
      app.log.error({ err }, 'health: banco indisponível');
      const body: HealthResponse = { status: 'degraded', db: 'error' };
      return reply.code(503).send(body);
    }
  });
};
