import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';
import type { Env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp<{ env: Env }>(async (app, { env }) => {
  // Conexão preguiçosa: a API sobe mesmo com o banco fora, e o /health
  // responde 503 em vez de o container entrar em loop de crash.
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: ['warn', 'error'] });
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
