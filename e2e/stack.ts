/**
 * Sobe a pilha completa para o E2E, sem Docker:
 * PGlite (em memória) + migrations + API (porta 3199) + Vite (porta 5199).
 */
import { exec, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildApp } from '../apps/api/src/app.js';
import { loadEnv } from '../apps/api/src/config/env.js';
import { startPglite } from '../apps/api/scripts/pglite-server.js';

const run = promisify(exec);
const root = resolve(import.meta.dirname, '..');
const WEB_PORT = 5199;
const API_PORT = 3199;

const pg = await startPglite();
await run('npx prisma migrate deploy', {
  cwd: resolve(root, 'apps/api'),
  env: { ...process.env, DATABASE_URL: pg.url },
});

const env = loadEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  DATABASE_URL: pg.url,
  APP_URL: `http://localhost:${WEB_PORT}`,
  SESSION_SECRET: 'e2e-'.repeat(10),
  SEED_ADMIN_EMAIL: 'admin@paglamp.com.br',
  SEED_ADMIN_NAME: 'Admin Paglamp',
  SEED_ADMIN_PASSWORD: 'senha-admin-e2e',
  LOGIN_RATE_LIMIT_MAX: '1000',
});
const app = await buildApp(env, { jobs: false });
await app.listen({ port: API_PORT, host: '127.0.0.1' });

const vite = spawn('pnpm', ['exec', 'vite', '--port', String(WEB_PORT), '--strictPort', '--host', 'localhost'], {
  cwd: resolve(root, 'apps/web'),
  env: { ...process.env, VITE_DEV_API_URL: `http://127.0.0.1:${API_PORT}` },
  stdio: 'inherit',
  shell: true,
});

const stop = async () => {
  vite.kill();
  await app.close();
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
