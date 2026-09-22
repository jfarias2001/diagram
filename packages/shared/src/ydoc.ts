import * as Y from 'yjs';
import { extractDiagramSearchText, readDiagram } from './diagram.js';
import {
  HEX_COLOR,
  isSafeLink,
  type MindMapNode,
  NODE_LINK_MAX,
  NODE_NOTE_MAX,
  NODE_OFFSET_MAX,
  NODE_SHAPES,
  NODE_TEXT_MAX,
  type NodeShape,
} from './document.js';
import {
  branchIds,
  childrenIndex,
  computeTreeRepairs,
  extractSearchText,
  findRoot,
  isInBranch,
  type NodeRecord,
  orderBetween,
} from './tree.js';

// Acesso ao Y.Doc do mapa mental (SPEC-001 §2.2). Toda escrita passa por aqui.

export const FORMAT_VERSION = 1;

type YNode = Y.Map<unknown>;

export function nodesMap(doc: Y.Doc): Y.Map<YNode> {
  return doc.getMap<YNode>('nodes');
}

/** Deslocamento manual só vale com os dois valores finitos e dentro do limite (SPEC-006 §2.1). */
function readOffset(dx: unknown, dy: unknown): { dx: number; dy: number } | null {
  if (typeof dx !== 'number' || typeof dy !== 'number') return null;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) > NODE_OFFSET_MAX || Math.abs(dy) > NODE_OFFSET_MAX) return null;
  return { dx, dy };
}

function readNode(id: string, y: YNode): MindMapNode | null {
  const parentId = y.get('parentId');
  const order = y.get('order');
  const text = y.get('text');
  if (typeof order !== 'number' || !Number.isFinite(order)) return null;
  if (parentId !== null && typeof parentId !== 'string') return null;
  const node: MindMapNode = {
    id,
    parentId,
    order,
    text: typeof text === 'string' ? text.slice(0, NODE_TEXT_MAX) : '',
  };
  const color = y.get('color');
  if (typeof color === 'string' && HEX_COLOR.test(color)) node.color = color;
  if (y.get('bold') === true) node.bold = true;
  if (y.get('collapsed') === true) node.collapsed = true;
  // SPEC-006 §6: formato, cor e deslocamento são validados na LEITURA — um
  // cliente adulterado não injeta CSS nem posição absurda.
  const shape = y.get('shape');
  if (typeof shape === 'string' && (NODE_SHAPES as readonly string[]).includes(shape)) node.shape = shape as NodeShape;
  const fill = y.get('fill');
  if (typeof fill === 'string' && HEX_COLOR.test(fill)) node.fill = fill;
  const offset = readOffset(y.get('dx'), y.get('dy'));
  if (offset) {
    node.dx = offset.dx;
    node.dy = offset.dy;
  }
  const note = y.get('note');
  if (typeof note === 'string' && note) node.note = note.slice(0, NODE_NOTE_MAX);
  // Link inválido gravado direto no Y.Doc nunca chega a um href (SPEC-002 §6).
  const link = y.get('link');
  if (typeof link === 'string' && link.length <= NODE_LINK_MAX && isSafeLink(link)) node.link = link;
  return node;
}

/** Snapshot imutável dos nós. Entradas malformadas são ignoradas. */
export function readNodes(doc: Y.Doc): NodeRecord {
  const out: NodeRecord = {};
  nodesMap(doc).forEach((y, id) => {
    if (!(y instanceof Y.Map)) return;
    const node = readNode(id, y);
    if (node) out[id] = node;
  });
  return out;
}

function writeNode(map: Y.Map<YNode>, node: MindMapNode) {
  const y = new Y.Map<unknown>();
  y.set('parentId', node.parentId);
  y.set('order', node.order);
  y.set('text', node.text.slice(0, NODE_TEXT_MAX));
  if (node.color) y.set('color', node.color);
  if (node.bold) y.set('bold', true);
  if (node.collapsed) y.set('collapsed', true);
  if (node.note) y.set('note', node.note.slice(0, NODE_NOTE_MAX));
  if (node.link && isSafeLink(node.link)) y.set('link', node.link);
  if (node.shape && (NODE_SHAPES as readonly string[]).includes(node.shape)) y.set('shape', node.shape);
  if (node.fill && HEX_COLOR.test(node.fill)) y.set('fill', node.fill);
  const offset = readOffset(node.dx, node.dy);
  if (offset) {
    y.set('dx', offset.dx);
    y.set('dy', offset.dy);
  }
  map.set(node.id, y);
}

