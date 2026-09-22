import type { FolderRole } from '@diagram/shared';
import type { PrismaClient } from '@prisma/client';
import { forbidden, notFound } from '../../lib/http-error.js';

// Autorização de pastas (SPEC-004 §6). Mesmo desenho das de documento:
// sem vínculo → 404 (não revela que existe), vínculo fraco → 403.

export const folderSelect = {
  id: true,
  kind: true,
  name: true,
  ownerId: true,
  parentId: true,
  rootId: true,
  depth: true,
} as const;

export type FolderRow = {
  id: string;
  kind: 'PERSONAL' | 'SHARED';
  name: string;
  ownerId: string;
  parentId: string | null;
  rootId: string;
  depth: number;
};

/** O que a pessoa pode fazer na pasta. `OWNER` é o dono dela. */
export type FolderAccess = 'OWNER' | FolderRole;

const RANK: Record<FolderAccess, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

export async function assertFolderAccess(
  prisma: PrismaClient,
  userId: string,
  folderId: string,
  min: FolderAccess,
): Promise<{ folder: FolderRow; access: FolderAccess }> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { ...folderSelect, root: { select: { ownerId: true, members: { where: { userId }, select: { role: true } } } } },
  });
  if (!folder) throw notFound();

  // Pasta pessoal é invisível para qualquer outro usuário, mesmo ADMIN.
  if (folder.kind === 'PERSONAL') {
    if (folder.ownerId !== userId) throw notFound();
    return { folder: strip(folder), access: 'OWNER' };
  }

  const root = folder.root;
  const access: FolderAccess | null =
    root.ownerId === userId
      ? 'OWNER'
      : root.members[0]?.role === 'EDITOR'
        ? 'EDITOR'
        : root.members[0]?.role === 'VIEWER'
          ? 'VIEWER'
          : null;
  if (!access) throw notFound();
  if (RANK[access] < RANK[min]) {
    throw forbidden('INSUFFICIENT_FOLDER_ROLE', 'Seu papel nesta pasta não permite esta ação.');
  }
  return { folder: strip(folder), access };
}

function strip(folder: FolderRow & { root?: unknown }): FolderRow {
  const { root: _root, ...rest } = folder as FolderRow & { root?: unknown };
  return rest;
}
