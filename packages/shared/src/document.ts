import { z } from 'zod';

// Glossário: ver CLAUDE.md §6.

export const documentTypeSchema = z.enum(['MINDMAP', 'DIAGRAM']);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const roleSchema = z.enum(['OWNER', 'EDITOR', 'COMMENTER', 'VIEWER']);
export type Role = z.infer<typeof roleSchema>;

/** Papéis em ordem crescente de poder — usado por assertDocumentAccess. */
export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  COMMENTER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export const NODE_TEXT_MAX = 2_000;

/**
 * Nó de mapa mental como fica no Y.Map `nodes` (ADR-002): lista plana,
 * ligada por parentId, ordenada entre irmãos por `order`.
 */
export const mindMapNodeSchema = z.object({
  id: z.string().min(1).max(64),
  parentId: z.string().min(1).max(64).nullable(),
  order: z.number().finite(),
  text: z.string().max(NODE_TEXT_MAX),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  bold: z.boolean().optional(),
  collapsed: z.boolean().optional(),
});

export type MindMapNode = z.infer<typeof mindMapNodeSchema>;

/** Só aceita links seguros em nós (CLAUDE.md §9 — XSS). */
export function isSafeLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
