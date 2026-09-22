import {
  buildFolderTree,
  FOLDER_MAX_DEPTH,
  FOLDER_MAX_PER_USER,
  FOLDER_MEMBERS_MAX,
  type FolderKind,
  type FolderMemberView,
  type FolderRole,
  type FolderTree,
  type FolderView,
  normalizedFolderName,
} from '@diagram/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { conflict, forbidden, HttpError, notFound } from '../../lib/http-error.js';
import { assertFolderAccess, type FolderAccess, type FolderRow, folderSelect } from './access.js';

// Regras de negócio das pastas (SPEC-004 §3.1). As rotas só traduzem HTTP.

/** Árvore das minhas pastas pessoais e das compartilhadas em que participo. */
export async function listFolders(prisma: PrismaClient, userId: string): Promise<FolderTree> {
  const rows = await prisma.folder.findMany({
    where: {
      OR: [
        { kind: 'PERSONAL', ownerId: userId },
        { kind: 'SHARED', root: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] } },
      ],
    },
    select: { ...folderSelect, root: { select: { ownerId: true, members: { where: { userId }, select: { role: true } } } } },
  });

  const counts = await documentCounts(prisma, userId, rows);
  const views: FolderView[] = rows.map((folder) => ({
    id: folder.id,
    kind: folder.kind,
    name: folder.name,
    parentId: folder.parentId,
    rootId: folder.rootId,
    depth: folder.depth,
    documentCount: counts.get(folder.id) ?? 0,
    myRole:
      folder.kind === 'PERSONAL'
        ? null
        : folder.root.ownerId === userId
          ? 'OWNER'
          : ((folder.root.members[0]?.role as FolderRole | undefined) ?? null),
  }));

  return {
    personal: buildFolderTree(views.filter((f) => f.kind === 'PERSONAL')),
    shared: buildFolderTree(views.filter((f) => f.kind === 'SHARED')),
  };
}

/** Documentos por pasta: pessoal conta os meus vínculos; compartilhada, os documentos dela. */
async function documentCounts(
  prisma: PrismaClient,
  userId: string,
  folders: Array<{ id: string; kind: FolderKind }>,
): Promise<Map<string, number>> {
  const personalIds = folders.filter((f) => f.kind === 'PERSONAL').map((f) => f.id);
  const sharedIds = folders.filter((f) => f.kind === 'SHARED').map((f) => f.id);
  const counts = new Map<string, number>();

  if (personalIds.length > 0) {
    const grouped = await prisma.documentPlacement.groupBy({
      by: ['folderId'],
      where: { userId, folderId: { in: personalIds }, document: { trashedAt: null } },
      _count: { _all: true },
    });
    for (const row of grouped) counts.set(row.folderId, row._count._all);
  }
  if (sharedIds.length > 0) {
    const grouped = await prisma.document.groupBy({
      by: ['sharedFolderId'],
      where: { sharedFolderId: { in: sharedIds }, trashedAt: null },
      _count: { _all: true },
    });
    for (const row of grouped) if (row.sharedFolderId) counts.set(row.sharedFolderId, row._count._all);
  }
  return counts;
}

async function assertNameFree(
  prisma: PrismaClient,
  where: { kind: FolderKind; ownerId?: string; parentId: string | null; rootId?: string },
  name: string,
  exceptId?: string,
) {
  const siblings = await prisma.folder.findMany({
    where: {
      parentId: where.parentId,
      kind: where.kind,
      ...(where.parentId === null
        ? where.kind === 'PERSONAL'
          ? { ownerId: where.ownerId }
          : { id: where.rootId ?? undefined }
        : {}),
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, name: true, ownerId: true },
  });
  const taken = normalizedFolderName(name);
  // Em pasta de 1º nível compartilhada, "irmãs" são as do mesmo dono.
  const relevant =
    where.parentId === null && where.kind === 'SHARED' ? siblings.filter((s) => s.ownerId === where.ownerId) : siblings;
  if (relevant.some((s) => normalizedFolderName(s.name) === taken)) {
    throw conflict('FOLDER_NAME_TAKEN', 'Já existe uma pasta com esse nome aqui.');
  }
}

