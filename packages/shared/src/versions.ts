import { z } from 'zod';
import { documentTitleSchema } from './schemas.js';

// Histórico de versões (SPEC-005 §2.2 e §3) — contratos entre web e api.

export const SNAPSHOT_NAME_MAX = 80;
/** Teto de versões por documento; ao passar, as automáticas mais antigas saem. */
export const SNAPSHOT_MAX_PER_DOCUMENT = 300;
/** Teto de espaço por documento (soma das versões). */
export const SNAPSHOT_MAX_BYTES_PER_DOCUMENT = 100 * 1024 * 1024;

export const snapshotKindSchema = z.enum(['AUTO', 'NAMED', 'CHECKPOINT']);
export type SnapshotKind = z.infer<typeof snapshotKindSchema>;

export const snapshotNameSchema = z.string().trim().min(1, 'Informe um nome.').max(SNAPSHOT_NAME_MAX);

/** Versão criada por uma pessoa: com nome, ou um checkpoint antes de uma operação grande. */
export const createVersionBodySchema = z.object({
  kind: z.enum(['NAMED', 'CHECKPOINT']).default('NAMED'),
  name: snapshotNameSchema,
});

export const renameVersionBodySchema = z.object({ name: snapshotNameSchema });
export const copyVersionBodySchema = z.object({ title: documentTitleSchema.optional() });

export const versionParamsSchema = z.object({
  id: z.string().min(1).max(64),
  versionId: z.string().min(1).max(64),
});

export const listVersionsQuerySchema = z.object({
  cursor: z.string().max(64).optional(),
});

export interface VersionSummary {
  id: string;
  kind: SnapshotKind;
  name: string | null;
  createdAt: string;
  sizeBytes: number;
  /** Nome de quem editou no intervalo — nunca e-mail (SPEC-005 §6). */
  editors: Array<{ id: string; name: string }>;
}

export interface VersionList {
  items: VersionSummary[];
  nextCursor: string | null;
}

export interface RestoreResult {
  /** Versão criada com o estado que havia antes de restaurar. */
  checkpointId: string;
  restoredFrom: string;
}
