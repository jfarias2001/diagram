import { childrenIndex, findRoot, type MindMapNode, type NodeShape } from '@diagram/shared';
import { hierarchy, tree } from 'd3-hierarchy';

export type Side = 'root' | 'left' | 'right';

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  side: Side;
}

interface TreeItem {
  id: string;
  children: TreeItem[];
}

// Estimativa do tamanho renderizado (MindNode): evita sobreposição sem medir o DOM.
const CHAR_W = 7.4;
const ROOT_CHAR_W = 10.5;
const LINE_H = 20;
const MAX_W = 260;
const ROOT_MAX_W = 320;
const H_GAP = 56;
const SIBLING_GAP = 12;
const COUSIN_GAP = 26;

/** Largura de cada ícone de nota/link ao lado do texto (MindNode). */
export const NODE_ICON_W = 20;

/**
 * Folga extra por formato (SPEC-006 §5.4): elipse e hexágono precisam de mais
 * margem para o texto caber dentro do desenho; o sublinhado não tem caixa.
 */
export const SHAPE_PADDING: Record<NodeShape, { x: number; y: number }> = {
  rounded: { x: 0, y: 0 },
  rect: { x: 0, y: 0 },
  capsule: { x: 14, y: 0 },
  ellipse: { x: 38, y: 18 },
  hexagon: { x: 30, y: 4 },
  underline: { x: -8, y: 2 },
};

export function estimateSize(
  text: string,
  isRoot = false,
  icons = 0,
  shape: NodeShape = 'rounded',
  /** Largura média da fonte em uso, relativa à padrão (SPEC-007 §5.4). */
  widthFactor = 1,
): { width: number; height: number } {
  const charW = (isRoot ? ROOT_CHAR_W : CHAR_W) * widthFactor;
  const extra = SHAPE_PADDING[shape] ?? SHAPE_PADDING.rounded;
  const padX = (isRoot ? 52 : 32) + extra.x;
  const maxW = isRoot ? ROOT_MAX_W : MAX_W;
  const inner = maxW - padX;
  let lines = 0;
  let widest = 0;
  for (const line of (text || ' ').split('\n')) {
    const w = Math.max(1, line.length) * charW;
    widest = Math.max(widest, Math.min(w, inner));
    lines += Math.max(1, Math.ceil(w / inner));
  }
  return {
    width: Math.max(48, Math.ceil(widest + padX + icons * NODE_ICON_W)),
    height: lines * (isRoot ? 26 : LINE_H) + (isRoot ? 28 : 16) + extra.y * 2,
  };
}

/**
 * Layout estilo MindMeister: raiz no centro, primeira metade dos ramos à
 * direita e a outra metade à esquerda. Ramos colapsados não entram.
 * Colunas se ajustam ao nó mais largo de cada nível; linhas, à altura de cada nó.
 */
export function layoutMindMap(nodes: Record<string, MindMapNode>, widthFactor = 1): PositionedNode[] {
  const index = childrenIndex(nodes);
  const root = findRoot(nodes);
  if (!root) return [];

  const size = new Map<string, { width: number; height: number }>();
  const sizeOf = (id: string) => {
    let s = size.get(id);
    if (!s) {
      const node = nodes[id];
      s = estimateSize(
        node?.text ?? '',
        id === root.id,
        (node?.note ? 1 : 0) + (node?.link ? 1 : 0),
        node?.shape ?? 'rounded',
        widthFactor,
      );
      size.set(id, s);
    }
    return s;
  };

  /**
   * Monta o item da árvore sem recursão: um mapa muito profundo estourava a
   * pilha de chamadas e derrubava o editor inteiro.
   */
  const build = (root: MindMapNode): TreeItem => {
    const item: TreeItem = { id: root.id, children: [] };
    const stack: Array<{ node: MindMapNode; item: TreeItem }> = [{ node: root, item }];
    while (stack.length > 0) {
      const { node, item: parent } = stack.pop() as { node: MindMapNode; item: TreeItem };
      if (node.collapsed) continue;
      for (const child of index.get(node.id) ?? []) {
        const childItem: TreeItem = { id: child.id, children: [] };
        parent.children.push(childItem);
        stack.push({ node: child, item: childItem });
      }
    }
    return item;
  };

  const branches = root.collapsed ? [] : (index.get(root.id) ?? []);
  const splitAt = Math.ceil(branches.length / 2);
  const sides: Array<[Exclude<Side, 'root'>, MindMapNode[]]> = [
    ['right', branches.slice(0, splitAt)],
    ['left', branches.slice(splitAt)],
  ];

  const result: PositionedNode[] = [{ id: root.id, x: 0, y: 0, side: 'root' }];
  // nodeSize [1,1] faz a separação valer em pixels: metade de cada altura + folga.
  const layout = tree<TreeItem>()
    .nodeSize([1, 1])
    .separation(
      (a, b) =>
        (sizeOf(a.data.id).height + sizeOf(b.data.id).height) / 2 + (a.parent === b.parent ? SIBLING_GAP : COUSIN_GAP),
    );

  for (const [side, sideBranches] of sides) {
    if (sideBranches.length === 0) continue;
    const laid = layout(hierarchy<TreeItem>({ id: root.id, children: sideBranches.map(build) }));
    const descendants = laid.descendants();

    // Deslocamento horizontal de cada nível = soma das larguras máximas anteriores.
    const maxWidth: number[] = [];
    for (const item of descendants) {
      if (item.depth === 0) continue;
      maxWidth[item.depth] = Math.max(maxWidth[item.depth] ?? 0, sizeOf(item.data.id).width);
    }
    const offset: number[] = [0, sizeOf(root.id).width / 2 + H_GAP];
    for (let d = 2; d < maxWidth.length; d++) offset[d] = (offset[d - 1] ?? 0) + (maxWidth[d - 1] ?? 0) + H_GAP;

    const direction = side === 'right' ? 1 : -1;
    for (const item of descendants) {
      if (item.depth === 0) continue;
      result.push({ id: item.data.id, x: (offset[item.depth] ?? 0) * direction, y: item.x, side });
    }
  }

  return result;
}

