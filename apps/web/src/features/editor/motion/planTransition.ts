// SPEC-009 §5.6.1 — o que anima quando o mapa muda, e de onde para onde.
// Função pura: as regras são testadas sem DOM (planTransition.test.ts).

export interface Point {
  x: number;
  y: number;
}

export interface TransitionInput {
  /** Onde cada nó ESTÁ desenhado agora (inclui o meio de uma animação). */
  shown: ReadonlyMap<string, Point>;
  /** Onde cada nó deve ficar. */
  next: ReadonlyMap<string, Point>;
  /** Pai de um nó — inclusive de nó que acabou de sumir. */
  parentOf: (id: string) => string | null;
  /** Acima disso, nada anima (colar, restaurar versão, mudança grande de colega). */
  maxAnimated?: number;
  /** Deslocamentos menores que isto não animam. */
  minDistance?: number;
}

export interface TransitionPlan {
  animate: boolean;
  tracks: Map<string, { from: Point; to: Point }>;
  born: Set<string>;
  ghosts: Array<{ id: string; from: Point; to: Point }>;
}

export const MAX_ANIMATED = 300;
/** Profundidade máxima seguida ao procurar ancestral (protege contra ciclo). */
const MAX_DEPTH = 2000;

/** Ancestral mais próximo presente em `where` (o próprio nó não conta). */
export function nearestAncestorIn(
  id: string,
  where: ReadonlyMap<string, Point>,
  parentOf: (id: string) => string | null,
): string | null {
  let current = parentOf(id);
  for (let i = 0; current !== null && i < MAX_DEPTH; i++) {
    if (where.has(current)) return current;
    current = parentOf(current);
  }
  return null;
}

export function planTransition({
  shown,
  next,
  parentOf,
  maxAnimated = MAX_ANIMATED,
  minDistance = 2,
}: TransitionInput): TransitionPlan {
  const tracks = new Map<string, { from: Point; to: Point }>();
  const born = new Set<string>();
  const ghosts: TransitionPlan['ghosts'] = [];

  for (const [id, to] of next) {
    const from = shown.get(id);
    if (from) {
      // 1) Existia e mudou: desliza de onde está DESENHADO (sem pulo se a
      //    animação anterior foi interrompida no meio).
      if (Math.hypot(to.x - from.x, to.y - from.y) > minDistance) tracks.set(id, { from, to });
      continue;
    }
    // 2) Nasceu: sai do ancestral visível mais próximo (bloco novo sai do pai;
    //    expandir um ramo faz os filhos saírem dele).
    born.add(id);
    const anchor = nearestAncestorIn(id, shown, parentOf);
    const start = anchor ? shown.get(anchor) : undefined;
    if (start) tracks.set(id, { from: start, to });
  }

  // 3) Sumiu (recolher, apagar): vira fantasma que volta para o ancestral
  //    que continua na tela. Sem ancestral, some sem fantasma.
  for (const [id, from] of shown) {
    if (next.has(id)) continue;
    const anchor = nearestAncestorIn(id, next, parentOf);
    const to = anchor ? next.get(anchor) : undefined;
    if (to) ghosts.push({ id, from, to });
  }

  // 4) Mudança grande demais: vai direto.
  const animate = tracks.size + ghosts.length <= maxAnimated;
  return { animate, tracks, born, ghosts };
}

/** Ponto entre `from` e `to` no progresso `t` (0…1, já com a curva aplicada). */
export function lerpPoint(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
