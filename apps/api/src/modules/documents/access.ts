import { hasRole, type Role } from '@diagram/shared';
import type { PrismaClient } from '@prisma/client';
import { forbidden, notFound } from '../../lib/http-error.js';

export const documentMetaSelect = {
  id: true,
  type: true,
  title: true,
  ownerId: true,
  trashedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * ÚNICO ponto de autorização de documentos (SPEC-001 §3.5, CLAUDE.md §9).
 * Usado por toda rota /documents/:id/* e pelo onConnect do WebSocket.
 *
 * - sem vínculo → 404 (não revela que existe)
 * - na lixeira → 404, exceto para o dono com `allowTrashed` (restaurar/apagar)
 * - membro com papel insuficiente → 403 (ele já sabe que o documento existe)
 * - ADMIN não tem exceção.
 */
export async function assertDocumentAccess(
  prisma: PrismaClient,
  userId: string,
  documentId: string,
  minRole: Role,
  options: { allowTrashed?: boolean } = {},
) {
  const membership = await prisma.documentMember.findUnique({
    where: { documentId_userId: { documentId, userId } },
    select: { role: true, document: { select: documentMetaSelect } },
  });
  if (!membership) throw notFound();
  // Na lixeira o documento só existe para o dono, e só nas rotas de restaurar/apagar.
  if (membership.document.trashedAt && (!options.allowTrashed || membership.role !== 'OWNER')) throw notFound();
  if (!hasRole(membership.role, minRole)) {
    throw forbidden('INSUFFICIENT_ROLE', 'Seu papel neste documento não permite esta ação.');
  }
  return { document: membership.document, role: membership.role };
}
