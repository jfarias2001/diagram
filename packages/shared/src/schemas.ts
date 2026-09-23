import { z } from 'zod';
import type { ThemeId } from './theme.js';
import { documentTypeSchema, roleSchema } from './document.js';

// SPEC-001 §3 — contratos da API compartilhados entre web e api.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'E-mail inválido.' }));

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`)
  .max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`);

export const personNameSchema = z.string().trim().min(1, 'Informe o nome.').max(120);

export const userRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export type UserRole = z.infer<typeof userRoleSchema>;

// ---------- auth ----------
export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
});

export interface Me {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// ---------- admin ----------
export const createUserBodySchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  role: userRoleSchema.default('MEMBER'),
});

export const updateUserBodySchema = z
  .object({
    name: personNameSchema.optional(),
    role: userRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

// ---------- documentos ----------
export const documentTitleSchema = z.string().trim().min(1, 'Informe um título.').max(200);

export const idParamSchema = z.object({ id: z.string().min(1).max(64) });

export const listDocumentsQuerySchema = z.object({
  scope: z.enum(['mine', 'shared', 'trash']).default('mine'),
  type: documentTypeSchema.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(64).optional(),
  /** Id de uma pasta, ou 'none' para "sem pasta" (SPEC-004 §3.3). */
  folder: z.string().min(1).max(64).optional(),
});

export const createDocumentBodySchema = z.object({
  title: documentTitleSchema,
  type: documentTypeSchema.default('MINDMAP'),
});

export const updateDocumentBodySchema = z.object({ title: documentTitleSchema });
export const duplicateDocumentBodySchema = z.object({ title: documentTitleSchema.optional() });

export interface DocumentSummary {
  id: string;
  title: string;
  type: 'MINDMAP' | 'DIAGRAM';
  myRole: z.infer<typeof roleSchema>;
  owner: { id: string; name: string };
  updatedAt: string;
  trashedAt: string | null;
  /** Pasta em que ELE está para mim: a compartilhada, senão a minha pessoal (SPEC-004 §3.3). */
  folder?: { id: string; name: string; kind: 'PERSONAL' | 'SHARED' } | null;
  /** Tema do documento, para a capa do cartão (SPEC-008 §3). Nulo = tema padrão. */
  theme?: ThemeId | null;
}

export interface DocumentList {
  items: DocumentSummary[];
  nextCursor: string | null;
}

// ---------- membros ----------
export const shareRoleSchema = z.enum(['EDITOR', 'COMMENTER', 'VIEWER']);

export const addMemberBodySchema = z.object({ email: emailSchema, role: shareRoleSchema });
export const updateMemberBodySchema = z.object({ role: shareRoleSchema });
export const memberParamsSchema = z.object({ id: z.string().min(1).max(64), userId: z.string().min(1).max(64) });

export interface DocumentMemberView {
  userId: string;
  name: string;
  email: string;
  role: z.infer<typeof roleSchema>;
}

/** Destino de redirecionamento pós-login: só caminho interno (evita open redirect). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