/** Documento inicial: só a raiz com o título. */
export function createMindMapDoc(title: string, rootId = 'root'): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getMap('meta').set('version', FORMAT_VERSION);
    writeNode(nodesMap(doc), { id: rootId, parentId: null, order: 0, text: title });
  });
  return doc;
}

export function encodeDoc(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function decodeDoc(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}

// ---------- operações (sempre dentro de uma transação com `origin`) ----------

export interface AddNodeInput {
  id: string;
  parentId: string;
  /** Inserir logo depois deste irmão; sem ele, vai para o fim. */
  afterId?: string;
  text?: string;
}

export function addNode(doc: Y.Doc, input: AddNodeInput, origin?: unknown): boolean {
  const nodes = readNodes(doc);
  if (!nodes[input.parentId] || nodes[input.id]) return false;
  const siblings = childrenIndex(nodes).get(input.parentId) ?? [];
  const afterIndex = input.afterId ? siblings.findIndex((s) => s.id === input.afterId) : siblings.length - 1;
  const order = orderBetween(siblings[afterIndex]?.order, siblings[afterIndex + 1]?.order);
  doc.transact(() => {
    const map = nodesMap(doc);
    writeNode(map, { id: input.id, parentId: input.parentId, order, text: input.text ?? '' });
    map.get(input.parentId)?.delete('collapsed'); // criar filho abre o ramo
  }, origin);
  return true;
}

/** Apaga o ramo inteiro. A raiz não pode ser apagada. */
export function deleteBranch(doc: Y.Doc, id: string, origin?: unknown): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  if (!node || node.parentId === null) return false;
  doc.transact(() => {
    const map = nodesMap(doc);
    for (const nodeId of branchIds(nodes, id)) map.delete(nodeId);
  }, origin);
  return true;
}

export type NodePatch = Partial<
  Pick<MindMapNode, 'text' | 'color' | 'bold' | 'collapsed' | 'note' | 'link' | 'fill'>
> & {
  /** `''` volta ao formato padrão, como `color: ''` volta à cor do ramo. */
  shape?: NodeShape | '';
};

/** Aplica o patch. Link inválido não grava nada e retorna false. */
export function updateNode(doc: Y.Doc, id: string, patch: NodePatch, origin?: unknown): boolean {
  const y = nodesMap(doc).get(id);
  if (!y) return false;
  if (patch.link && (patch.link.length > NODE_LINK_MAX || !isSafeLink(patch.link))) return false;
  doc.transact(() => {
    if (patch.text !== undefined) y.set('text', patch.text.slice(0, NODE_TEXT_MAX));
    // `''` em qualquer cor volta ao padrão; valor inválido também não grava.
    for (const key of ['color', 'fill'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value && HEX_COLOR.test(value)) y.set(key, value);
      else y.delete(key);
    }
    if (patch.shape !== undefined) {
      if (patch.shape && (NODE_SHAPES as readonly string[]).includes(patch.shape)) y.set('shape', patch.shape);
      else y.delete('shape');
    }
    if (patch.note !== undefined) {
      if (patch.note) y.set('note', patch.note.slice(0, NODE_NOTE_MAX));
      else y.delete('note');
    }
    if (patch.link !== undefined) {
      if (patch.link) y.set('link', patch.link);
      else y.delete('link');
    }
    for (const flag of ['bold', 'collapsed'] as const) {
      if (patch[flag] === undefined) continue;
      if (patch[flag]) y.set(flag, true);
      else y.delete(flag);
    }
  }, origin);
  return true;
}

/**
 * Move `id` para ser filho de `newParentId`, depois de `afterId`.
 * `afterId` undefined = no fim; null = como primeiro irmão.
 * Bloqueia mover a raiz e mover para dentro do próprio ramo (ciclo).
 */
