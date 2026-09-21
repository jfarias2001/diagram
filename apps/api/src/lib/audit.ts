import type { Prisma, PrismaClient } from '@prisma/client';

export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.locked'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'user.password_reset'
  | 'user.seeded'
  | 'document.trashed'
  | 'document.restored'
  | 'document.deleted'
  | 'document.purged'
  | 'document.shared'
  | 'document.member_updated'
  | 'document.unshared';

interface AuditInput {
  action: AuditAction;
  actorId?: string | null;
  targetId?: string | null;
  /** Nunca senha, token ou conteúdo de documento. */
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Auditoria nunca derruba a operação principal. */
export async function audit(prisma: PrismaClient, input: AuditInput, log?: { error: (o: object, m: string) => void }) {
  try {
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    log?.error({ err }, 'falha ao gravar auditoria');
  }
}
