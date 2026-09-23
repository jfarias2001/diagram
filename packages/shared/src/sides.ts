import type { MindMapNode, NodeSide } from './document.js';

// Lado de cada ramo do mapa mental (SPEC-008 §2.2).
//
// Antes, o lado era recalculado a cada desenho dividindo os ramos ao meio — e
// por isso criar um irmão jogava blocos para o outro lado da raiz (PRD-008 §1).
// Agora o lado é DADO: quem tem, manda. Esta função só decide o lado de quem
// ainda não tem, de forma pura e determinística, para dois clientes com os
// mesmos nós chegarem sempre ao mesmo desenho.

/** Regra antiga: a primeira metade à direita, o resto à esquerda. */
function legacySides(children: MindMapNode[]): Map<string, NodeSide> {
  const splitAt = Math.ceil(children.length / 2);
  return new Map(children.map((child, at) => [child.id, at < splitAt ? 'right' : 'left']));
}

/**
 * Lado de cada filho direto da raiz. `children` precisa vir **ordenado** por
 * `order` (o que `childrenIndex` já devolve).
 *
 * Enquanto NENHUM ramo tiver lado gravado, vale a regra antiga — é isso que faz
 * um documento criado antes da SPEC-008 abrir exatamente como abria. A partir
 * do primeiro lado gravado, quem não tem herda do vizinho mais próximo (antes,
 * depois) e, em último caso, vai para o lado com menos ramos.
 */
export function resolveSides(children: MindMapNode[]): Map<string, NodeSide> {
  const explicit = children.filter((c) => c.side === 'left' || c.side === 'right');
  if (explicit.length === 0) return legacySides(children);

  const out = new Map<string, NodeSide>();
  for (const child of children) {
    if (child.side === 'left' || child.side === 'right') out.set(child.id, child.side);
  }

  const count = (side: NodeSide) => {
    let total = 0;
    for (const value of out.values()) if (value === side) total += 1;
    return total;
  };

  for (let at = 0; at < children.length; at++) {
    const child = children[at] as MindMapNode;
    if (out.has(child.id)) continue;
    let side: NodeSide | undefined;
    for (let back = at - 1; back >= 0 && !side; back--) side = out.get((children[back] as MindMapNode).id);
    for (let ahead = at + 1; ahead < children.length && !side; ahead++) {
      const next = children[ahead] as MindMapNode;
      if (next.side === 'left' || next.side === 'right') side = next.side;
    }
    out.set(child.id, side ?? (count('left') < count('right') ? 'left' : 'right'));
  }
  return out;
}

/**
 * Lado de um ramo novo: o mesmo do irmão de referência; sem referência, o lado
 * com menos ramos (empate → direita, como a regra antiga começava).
 */
export function sideForNewBranch(children: MindMapNode[], afterId?: string): NodeSide {
  const sides = resolveSides(children);
  if (afterId) {
    const reference = sides.get(afterId);
    if (reference) return reference;
  }
  let left = 0;
  let right = 0;
  for (const side of sides.values()) {
    if (side === 'left') left += 1;
    else right += 1;
  }
  return left < right ? 'left' : 'right';
}