export function moveNode(
  doc: Y.Doc,
  id: string,
  newParentId: string,
  afterId: string | null | undefined,
  origin?: unknown,
): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  if (!node || node.parentId === null || !nodes[newParentId]) return false;
  if (isInBranch(nodes, id, newParentId)) return false;
  const siblings = (childrenIndex(nodes).get(newParentId) ?? []).filter((s) => s.id !== id);
  const afterIndex =
    afterId === undefined ? siblings.length - 1 : afterId === null ? -1 : siblings.findIndex((s) => s.id === afterId);
  const order = orderBetween(siblings[afterIndex]?.order, siblings[afterIndex + 1]?.order);
  doc.transact(() => {
    const y = nodesMap(doc).get(id);
    y?.set('parentId', newParentId);
    y?.set('order', order);
  }, origin);
  return true;
}

/**
 * Grava o deslocamento manual de um nó, ou o apaga com `null` (SPEC-006 §2.3).
 * Como é relativo ao pai, o ramo inteiro anda junto sem escrever nos filhos.
 */
export function setNodeOffset(
  doc: Y.Doc,
  id: string,
  offset: { dx: number; dy: number } | null,
  origin?: unknown,
): boolean {
  const y = nodesMap(doc).get(id);
  if (!y) return false;
  const valid = offset ? readOffset(offset.dx, offset.dy) : null;
  if (offset && !valid) return false;
  doc.transact(() => {
    if (valid) {
      y.set('dx', valid.dx);
      y.set('dy', valid.dy);
    } else {
      y.delete('dx');
      y.delete('dy');
    }
  }, origin);
  return true;
}

/**
 * Apaga o deslocamento manual de um ramo inteiro (passe a raiz para o mapa
 * todo). Uma transação só = um Ctrl+Z. Retorna quantos nós voltaram ao automático.
 */
export function clearOffsets(doc: Y.Doc, rootId: string, origin?: unknown): number {
  const nodes = readNodes(doc);
  if (!nodes[rootId]) return 0;
  const targets = branchIds(nodes, rootId).filter((id) => nodes[id]?.dx !== undefined);
  if (targets.length === 0) return 0;
  doc.transact(() => {
    const map = nodesMap(doc);
    for (const id of targets) {
      map.get(id)?.delete('dx');
      map.get(id)?.delete('dy');
    }
  }, origin);
  return targets.length;
}

/** Troca a ordem com o irmão de cima ou de baixo (SPEC-006 §5.2). */
export function moveSibling(doc: Y.Doc, id: string, direction: 'up' | 'down', origin?: unknown): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  if (!node?.parentId) return false;
  const siblings = childrenIndex(nodes).get(node.parentId) ?? [];
  const at = siblings.findIndex((s) => s.id === id);
  const step = direction === 'up' ? -1 : 1;
  const target = siblings[at + step];
  if (!target) return false;
  // Vai para o "outro lado" do vizinho: entre ele e o seguinte naquela direção.
  const beyond = siblings[at + step * 2];
  const order =
    direction === 'up' ? orderBetween(beyond?.order, target.order) : orderBetween(target.order, beyond?.order);
  doc.transact(() => nodesMap(doc).get(id)?.set('order', order), origin);
  return true;
}

/** Aplica o reparo de árvore, se necessário. Retorna quantos nós foram reanexados. */
export function repairTree(doc: Y.Doc, origin?: unknown): number {
  const repairs = computeTreeRepairs(readNodes(doc));
  if (repairs.length === 0) return 0;
  doc.transact(() => {
    const map = nodesMap(doc);
    for (const r of repairs) {
      map.get(r.id)?.set('parentId', r.parentId);
      map.get(r.id)?.set('order', r.order);
    }
  }, origin);
  return repairs.length;
}

export { findRoot };

/**
 * Texto para a busca de qualquer documento (SPEC-003 §2.3). Um documento só tem
 * um dos dois conteúdos, então o servidor não precisa saber o tipo.
 */
export function extractDocSearchText(doc: Y.Doc, max = 10_000): string {
  const mind = extractSearchText(readNodes(doc), max);
  const diagram = extractDiagramSearchText(readDiagram(doc), max);
  return [mind, diagram].filter(Boolean).join(' ').slice(0, max);
}
