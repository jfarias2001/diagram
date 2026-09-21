/**
 * Postgres local sem Docker: PGlite (Postgres compilado para WebAssembly)
 * exposto via protocolo TCP do Postgres. Só para dev e testes — produção usa
 * o Postgres do docker-compose.
 *
 *   pnpm db:local                      -> dados em apps/api/.pglite (persistente)
 *   PGLITE_DIR=memory:// pnpm db:local -> em memória
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export async function startPglite(options: { dataDir?: string; port?: number } = {}) {
  const db = await PGlite.create(options.dataDir ?? 'memory://');
  const server = new PGLiteSocketServer({ db, port: options.port ?? 0, host: '127.0.0.1', maxConnections: 20 });
  await server.start();
  const address = server.getServerConn();
  return {
    url: `postgresql://postgres:postgres@${address}/postgres?sslmode=disable&connection_limit=5&pgbouncer=true`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/pglite-server.ts');
if (isMain) {
  const dataDir = process.env.PGLITE_DIR ?? './.pglite';
  const port = Number(process.env.PGLITE_PORT ?? 5432);
  const { url, stop } = await startPglite({ dataDir, port });
  console.warn(`PGlite rodando. DATABASE_URL=${url}`);
  const shutdown = async () => {
    await stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}
