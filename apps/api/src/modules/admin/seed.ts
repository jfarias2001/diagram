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

  // Valor inválido não derruba a API (evita loop de restart): avisa e segue sem admin.
  const email = emailSchema.safeParse(env.SEED_ADMIN_EMAIL);
  const password = passwordSchema.safeParse(env.SEED_ADMIN_PASSWORD);
  const name = personNameSchema.safeParse(env.SEED_ADMIN_NAME ?? 'Administrador');
  const problems = [
    !email.success && 'SEED_ADMIN_EMAIL não é um e-mail válido',
    !password.success && 'SEED_ADMIN_PASSWORD precisa ter de 10 a 128 caracteres',
    !name.success && 'SEED_ADMIN_NAME inválido',
  ].filter(Boolean);
  if (!email.success || !password.success || !name.success) {
    log.error(`admin inicial NÃO criado — corrija o .env e reinicie: ${problems.join('; ')}`);
    return false;
  }

  await createAdmin(prisma, email.data, name.data, password.data);
  log.info('admin inicial criado — troque a senha no primeiro login e remova SEED_ADMIN_PASSWORD do .env');
  return true;
}

async function createAdmin(prisma: PrismaClient, email: string, name: string, password: string) {

  const user = await prisma.user.upsert({
    where: { email },
    // Se o e-mail já existia como membro, promove a admin e redefine a senha.
    update: { role: 'ADMIN', active: true, passwordHash: await hashPassword(password), mustChangePassword: true },
    create: { email, name, role: 'ADMIN', passwordHash: await hashPassword(password), mustChangePassword: true },
  });
  await audit(prisma, { action: 'user.seeded', targetId: user.id });
}