export async function createFolder(
  prisma: PrismaClient,
  userId: string,
  input: { kind: FolderKind; name: string; parentId?: string | null },
): Promise<FolderView> {
  const total = await prisma.folder.count({ where: { ownerId: userId, kind: input.kind } });
  if (total >= FOLDER_MAX_PER_USER) {
    throw conflict('FOLDER_LIMIT', 'Você atingiu o limite de pastas. Apague alguma antes de criar outra.');
  }

  let parent: FolderRow | null = null;
  if (input.parentId) {
    // Criar dentro de uma pasta exige poder de edição nela (PRD-004 §5.18).
    ({ folder: parent } = await assertFolderAccess(prisma, userId, input.parentId, 'EDITOR'));
    if (parent.kind !== input.kind) throw conflict('FOLDER_KIND_MISMATCH', 'A subpasta tem o mesmo tipo da pasta-mãe.');
    if (parent.depth + 1 >= FOLDER_MAX_DEPTH) {
      throw conflict('FOLDER_TOO_DEEP', `As pastas vão até ${FOLDER_MAX_DEPTH} níveis.`);
    }
  }

  await assertNameFree(
    prisma,
    { kind: input.kind, ownerId: userId, parentId: parent?.id ?? null, rootId: parent?.rootId },
    input.name,
  );

  // O id vem de fora porque `rootId` aponta para a própria linha no 1º nível.
  const id = randomUUID();
  const created = await prisma.folder.create({
    data: {
      id,
      kind: input.kind,
      name: input.name,
      ownerId: userId,
      parentId: parent?.id ?? null,
      rootId: parent?.rootId ?? id,
      depth: parent ? parent.depth + 1 : 0,
    },
    select: folderSelect,
  });
  return toView(created, userId, created.ownerId === userId ? 'OWNER' : null);
}

export async function updateFolder(
  prisma: PrismaClient,
  userId: string,
  folderId: string,
  input: { name?: string; parentId?: string | null },
): Promise<FolderView> {
  // Renomear a pasta principal é só do dono; subpasta, também do editor (PRD-004 §5.18).
  const { folder, access } = await assertFolderAccess(prisma, userId, folderId, 'EDITOR');
  if (folder.depth === 0 && access !== 'OWNER') {
    throw forbidden('FOLDER_OWNER_ONLY', 'Só o dono da pasta pode renomeá-la ou movê-la.');
  }

  const data: Prisma.FolderUpdateInput = {};
  let parent: FolderRow | null = null;

  if (input.parentId !== undefined) {
    if (input.parentId === folderId) throw conflict('FOLDER_CYCLE', 'Uma pasta não pode ficar dentro dela mesma.');
    if (input.parentId) {
      ({ folder: parent } = await assertFolderAccess(prisma, userId, input.parentId, 'EDITOR'));
      if (parent.kind !== folder.kind) throw conflict('FOLDER_KIND_MISMATCH', 'A pasta não muda de tipo.');
      if (folder.kind === 'SHARED' && parent.rootId !== folder.rootId) {
        throw conflict('FOLDER_CROSS_ROOT', 'Mover entre pastas compartilhadas diferentes não é possível.');
      }
      if (await isDescendant(prisma, folder.id, parent.id)) {
        throw conflict('FOLDER_CYCLE', 'Uma pasta não pode ir para dentro de uma subpasta dela.');
      }
    } else if (folder.kind === 'SHARED') {
      throw conflict('FOLDER_CROSS_ROOT', 'Uma subpasta compartilhada não pode virar pasta principal.');
    }
  }

  if (input.name !== undefined) {
    const parentId = input.parentId !== undefined ? (parent?.id ?? null) : folder.parentId;
    await assertNameFree(
      prisma,
      { kind: folder.kind, ownerId: folder.ownerId, parentId, rootId: parent?.rootId ?? folder.rootId },
      input.name,
      folder.id,
    );
    data.name = input.name;
  }

  if (input.parentId !== undefined) {
    const newDepth = parent ? parent.depth + 1 : 0;
    const branch = await branchOf(prisma, folder.id);
    const deepest = Math.max(...branch.map((f) => f.depth)) - folder.depth + newDepth;
    if (deepest >= FOLDER_MAX_DEPTH) {
      throw conflict('FOLDER_TOO_DEEP', `As pastas vão até ${FOLDER_MAX_DEPTH} níveis.`);
    }
    data.parent = parent ? { connect: { id: parent.id } } : { disconnect: true };
    data.depth = newDepth;
    data.root = { connect: { id: parent?.rootId ?? folder.id } };

    // O ramo inteiro acompanha a profundidade e a pasta principal novas.
    const shift = newDepth - folder.depth;
    await prisma.$transaction(
      branch
        .filter((f) => f.id !== folder.id)
        .map((f) =>
          prisma.folder.update({
            where: { id: f.id },
            data: { depth: f.depth + shift, rootId: parent?.rootId ?? folder.id },
          }),
        ),
    );
  }

  const updated = await prisma.folder.update({ where: { id: folderId }, data, select: folderSelect });
  return toView(updated, userId, access);
}

