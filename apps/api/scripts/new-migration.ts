/**
 * Cria uma migration nova comparando o banco local (já com as migrations
 * aplicadas) com o schema.prisma. Substitui o `prisma migrate dev`, que exige
 * um banco-sombra que o PGlite não oferece.
 *
 *   pnpm db:new-migration add_folders
 *
 * Revise o SQL gerado antes de commitar e rode `pnpm db:deploy` para aplicar.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Uso: pnpm db:new-migration <nome_em_snake_case>');
  process.exit(1);
}

const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida (.env na raiz do projeto).');
  process.exit(1);
}

// CLI do Prisma chamado direto pelo Node, sem shell: no Windows o `&` da URL quebraria o comando.
const prismaCli = resolve('node_modules/prisma/build/index.js');
const sql = execFileSync(
  process.execPath,
  [prismaCli, 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { encoding: 'utf8' },
);

if (sql.includes('This is an empty migration')) {
  console.warn('Nada mudou no schema.prisma em relação ao banco local.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = resolve('prisma/migrations', `${stamp}_${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'migration.sql'), sql);
console.warn(`Migration criada: prisma/migrations/${stamp}_${name}/migration.sql`);
