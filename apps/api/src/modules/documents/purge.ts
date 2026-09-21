import type { PrismaClient } from '@prisma/client';
import { audit } from '../../lib/audit.js';

/** Apaga de vez o que está na lixeira há mais de `retentionDays` (SPEC-001 §2.1). */
export async function purgeTrash(prisma: PrismaClient, retentionDays: number, now = Date.now()): Promise<number> {
  const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
  const expired = await prisma.document.findMany({ where: { trashedAt: { lt: cutoff } }, select: { id: true } });
  if (expired.length === 0) return 0;
  const { count } = await prisma.document.deleteMany({ where: { id: { in: expired.map((d) => d.id) } } });
  await audit(prisma, { action: 'document.purged', meta: { count } });
  return count;
}
