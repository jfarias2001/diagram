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
/** Nota do nó: texto simples (SPEC-002 §2.2). */
export const NODE_NOTE_MAX = 5_000;
export const NODE_LINK_MAX = 2_048;

/** Formatos de bloco (SPEC-006 §2.1). Ausente = 'rounded'. */
export const NODE_SHAPES = ['rounded', 'capsule', 'rect', 'ellipse', 'hexagon', 'underline'] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];

/** Limite de |dx| e |dy| do deslocamento manual (SPEC-006 §2.1). */
export const NODE_OFFSET_MAX = 20_000;

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Nó de mapa mental como fica no Y.Map `nodes` (ADR-002): lista plana,
 * ligada por parentId, ordenada entre irmãos por `order`.
 */
export const mindMapNodeSchema = z.object({
  id: z.string().min(1).max(64),
  parentId: z.string().min(1).max(64).nullable(),
  order: z.number().finite(),
  text: z.string().max(NODE_TEXT_MAX),
  color: z.string().regex(HEX_COLOR).optional(),
  bold: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  note: z.string().max(NODE_NOTE_MAX).optional(),
  link: z.string().max(NODE_LINK_MAX).refine(isSafeLink).optional(),
  // SPEC-006 §2.1 — os dois deslocamentos vêm juntos ou nenhum.
  dx: z.number().finite().min(-NODE_OFFSET_MAX).max(NODE_OFFSET_MAX).optional(),
  dy: z.number().finite().min(-NODE_OFFSET_MAX).max(NODE_OFFSET_MAX).optional(),
  shape: z.enum(NODE_SHAPES).optional(),
  /** Cor de preenchimento do bloco. Ausente = fundo do quadro. */
  fill: z.string().regex(HEX_COLOR).optional(),
  /** Cor do texto escolhida à mão (SPEC-007 §2.2). Ausente = cor sugerida. */
  ink: z.string().regex(HEX_COLOR).optional(),
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

/**
 * Normaliza o link digitado pelo usuário (SPEC-002 §2.3). Sem protocolo vira
 * https://; qualquer coisa fora de http/https/mailto volta null.
 */
export function normalizeLink(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  if (withScheme.length > NODE_LINK_MAX || !isSafeLink(withScheme)) return null;
  return withScheme;
}

/** Tom escuro e tom claro do texto sobre um bloco pintado (SPEC-006 §5.4). */
export const INK_ON_LIGHT = '#141922';
export const INK_ON_DARK = '#ffffff';

/** Luminância relativa (WCAG 2.1) de um `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const channel = (start: number) => {
    const v = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Razão de contraste (WCAG 2.1) entre duas cores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  if (!HEX_COLOR.test(a) || !HEX_COLOR.test(b)) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Cor de texto legível sobre `fill` (SPEC-006 §5.4). Escolhe entre o tom escuro
 * e o claro o que der maior contraste — nunca fica texto cinza em fundo cinza.
 */
export function readableInk(fill: string): string {
  if (!HEX_COLOR.test(fill)) return INK_ON_LIGHT;
  return contrastRatio(INK_ON_DARK, fill) > contrastRatio(INK_ON_LIGHT, fill) ? INK_ON_DARK : INK_ON_LIGHT;
}
