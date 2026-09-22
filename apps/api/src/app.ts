import Fastify from 'fastify';
import collab from './collab/plugin.js';
import type { Env } from './config/env.js';
import { adminRoutes } from './modules/admin/routes.js';
import { seedFirstAdmin } from './modules/admin/seed.js';
import auth from './modules/auth/plugin.js';
import { authRoutes } from './modules/auth/routes.js';
import { memberRoutes } from './modules/documents/members.js';
import { purgeTrash } from './modules/documents/purge.js';
import { documentRoutes } from './modules/documents/routes.js';
import { pruneSnapshots } from './modules/documents/snapshots.js';
import { versionRoutes } from './modules/documents/versions.js';
import { folderRoutes } from './modules/folders/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import db from './plugins/db.js';
import errors from './plugins/errors.js';
import security from './plugins/security.js';

const HOUR = 60 * 60 * 1000;

export async function buildApp(env: Env, options: { jobs?: boolean } = {}) {
  const app = Fastify({
    // Só o último salto (Traefik) é confiável. `true` aceitaria um
    // X-Forwarded-For forjado pelo cliente e furaria o rate limit por IP.
    trustProxy: (_address: string, hop: number) => hop === 0,
    bodyLimit: 1024 * 1024,
    logger: {
      level: env.LOG_LEVEL,
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.temporaryPassword',
      ],
    },
  });

  await app.register(errors);
  await app.register(security, { env });
  await app.register(db, { env });
  await app.register(auth, { env });
  await app.register(collab, { env });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(authRoutes, { env });
      await v1.register(adminRoutes, { env });
      await v1.register(documentRoutes);
      await v1.register(memberRoutes);
      await v1.register(versionRoutes);
      await v1.register(folderRoutes);
    },
    { prefix: '/api/v1' },
  );

  app.addHook('onReady', async () => {
    await seedFirstAdmin(app.prisma, env, app.log);
  });

  if (options.jobs ?? true) {
    // Lixeira e retenção do histórico (SPEC-005 §3.4) no mesmo timer horário.
    const runJobs = () => {
      purgeTrash(app.prisma, env.TRASH_RETENTION_DAYS).catch((err) => app.log.error({ err }, 'purga da lixeira falhou'));
      pruneSnapshots(app.prisma, Date.now(), {
        retentionDays: env.SNAPSHOT_RETENTION_DAYS,
        dailyAfterDays: env.SNAPSHOT_DAILY_AFTER_DAYS,
      }).catch((err) => app.log.error({ err }, 'retenção do histórico falhou'));
    };
    let timer: NodeJS.Timeout | undefined;
    app.addHook('onReady', async () => {
      timer = setInterval(runJobs, HOUR);
      timer.unref();
    });
    app.addHook('onClose', async () => clearInterval(timer));
  }

  return app;
}