/** Ramo inteiro (a pasta e as descendentes), com no máximo 3 níveis. */
async function branchOf(prisma: PrismaClient, folderId: string): Promise<FolderRow[]> {
  const all: FolderRow[] = [];
  let frontier = [folderId];
  for (let level = 0; level < FOLDER_MAX_DEPTH && frontier.length > 0; level++) {
    const rows = await prisma.folder.findMany({ where: { id: { in: frontier } }, select: folderSelect });
    all.push(...rows);
    const children = await prisma.folder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = children.map((c) => c.id);
  }
  return all;
}

async function isDescendant(prisma: PrismaClient, folderId: string, candidateId: string): Promise<boolean> {
  const branch = await branchOf(prisma, folderId);
  return branch.some((f) => f.id === candidateId);
}

/** Apaga a pasta (e as subpastas, em cascata). Devolve os documentos que perderam a pasta. */
export async function deleteFolder(prisma: PrismaClient, userId: string, folderId: string): Promise<string[]> {
  const { folder } = await assertFolderAccess(prisma, userId, folderId, 'OWNER');
  const branch = await branchOf(prisma, folder.id);
  const ids = branch.map((f) => f.id);
  const affected =
    folder.kind === 'SHARED'
      ? await prisma.document.findMany({ where: { sharedFolderId: { in: ids } }, select: { id: true } })
      : [];
  // Cascade cuida das subpastas, dos vínculos pessoais e do sharedFolderId (SetNull).
  await prisma.folder.delete({ where: { id: folder.id } });
  return affected.map((d) => d.id);
}

// ---------- membros da pasta compartilhada ----------

async function assertRootShared(prisma: PrismaClient, userId: string, folderId: string, min: FolderAccess) {
  const { folder, access } = await assertFolderAccess(prisma, userId, folderId, min);
  if (folder.kind !== 'SHARED') throw notFound();
  if (folder.depth !== 0) {
    throw conflict('FOLDER_NOT_ROOT', 'Os membros ficam na pasta principal; as subpastas usam os mesmos.');
  }
  return { folder, access };
}

export async function listFolderMembers(
  prisma: PrismaClient,
  userId: string,
  folderId: string,
): Promise<FolderMemberView[]> {
  await assertRootShared(prisma, userId, folderId, 'VIEWER');
  const members = await prisma.folderMember.findMany({
    where: { folderId },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role as FolderRole,
  }));
}

