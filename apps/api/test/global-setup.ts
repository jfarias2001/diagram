import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { TestProject } from 'vitest/node';
import { startPglite } from '../scripts/pglite-server.js';

const run = promisify(exec);

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Sobe um Postgres em memória (PGlite) e aplica as migrations de verdade.
 * Sem Docker. Se TEST_DATABASE_URL estiver definido, usa esse banco — que é
 * ZERADO com `migrate reset`, então nunca aponte para um banco com dados.
 */
export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL;
  const pg = external ? null : await startPglite();
  const url = external ?? pg!.url;

  const command = external ? 'npx prisma migrate reset --force --skip-generate' : 'npx prisma migrate deploy';
  // Assíncrono de propósito: o PGlite roda neste mesmo processo.
  await run(command, { env: { ...process.env, DATABASE_URL: url } });

  project.provide('databaseUrl', url);
  return async () => {
    await pg?.stop();
  };
}
