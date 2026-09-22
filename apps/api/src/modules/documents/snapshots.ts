import {
  applySnapshotState,
  extractDocSearchText,
  SNAPSHOT_MAX_BYTES_PER_DOCUMENT,
  SNAPSHOT_MAX_PER_DOCUMENT,
  SNAPSHOT_NAME_MAX,
  type SnapshotKind,
} from '@diagram/shared';
import type { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';
import { MAX_DOCUMENT_BYTES } from '../../collab/plugin.js';
import { audit } from '../../lib/audit.js';

// Histórico de versões (SPEC-005 §3.4 e §4). Sem Fastify aqui: o plugin de
// colaboração e as rotas chamam as mesmas funções.

export interface CreateSnapshotInput {
  documentId: string;
  state: Uint8Array;
  kind: SnapshotKind;
  name?: string | null;
  createdById?: string | null;
  editorIds?: string[];
}

/**
 * Grava uma versão. Devolve null quando não dá para guardar (documento acima do
 * limite): o histórico nunca é motivo para derrubar uma edição.
 */
export async function createSnapshot(
  prisma: PrismaClient,
  input: CreateSnapshotInput,
): Promise<{ id: string; createdAt: Date } | null> {
  if (input.state.byteLength === 0 || input.state.byteLength > MAX_DOCUMENT_BYTES) return null;
  const snapshot = await prisma.snapshot.create({
    data: {
      documentId: input.documentId,
      kind: input.kind,
      name: input.name ? input.name.slice(0, SNAPSHOT_NAME_MAX) : null,
      state: Buffer.from(input.state),
      sizeBytes: input.state.byteLength,
      editorIds: [...new Set(input.editorIds ?? [])].slice(0, 50),
      createdById: input.createdById ?? null,
    },
    select: { id: true, createdAt: true },
  });
  await enforceDocumentQuota(prisma, input.documentId);
  return snapshot;
}

/** Tetos por documento (SPEC-005 §2.2): só versões automáticas são sacrificadas. */
async function enforceDocumentQuota(prisma: PrismaClient, documentId: string): Promise<number> {
  const all = await prisma.snapshot.findMany({
    where: { documentId },
    select: { id: true, kind: true, sizeBytes: true },
    orderBy: { createdAt: 'desc' },
  });
  const total = all.reduce((sum: number, s: { sizeBytes: number }) => sum + s.sizeBytes, 0);
  let count = all.length;
  let bytes = total;

  const doomed: string[] = [];
  // Da mais antiga para a mais nova, sacrificando só as automáticas.
  for (const snapshot of [...all].reverse()) {
    if (count <= SNAPSHOT_MAX_PER_DOCUMENT && bytes <= SNAPSHOT_MAX_BYTES_PER_DOCUMENT) break;
    if (snapshot.kind !== 'AUTO') continue;
    doomed.push(snapshot.id);
    count -= 1;
    bytes -= snapshot.sizeBytes;
  }
  if (doomed.length === 0) return 0;
  const { count: removed } = await prisma.snapshot.deleteMany({ where: { id: { in: doomed } } });
  return removed;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PruneOptions {
  /** Idade em que a versão automática é apagada de vez. */
  retentionDays?: number;
  /** A partir daqui, guarda só uma versão automática por dia. */
  dailyAfterDays?: number;
}

/**
 * Retenção do PRD-005 §5.8, aplicada pelo timer horário: todas as automáticas
 * dos últimos 30 dias, uma por dia até 1 ano, nada depois disso. Versões com
 * nome e checkpoints ficam para sempre.
 */
export async function pruneSnapshots(
  prisma: PrismaClient,
  now = Date.now(),
  options: PruneOptions = {},
): Promise<number> {
  const retentionDays = options.retentionDays ?? 365;
  const dailyAfterDays = options.dailyAfterDays ?? 30;
  const expiredBefore = new Date(now - retentionDays * DAY_MS);
  const dailyBefore = new Date(now - dailyAfterDays * DAY_MS);

  const { count: expired } = await prisma.snapshot.deleteMany({
    where: { kind: 'AUTO', createdAt: { lt: expiredBefore } },
  });

  // Entre 30 dias e 1 ano: mantém a mais recente de cada dia, por documento.
  const candidates = await prisma.snapshot.findMany({
    where: { kind: 'AUTO', createdAt: { gte: expiredBefore, lt: dailyBefore } },
    select: { id: true, documentId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const kept = new Set<string>();
  const doomed: string[] = [];
  for (const snapshot of candidates) {
    // Ordem decrescente: a primeira de cada (documento, dia) é a que fica.
    const day = `${snapshot.documentId}:${snapshot.createdAt.toISOString().slice(0, 10)}`;
    if (kept.has(day)) doomed.push(snapshot.id);
    else kept.add(day);
  }
  const { count: extra } = doomed.length
    ? await prisma.snapshot.deleteMany({ where: { id: { in: doomed } } })
    : { count: 0 };

  const total = expired + extra;
  if (total > 0) await audit(prisma, { action: 'snapshot.pruned', meta: { count: total } });
  return total;
}

/** Origem das escritas de restauração: não é edição de ninguém (SPEC-005 §4). */
export const RESTORE_ORIGIN = Symbol('snapshot-restore');

export interface RestoreDeps {
  /** Y.Doc em memória do Hocuspocus, se o documento estiver aberto. */
  liveDocument(documentId: string): Y.Doc | null;
}

/**
 * Restaura o conteúdo de uma versão. Com o documento aberto, escreve no Y.Doc
 * vivo — quem está com ele aberto vê a mudança na hora e o Hocuspocus persiste.
 * Fechado, aplica num doc decodificado e grava direto.
 */
export async function restoreSnapshot(
  prisma: PrismaClient,
  deps: RestoreDeps,
  documentId: string,
  state: Uint8Array,
): Promise<void> {
  const live = deps.liveDocument(documentId);
  if (live) {
    applySnapshotState(live, state, RESTORE_ORIGIN);
    return;
  }
  const doc = new Y.Doc();
  const current = await prisma.document.findUnique({ where: { id: documentId }, select: { yState: true } });
  if (current?.yState) Y.applyUpdate(doc, new Uint8Array(current.yState));
  applySnapshotState(doc, state, RESTORE_ORIGIN);
  const encoded = Y.encodeStateAsUpdate(doc);
  await prisma.document.updateMany({
    where: { id: documentId },
    data: {
      yState: new Uint8Array(encoded),
      sizeBytes: encoded.byteLength,
      searchText: extractDocSearchText(doc),
    },
  });
}
