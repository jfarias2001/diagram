import { childrenIndex, findRoot, type MindMapNode } from '@diagram/shared';
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

export function estimateSize(text: string, isRoot = false): { width: number; height: number } {
  const charW = isRoot ? ROOT_CHAR_W : CHAR_W;
  const padX = isRoot ? 52 : 32;
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
    width: Math.max(48, Math.ceil(widest + padX)),
    height: lines * (isRoot ? 26 : LINE_H) + (isRoot ? 28 : 16),
  };
}

/**
 * Layout estilo MindMeister: raiz no centro, primeira metade dos ramos à
 * direita e a outra metade à esquerda. Ramos colapsados não entram.
 * Colunas se ajustam ao nó mais largo de cada nível; linhas, à altura de cada nó.
 */
export function layoutMindMap(nodes: Record<string, MindMapNode>): PositionedNode[] {
  const index = childrenIndex(nodes);
  const root = findRoot(nodes);
  if (!root) return [];

  const size = new Map<string, { width: number; height: number }>();
  const sizeOf = (id: string) => {
    let s = size.get(id);
    if (!s) {
      s = estimateSize(nodes[id]?.text ?? '', id === root.id);
      size.set(id, s);
    }
    return s;
  };

  const build = (node: MindMapNode): TreeItem => ({
    id: node.id,
    children: node.collapsed ? [] : (index.get(node.id) ?? []).map(build),
  });

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

export { branchIds, childrenIndex, isInBranch, orderBetween } from '@diagram/shared';
