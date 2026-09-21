import { emailSchema, passwordSchema, personNameSchema } from '@diagram/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../../config/env.js';
import { audit } from '../../lib/audit.js';
import { hashPassword } from '../../lib/crypto.js';

/**
 * Cria o primeiro admin no boot se ainda não existir nenhum (SPEC-001 §3.2).
 * Com qualquer admin já cadastrado, as variáveis SEED_ADMIN_* são ignoradas.
 */
export async function seedFirstAdmin(prisma: PrismaClient, env: Env, log: FastifyBaseLogger): Promise<boolean> {
  if ((await prisma.user.count({ where: { role: 'ADMIN' } })) > 0) return false;

  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    log.warn('nenhum administrador cadastrado — defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env');
    return false;
  }

  const email = emailSchema.parse(env.SEED_ADMIN_EMAIL);
  const password = passwordSchema.parse(env.SEED_ADMIN_PASSWORD);
  const name = personNameSchema.parse(env.SEED_ADMIN_NAME ?? 'Administrador');

  const user = await prisma.user.upsert({
    where: { email },
    // Se o e-mail já existia como membro, promove a admin e redefine a senha.
    update: { role: 'ADMIN', active: true, passwordHash: await hashPassword(password), mustChangePassword: true },
    create: { email, name, role: 'ADMIN', passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit(prisma, { action: 'user.seeded', targetId: user.id });
  log.info('admin inicial criado — troque a senha no primeiro login e remova SEED_ADMIN_PASSWORD do .env');
  return true;
}
