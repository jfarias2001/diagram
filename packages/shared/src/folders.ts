import { z } from 'zod';
import { type Role, ROLE_RANK } from './document.js';

// Pastas do painel (SPEC-004) — contratos entre web e api.

export const FOLDER_NAME_MAX = 80;
/** Três níveis: depth 0, 1 e 2 (SPEC-004 §2.2). */
export const FOLDER_MAX_DEPTH = 3;
export const FOLDER_MAX_PER_USER = 200;
export const FOLDER_MEMBERS_MAX = 100;

export const folderKindSchema = z.enum(['PERSONAL', 'SHARED']);
export type FolderKind = z.infer<typeof folderKindSchema>;

/** Papel numa pasta compartilhada. O dono não entra na lista (é `ownerId`). */
export const folderRoleSchema = z.enum(['EDITOR', 'VIEWER']);
export type FolderRole = z.infer<typeof folderRoleSchema>;

export const folderNameSchema = z.string().trim().min(1, 'Informe um nome.').max(FOLDER_NAME_MAX);
const folderIdSchema = z.string().min(1).max(64);

export const createFolderBodySchema = z.object({
  kind: folderKindSchema,
  name: folderNameSchema,
  parentId: folderIdSchema.nullish(),
});

export const updateFolderBodySchema = z
  .object({
    name: folderNameSchema.optional(),
    /** `null` move para o 1º nível. Ausente = não mexe. */
    parentId: folderIdSchema.nullish(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, 'Nada para atualizar.');

export const folderParamsSchema = z.object({ id: folderIdSchema });
export const folderMemberParamsSchema = z.object({ id: folderIdSchema, userId: z.string().min(1).max(64) });
export const addFolderMemberBodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ message: 'E-mail inválido.' })),
  role: folderRoleSchema,
});
export const updateFolderMemberBodySchema = z.object({ role: folderRoleSchema });

/** Onde o documento fica. `null` tira da pasta. */
export const setDocumentFolderBodySchema = z.object({ folderId: folderIdSchema.nullable() });

export interface FolderView {
  id: string;
  kind: FolderKind;
  name: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  /** Quantos documentos estão diretamente nesta pasta (sem contar subpastas). */
  documentCount: number;
  /** Só em pastas compartilhadas: o que EU posso fazer aqui. */
  myRole: 'OWNER' | FolderRole | null;
}

export interface FolderNode extends FolderView {
  children: FolderNode[];
}

export interface FolderTree {
  personal: FolderNode[];
  shared: FolderNode[];
}

export interface FolderMemberView {
  userId: string;
  name: string;
  email: string;
  role: FolderRole;
}

/** Resumo da pasta de um documento, para mostrar na busca (SPEC-004 §3.3). */
export interface DocumentFolderRef {
  id: string;
  name: string;
  kind: FolderKind;
}

/**
 * Papel herdado da pasta compartilhada (SPEC-004 §2.3). Dono e editor da pasta
 * editam os documentos dela; leitor só lê. **Nunca devolve OWNER**: só o dono do
 * documento manda para a lixeira e apaga.
 */
export function inheritedRole(folder: { ownerId: string; memberRole: FolderRole | null }, userId: string): Role | null {
  if (folder.ownerId === userId) return 'EDITOR';
  if (folder.memberRole === 'EDITOR') return 'EDITOR';
  if (folder.memberRole === 'VIEWER') return 'VIEWER';
  return null;
}

/** O maior entre o papel direto no documento e o herdado da pasta. */
export function effectiveRole(direct: Role | null, inherited: Role | null): Role | null {
  if (!direct) return inherited;
  if (!inherited) return direct;
  return ROLE_RANK[direct] >= ROLE_RANK[inherited] ? direct : inherited;
}

/** Nome comparável entre irmãs: sem acento e sem caixa (SPEC-004 §2.2). */
export function normalizedFolderName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Monta a árvore a partir da lista plana, ordenada por nome. */
export function buildFolderTree(folders: FolderView[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}
