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
  NODE_SIDES,
  NODE_TEXT_MAX,
  type NodeShape,
  type NodeSide,
} from './document.js';
import { resolveSides, sideForNewBranch } from './sides.js';
import { type DocumentStyle, documentStyleSchema, FONT_IDS, THEME_IDS } from './theme.js';
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
  const ink = y.get('ink');
  if (typeof ink === 'string' && HEX_COLOR.test(ink)) node.ink = ink;
  // SPEC-008 §2.1: lado fora da lista fechada é lido como "sem lado".
  const side = y.get('side');
  if (typeof side === 'string' && (NODE_SIDES as readonly string[]).includes(side)) node.side = side as NodeSide;
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
  if (node.side && (NODE_SIDES as readonly string[]).includes(node.side)) y.set('side', node.side);
  if (node.fill && HEX_COLOR.test(node.fill)) y.set('fill', node.fill);
  if (node.ink && HEX_COLOR.test(node.ink)) y.set('ink', node.ink);
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
  /** Lado do ramo, quando o pai é a raiz (SPEC-008 §2.3). */
  side?: NodeSide;
}

/**
 * Congela o lado de cada filho da raiz que ainda não tem um (SPEC-008 §2.2).
 * Chamado dentro da MESMA transação que cria um ramo novo: sem isso, o primeiro
 * lado gravado mudaria o cálculo dos antigos e o mapa se remexeria uma vez.
 * Deve rodar ANTES da escrita do nó novo, para não contar com ele.
 */
function freezeSides(map: Y.Map<YNode>, rootChildren: MindMapNode[]) {
  const sides = resolveSides(rootChildren);
  for (const child of rootChildren) {
    if (child.side === 'left' || child.side === 'right') continue;
    const side = sides.get(child.id);
    if (side) map.get(child.id)?.set('side', side);
  }
}