export async function addFolderMember(
  prisma: PrismaClient,
  userId: string,
  folderId: string,
  input: { email: string; role: FolderRole },
): Promise<FolderMemberView> {
  const { folder } = await assertRootShared(prisma, userId, folderId, 'OWNER');
  const total = await prisma.folderMember.count({ where: { folderId } });
  if (total >= FOLDER_MEMBERS_MAX) throw conflict('FOLDER_LIMIT', 'Esta pasta atingiu o limite de membros.');

  const target = await prisma.user.findUnique({ where: { email: input.email } });
  if (!target || !target.active) {
    throw new HttpError(404, 'USER_NOT_FOUND', 'Nenhum colaborador ativo com este e-mail.');
  }
  if (target.id === folder.ownerId) throw conflict('ALREADY_MEMBER', 'Esta pessoa é a dona da pasta.');
  const existing = await prisma.folderMember.findUnique({
    where: { folderId_userId: { folderId, userId: target.id } },
  });
  if (existing) throw conflict('ALREADY_MEMBER', 'Esta pessoa já tem acesso à pasta.');

  await prisma.folderMember.create({ data: { folderId, userId: target.id, role: input.role, addedById: userId } });
  return { userId: target.id, name: target.name, email: target.email, role: input.role };
}

export async function updateFolderMember(
  prisma: PrismaClient,
  userId: string,
  folderId: string,
  targetId: string,
  role: FolderRole,
): Promise<void> {
  await assertRootShared(prisma, userId, folderId, 'OWNER');
  const updated = await prisma.folderMember.updateMany({ where: { folderId, userId: targetId }, data: { role } });
  if (updated.count === 0) throw notFound();
}

export async function removeFolderMember(
  prisma: PrismaClient,
  userId: string,
  folderId: string,
  targetId: string,
): Promise<void> {
  // Sair da pasta é permitido a qualquer membro; tirar os outros, só o dono.
  await assertRootShared(prisma, userId, folderId, targetId === userId ? 'VIEWER' : 'OWNER');
  const removed = await prisma.folderMember.deleteMany({ where: { folderId, userId: targetId } });
  if (removed.count === 0) throw notFound();
}

// ---------- documento ↔ pasta ----------

/** Pasta pessoal: vale só para mim e não muda papel de ninguém (PRD-004 §5.9). */
export async function setPersonalFolder(
  prisma: PrismaClient,
  userId: string,
  documentId: string,
  folderId: string | null,
): Promise<void> {
  if (!folderId) {
    await prisma.documentPlacement.deleteMany({ where: { documentId, userId } });
    return;
  }
  const { folder } = await assertFolderAccess(prisma, userId, folderId, 'OWNER');
  if (folder.kind !== 'PERSONAL') throw notFound();
  await prisma.documentPlacement.upsert({
    where: { documentId_userId: { documentId, userId } },
    create: { documentId, userId, folderId },
    update: { folderId },
  });
}

/**
 * Pasta compartilhada: só o dono do documento a coloca, e só numa pasta em que
 * tenha poder de edição (PRD-004 §5.16). Tirar também é do dono da pasta.
 */
export async function setSharedFolder(
  prisma: PrismaClient,
  userId: string,
  document: { id: string; ownerId: string },
  folderId: string | null,
): Promise<void> {
  if (folderId) {
    if (document.ownerId !== userId) {
      throw forbidden('NOT_DOCUMENT_OWNER', 'Só o dono do documento pode colocá-lo numa pasta compartilhada.');
    }
    const { folder } = await assertFolderAccess(prisma, userId, folderId, 'EDITOR');
    if (folder.kind !== 'SHARED') throw notFound();
    await prisma.document.update({ where: { id: document.id }, data: { sharedFolderId: folderId } });
    return;
  }

  const current = await prisma.document.findUnique({
    where: { id: document.id },
    select: { sharedFolderId: true },
  });
  if (!current?.sharedFolderId) return;
  if (document.ownerId !== userId) {
    // Quem não é dono do documento precisa ser dono da pasta (PRD-004 §5.17).
    await assertFolderAccess(prisma, userId, current.sharedFolderId, 'OWNER');
  }
  await prisma.document.update({ where: { id: document.id }, data: { sharedFolderId: null } });
}

function toView(folder: FolderRow, userId: string, access: FolderAccess | null): FolderView {
  return {
    id: folder.id,
    kind: folder.kind,
    name: folder.name,
    parentId: folder.parentId,
    rootId: folder.rootId,
    depth: folder.depth,
    documentCount: 0,
    myRole: folder.kind === 'PERSONAL' ? null : (access ?? (folder.ownerId === userId ? 'OWNER' : null)),
  };
}