/**
 * Posição final de cada nó (SPEC-006 §2.2):
 *
 *   rel(n)    = (dx, dy) manual, ou o delta que o layout automático daria
 *   pos(raiz) = (dx, dy) da raiz, ou (0, 0)
 *   pos(n)    = pos(pai) + rel(n)
 *
 * Um nó movido à mão arrasta o ramo inteiro sem que nada seja escrito nos
 * filhos, e um filho novo (sem dx/dy) nasce na posição automática perto do pai.
 */
export function resolvePositions(nodes: Record<string, MindMapNode>, widthFactor = 1): PositionedNode[] {
  const auto = layoutMindMap(nodes, widthFactor);
  const hasManual = auto.some((p) => nodes[p.id]?.dx !== undefined);
  if (!hasManual) return auto;

  const autoById = new Map(auto.map((p) => [p.id, p]));
  const index = childrenIndex(nodes);
  const root = findRoot(nodes);
  if (!root) return auto;

  const out: PositionedNode[] = [];
  const rootNode = nodes[root.id];
  // Pilha explícita: mapas fundos não podem estourar a pilha de chamadas.
  const stack: PositionedNode[] = [
    { id: root.id, x: rootNode?.dx ?? 0, y: rootNode?.dy ?? 0, side: 'root' },
  ];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as PositionedNode;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    out.push(current);
    const parentAuto = autoById.get(current.id);
    for (const child of index.get(current.id) ?? []) {
      const childAuto = autoById.get(child.id);
      if (!childAuto || !parentAuto) continue; // ramo colapsado: não é desenhado
      const manual = child.dx !== undefined && child.dy !== undefined;
      const relX = manual ? (child.dx as number) : childAuto.x - parentAuto.x;
      const relY = manual ? (child.dy as number) : childAuto.y - parentAuto.y;
      stack.push({ id: child.id, x: current.x + relX, y: current.y + relY, side: childAuto.side });
    }
  }
  return out;
}

export { branchIds, childrenIndex, isInBranch, orderBetween } from '@diagram/shared';

/**
 * Deslocamentos a gravar quando um bloco é arrastado sozinho (SPEC-007 §5.1).
 *
 * O bloco vai para `to`; cada filho direto recebe o deslocamento que o deixa
 * exatamente onde já estava, porque a posição continua sendo relativa ao pai:
 *
 *   pos'(filho) = pos'(bloco) + rel'(filho)
 *               = (pos(bloco) + Δ) + (pos(filho) - pos(bloco) - Δ)
 *               = pos(filho)
 *
 * Devolve uma lista só, para `setNodeOffsets` gravar tudo numa transação.
 */
export function offsetsForSoloMove(
  positions: Map<string, PositionedNode>,
  nodeId: string,
  parentId: string | null,
  childIds: string[],
  to: { x: number; y: number },
): Array<{ id: string; offset: { dx: number; dy: number } }> {
  const from = positions.get(nodeId);
  if (!from) return [];
  const parent = parentId ? positions.get(parentId) : { x: 0, y: 0 };
  if (!parent) return [];
  const dxTotal = to.x - from.x;
  const dyTotal = to.y - from.y;
  const out = [{ id: nodeId, offset: { dx: to.x - parent.x, dy: to.y - parent.y } }];
  for (const childId of childIds) {
    const child = positions.get(childId);
    if (!child) continue; // ramo recolhido: não é desenhado, então não se move
    out.push({ id: childId, offset: { dx: child.x - from.x - dxTotal, dy: child.y - from.y - dyTotal } });
  }
  return out;
}
