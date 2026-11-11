import { childrenIndex, findRoot, type FlowEdgeRecord, type NodeRecord, resolveSides, type Shape } from '@diagram/shared';

// SPEC-009 §5.9 — busca dentro do documento (Ctrl+F). Tudo local: nada vai
// para a rede, e revelar um resultado escondido NÃO mexe no documento dos
// colegas (o ramo é aberto só no desenho de quem busca).

export const MAX_HITS = 500;

/** Sem acento e sem caixa: "Orçamento" acha "orcamento". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

/**
 * Ids dos tópicos com `query` no texto ou na nota, em ORDEM DE LEITURA:
 * raiz, ramos da direita de cima para baixo, depois os da esquerda, cada um em
 * profundidade. Ramos recolhidos entram (o resultado é revelado localmente).
 */
export function searchNodes(nodes: NodeRecord, query: string): string[] {
  const needle = normalizeText(query.trim());
  if (!needle) return [];
  const root = findRoot(nodes);
  if (!root) return [];
  const index = childrenIndex(nodes);
  const firstLevel = index.get(root.id) ?? [];
  const sides = resolveSides(firstLevel);
  const ordered = [
    ...firstLevel.filter((c) => sides.get(c.id) !== 'left'),
    ...firstLevel.filter((c) => sides.get(c.id) === 'left'),
  ];

  const out: string[] = [];
  const matches = (id: string) => {
    const node = nodes[id];
    return !!node && (normalizeText(node.text).includes(needle) || normalizeText(node.note ?? '').includes(needle));
  };
  if (matches(root.id)) out.push(root.id);
  // Pilha explícita: um ramo muito fundo não estoura a pilha de chamadas.
  const stack = [...ordered].reverse().map((n) => n.id);
  const seen = new Set<string>([root.id]);
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    if (matches(id)) out.push(id);
    const kids = index.get(id) ?? [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push((kids[i] as { id: string }).id);
  }
  return out;
}

/** Ancestrais de `id`, do pai até a raiz. */
export function ancestorsOf(nodes: NodeRecord, id: string): string[] {
  const out: string[] = [];
  let current = nodes[id]?.parentId ?? null;
  while (current && out.length < 10_000 && !out.includes(current)) {
    out.push(current);
    current = nodes[current]?.parentId ?? null;
  }
  return out;
}

/**
 * O mesmo registro, mas com os ancestrais recolhidos de `id` abertos — só
 * para o desenho local. Cópia rasa dos objetos afetados; a entrada não muda.
 */
export function withLocalExpand(nodes: NodeRecord, id: string | null): NodeRecord {
  if (!id || !nodes[id]) return nodes;
  const closed = ancestorsOf(nodes, id).filter((a) => nodes[a]?.collapsed);
  if (closed.length === 0) return nodes;
  const out: NodeRecord = { ...nodes };
  for (const a of closed) out[a] = { ...(nodes[a] as NodeRecord[string]), collapsed: false };
  return out;
}

export type DiagramHit = { kind: 'shape'; id: string } | { kind: 'edge'; id: string };

/** Formas (texto) e conectores (rótulo), de cima para baixo e da esquerda para a direita. */
export function searchDiagram(
  shapes: Record<string, Shape>,
  edges: Record<string, FlowEdgeRecord>,
  query: string,
): DiagramHit[] {
  const needle = normalizeText(query.trim());
  if (!needle) return [];
  const hits: Array<DiagramHit & { x: number; y: number }> = [];
  for (const shape of Object.values(shapes)) {
    if (normalizeText(shape.text).includes(needle)) hits.push({ kind: 'shape', id: shape.id, x: shape.x, y: shape.y });
  }
  for (const edge of Object.values(edges)) {
    if (!edge.label || !normalizeText(edge.label).includes(needle)) continue;
    const a = shapes[edge.source];
    const b = shapes[edge.target];
    if (!a || !b) continue;
    hits.push({ kind: 'edge', id: edge.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  hits.sort((p, q) => p.y - q.y || p.x - q.x);
  return hits.map(({ kind, id }) => ({ kind, id }) as DiagramHit);
}