export function addNode(doc: Y.Doc, input: AddNodeInput, origin?: unknown): boolean {
  const nodes = readNodes(doc);
  if (!nodes[input.parentId] || nodes[input.id]) return false;
  const index = childrenIndex(nodes);
  const siblings = index.get(input.parentId) ?? [];
  const afterIndex = input.afterId ? siblings.findIndex((s) => s.id === input.afterId) : siblings.length - 1;
  const order = orderBetween(siblings[afterIndex]?.order, siblings[afterIndex + 1]?.order);
  // Ramo de 1º nível nasce com lado: o do irmão de referência, ou o menos cheio.
  const isBranch = findRoot(nodes)?.id === input.parentId;
  const side = isBranch ? (input.side ?? sideForNewBranch(siblings, input.afterId)) : undefined;
  doc.transact(() => {
    const map = nodesMap(doc);
    if (isBranch) freezeSides(map, siblings);
    writeNode(map, { id: input.id, parentId: input.parentId, order, text: input.text ?? '', side });
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
  Pick<MindMapNode, 'text' | 'color' | 'bold' | 'collapsed' | 'note' | 'link' | 'fill' | 'ink'>
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
    for (const key of ['color', 'fill', 'ink'] as const) {
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
  /** Lado, quando o destino é a raiz (SPEC-008 §2.3). */
  side?: NodeSide,
): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  if (!node || node.parentId === null || !nodes[newParentId]) return false;
  if (isInBranch(nodes, id, newParentId)) return false;
  const siblings = (childrenIndex(nodes).get(newParentId) ?? []).filter((s) => s.id !== id);
  const afterIndex =
    afterId === undefined ? siblings.length - 1 : afterId === null ? -1 : siblings.findIndex((s) => s.id === afterId);
  const order = orderBetween(siblings[afterIndex]?.order, siblings[afterIndex + 1]?.order);
  const toRoot = findRoot(nodes)?.id === newParentId;
  const newSide = toRoot ? (side ?? sideForNewBranch(siblings, afterId ?? undefined)) : undefined;
  doc.transact(() => {
    const map = nodesMap(doc);
    if (toRoot) freezeSides(map, siblings);
    const y = map.get(id);
    y?.set('parentId', newParentId);
    y?.set('order', order);
    // Virou ramo de 1º nível: ganha lado. Deixou de ser: o campo sai (§2.3).
    if (newSide) y?.set('side', newSide);
    else y?.delete('side');
  }, origin);
  return true;
}

/**
 * Grava o lado de um ramo de 1º nível (SPEC-008 §5.5) — é o que faz arrastar um
 * ramo para o outro lado da raiz trocar o lado de verdade, em vez de só mover
 * o desenho. Recusa em qualquer nó que não seja filho direto da raiz.
 */
export function setNodeSide(doc: Y.Doc, id: string, side: NodeSide, origin?: unknown): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  const root = findRoot(nodes);
  if (!node || !root || node.parentId !== root.id) return false;
  if (!(NODE_SIDES as readonly string[]).includes(side)) return false;
  if (node.side === side) return false;
  const siblings = (childrenIndex(nodes).get(root.id) ?? []).filter((s) => s.id !== id);
  doc.transact(() => {
    const map = nodesMap(doc);
    freezeSides(map, siblings);
    map.get(id)?.set('side', side);
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

/**
 * Grava vários deslocamentos de uma vez, numa transação só (SPEC-007 §5.1).
 * É o que faz "arrastar move só o bloco": o nó ganha o deslocamento novo e cada
 * filho direto ganha o deslocamento que o mantém parado — tudo em um Ctrl+Z.
 * Entradas inválidas são ignoradas sem derrubar as outras.
 */
export function setNodeOffsets(
  doc: Y.Doc,
  entries: Array<{ id: string; offset: { dx: number; dy: number } | null }>,
  origin?: unknown,
): number {
  const map = nodesMap(doc);
  const valid = entries
    .filter((e) => map.has(e.id))
    .map((e) => ({ id: e.id, offset: e.offset ? readOffset(e.offset.dx, e.offset.dy) : null, clear: !e.offset }))
    .filter((e) => e.clear || e.offset !== null);
  if (valid.length === 0) return 0;
  doc.transact(() => {
    for (const entry of valid) {
      const y = map.get(entry.id);
      if (!y) continue;
      if (entry.offset) {
        y.set('dx', entry.offset.dx);
        y.set('dy', entry.offset.dy);
      } else {
        y.delete('dx');
        y.delete('dy');
      }
    }
  }, origin);
  return valid.length;
}

/**
 * Troca o pai de um nó e o devolve à posição automática, numa transação só
 * (SPEC-007 §5.2) — é o "cortar e religar" e também o soltar em cima de outro
 * bloco. As guardas são as mesmas de `moveNode`: a raiz não se move, o alvo
 * precisa existir e não pode estar dentro do próprio ramo (ciclo).
 */
export function reparentNode(
  doc: Y.Doc,
  id: string,
  newParentId: string,
  origin?: unknown,
  /** Lado, quando o novo pai é a raiz (SPEC-008 §2.3). */
  side?: NodeSide,
): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  if (!node || node.parentId === null || !nodes[newParentId]) return false;
  if (isInBranch(nodes, id, newParentId)) return false;
  const siblings = (childrenIndex(nodes).get(newParentId) ?? []).filter((s) => s.id !== id);
  const order = orderBetween(siblings[siblings.length - 1]?.order, undefined);
  const toRoot = findRoot(nodes)?.id === newParentId;
  const newSide = toRoot ? (side ?? sideForNewBranch(siblings)) : undefined;
  doc.transact(() => {
    const map = nodesMap(doc);
    if (toRoot) freezeSides(map, siblings);
    const y = map.get(id);
    if (!y) return;
    y.set('parentId', newParentId);
    y.set('order', order);
    y.delete('dx');
    y.delete('dy');
    if (newSide) y.set('side', newSide);
    else y.delete('side');
  }, origin);
  return true;
}

/**
 * Apaga as cores escolhidas à mão de um ramo inteiro (SPEC-007 §5.3), para o
 * tema voltar a mandar em tudo. Uma transação = um Ctrl+Z. Não toca em texto,
 * formato nem posição.
 */
export function clearNodeColors(doc: Y.Doc, rootId: string, origin?: unknown): number {
  const nodes = readNodes(doc);
  if (!nodes[rootId]) return 0;
  const targets = branchIds(nodes, rootId).filter((id) => {
    const node = nodes[id];
    return node?.color !== undefined || node?.fill !== undefined || node?.ink !== undefined;
  });
  if (targets.length === 0) return 0;
  doc.transact(() => {
    const map = nodesMap(doc);
    for (const id of targets) {
      const y = map.get(id);
      y?.delete('color');
      y?.delete('fill');
      y?.delete('ink');
    }
  }, origin);
  return targets.length;
}

// ---------- estilo do documento (SPEC-007 §2.1) ----------

export function styleMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>('style');
}

/**
 * Estilo do documento, lido defensivamente: id fora da lista fechada e cor fora
 * de `#rrggbb` são ignorados, então um cliente adulterado não injeta nada no CSS
 * (CLAUDE.md §9). Campo ausente = o padrão do tema.
 */
export function readStyle(doc: Y.Doc): DocumentStyle {
  const map = styleMap(doc);
  const out: DocumentStyle = {};
  const theme = map.get('theme');
  if (typeof theme === 'string' && (THEME_IDS as readonly string[]).includes(theme)) {
    out.theme = theme as DocumentStyle['theme'];
  }
  const font = map.get('font');
  if (typeof font === 'string' && (FONT_IDS as readonly string[]).includes(font)) {
    out.font = font as DocumentStyle['font'];
  }
  const background = map.get('background');
  if (typeof background === 'string' && HEX_COLOR.test(background)) out.background = background;
  return out;
}

/** Patch do estilo. `''` em qualquer campo volta ao padrão; valor inválido não grava. */
export type StylePatch = { theme?: string; font?: string; background?: string };

export function setDocumentStyle(doc: Y.Doc, patch: StylePatch, origin?: unknown): boolean {
  const map = styleMap(doc);
  const clean: Array<[keyof StylePatch, string | null]> = [];
  for (const key of ['theme', 'font', 'background'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === '') {
      clean.push([key, null]);
      continue;
    }
    const check = documentStyleSchema.safeParse({ [key]: value });
    if (!check.success) return false;
    clean.push([key, value]);
  }
  if (clean.length === 0) return false;
  doc.transact(() => {
    for (const [key, value] of clean) {
      if (value === null) map.delete(key);
      else map.set(key, value);
    }
  }, origin);
  return true;
}

/** Troca a ordem com o irmão de cima ou de baixo (SPEC-006 §5.2). */
export function moveSibling(doc: Y.Doc, id: string, direction: 'up' | 'down', origin?: unknown): boolean {
  const nodes = readNodes(doc);
  const node = nodes[id];
  if (!node?.parentId) return false;
  const all = childrenIndex(nodes).get(node.parentId) ?? [];
  // Na raiz, "de cima" e "de baixo" só existem dentro do lado (SPEC-008 §2.3):
  // o vizinho do outro lado está na outra metade do mapa.
  const siblings = sameSideSiblings(nodes, node.parentId, id, all);
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

/**
 * Irmãos que contam para "mover para cima/baixo": todos, exceto na raiz, onde
 * só valem os do mesmo lado do nó (SPEC-008 §2.3).
 */
function sameSideSiblings(
  nodes: NodeRecord,
  parentId: string,
  id: string,
  siblings: MindMapNode[],
): MindMapNode[] {
  if (findRoot(nodes)?.id !== parentId) return siblings;
  const sides = resolveSides(siblings);
  const mine = sides.get(id);
  return mine ? siblings.filter((s) => sides.get(s.id) === mine) : siblings;
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
