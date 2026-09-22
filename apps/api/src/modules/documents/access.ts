import { effectiveRole, hasRole, inheritedRole, type Role } from '@diagram/shared';
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
 * O papel vale o **maior** entre o vínculo direto (DocumentMember) e o herdado
 * da pasta compartilhada em que o documento está (SPEC-004 §2.3).
 *
 * - sem vínculo nenhum → 404 (não revela que existe)
 * - na lixeira → 404, exceto para o dono com `allowTrashed` (restaurar/apagar)
 * - papel insuficiente → 403 (ele já sabe que o documento existe)
 * - herança nunca dá OWNER; ADMIN não tem exceção.
 */
export async function assertDocumentAccess(
  prisma: PrismaClient,
  userId: string,
  documentId: string,
  minRole: Role,
  options: { allowTrashed?: boolean } = {},
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      ...documentMetaSelect,
      members: { where: { userId }, select: { role: true } },
      // A pasta principal do ramo é quem guarda os membros (SPEC-004 §2.1).
      sharedFolder: {
        select: {
          root: {
            select: {
              ownerId: true,
              members: { where: { userId }, select: { role: true } },
            },
          },
        },
      },
    },
  });
  if (!document) throw notFound();

  const direct = document.members[0]?.role ?? null;
  const root = document.sharedFolder?.root;
  const inherited = root
    ? inheritedRole(
        { ownerId: root.ownerId, memberRole: (root.members[0]?.role as 'EDITOR' | 'VIEWER' | undefined) ?? null },
        userId,
      )
    : null;
  const role = effectiveRole(direct, inherited);
  if (!role) throw notFound();

  // Na lixeira o documento só existe para o dono, e só nas rotas de restaurar/apagar.
  // Quem só tem acesso herdado nunca passa por aqui (a herança não dá OWNER).
  if (document.trashedAt && (!options.allowTrashed || role !== 'OWNER')) throw notFound();
  if (!hasRole(role, minRole)) {
    throw forbidden('INSUFFICIENT_ROLE', 'Seu papel neste documento não permite esta ação.');
  }
  const { members: _members, sharedFolder: _sharedFolder, ...meta } = document;
  return { document: meta, role };
}
