import type { MindMapNode } from './document.js';

// Funções puras sobre a árvore plana (ADR-002). Usadas pelo editor e pela API.

export type NodeRecord = Record<string, MindMapNode>;

/** Filhos de cada nó, ordenados por `order` (desempate por id, determinístico). */
export function childrenIndex(nodes: NodeRecord): Map<string | null, MindMapNode[]> {
  const index = new Map<string | null, MindMapNode[]>();
  for (const node of Object.values(nodes)) {
    const list = index.get(node.parentId) ?? [];
    list.push(node);
    index.set(node.parentId, list);
  }
  for (const list of index.values()) list.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  return index;
}

/** A raiz válida: entre nós sem pai, o de menor id (SPEC-001 §2.2). */
export function findRoot(nodes: NodeRecord): MindMapNode | undefined {
  let root: MindMapNode | undefined;
  for (const node of Object.values(nodes)) {
    if (node.parentId === null && (!root || node.id < root.id)) root = node;
  }
  return root;
}

/** Ordem para inserir um nó entre `before` e `after` (fracionária). */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/** true se `candidateId` for `nodeId` ou estiver dentro do ramo de `nodeId`. */
export function isInBranch(nodes: NodeRecord, nodeId: string, candidateId: string): boolean {
  const seen = new Set<string>();
  let current: MindMapNode | undefined = nodes[candidateId];
  while (current && !seen.has(current.id)) {
    if (current.id === nodeId) return true;
    seen.add(current.id);
    current = current.parentId ? nodes[current.parentId] : undefined;
  }
  return false;
}

/** Ids do ramo inteiro (o nó e todos os descendentes). */
export function branchIds(nodes: NodeRecord, nodeId: string): string[] {
  const index = childrenIndex(nodes);
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    for (const child of index.get(id) ?? []) stack.push(child.id);
  }
  return ids;
}

export interface TreeRepair {
  id: string;
  parentId: string;
  order: number;
}

/**
 * Nós que não chegam à raiz (órfãos, ciclos ou raízes extras) e para onde
 * devem ir: filhos diretos da raiz, no fim. Determinístico — dois clientes
 * calculam exatamente o mesmo reparo (SPEC-001 §2.2).
 */
export function computeTreeRepairs(nodes: NodeRecord): TreeRepair[] {
  const root = findRoot(nodes);
  if (!root) return [];

  const reachable = new Set<string>();
  const index = childrenIndex(nodes);
  const stack = [root.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const child of index.get(id) ?? []) stack.push(child.id);
  }

  const unreachable = Object.values(nodes)
    .filter((n) => !reachable.has(n.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  // Só o "topo" de cada pedaço solto é reanexado; os descendentes vêm junto.
  const tops = unreachable.filter((n) => {
    if (n.parentId === null || !nodes[n.parentId]) return true;
    // Em ciclo: o menor id do ciclo é o topo.
    const cycle: string[] = [];
    let current: MindMapNode | undefined = n;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      cycle.push(current.id);
      current = current.parentId ? nodes[current.parentId] : undefined;
    }
    if (!current) return false; // pedaço termina num órfão, que será o topo
    const cycleStart = cycle.indexOf(current.id);
    const members = cycle.slice(cycleStart);
    return members.includes(n.id) && n.id === members.sort()[0];
  });

  const rootChildren = index.get(root.id) ?? [];
  let lastOrder = rootChildren.at(-1)?.order ?? 0;
  return tops.map((n) => {
    lastOrder += 1;
    return { id: n.id, parentId: root.id, order: lastOrder };
  });
}

/** Texto de todos os nós, para busca (limitado a `max` chars). */
export function extractSearchText(nodes: NodeRecord, max = 10_000): string {
  const parts: string[] = [];
  let size = 0;
  for (const node of Object.values(nodes)) {
    const text = node.text.trim();
    if (!text) continue;
    parts.push(text);
    size += text.length + 1;
    if (size >= max) break;
  }
  return parts.join(' ').slice(0, max);
}
