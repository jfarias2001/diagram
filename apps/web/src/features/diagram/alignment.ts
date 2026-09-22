// Guias de alinhamento (SPEC-003 §5.6). Função pura: recebe a caixa arrastada e as
// outras, devolve quanto encaixar em x/y e quais linhas desenhar.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Guide {
  /** 'v' = linha vertical em x = pos; 'h' = linha horizontal em y = pos. */
  axis: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

export interface Snap {
  dx: number;
  dy: number;
  guides: Guide[];
}

const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

/** `threshold` em unidades do quadro (6 px da tela ÷ zoom). */
export function alignmentSnap(moving: Box, others: Box[], threshold: number): Snap {
  let bestX: { diff: number; pos: number } | null = null;
  let bestY: { diff: number; pos: number } | null = null;

  for (const other of others) {
    for (const m of xs(moving)) {
      for (const o of xs(other)) {
        const diff = o - m;
        if (Math.abs(diff) <= threshold && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff, pos: o };
      }
    }
    for (const m of ys(moving)) {
      for (const o of ys(other)) {
        const diff = o - m;
        if (Math.abs(diff) <= threshold && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff, pos: o };
      }
    }
  }

  const dx = bestX?.diff ?? 0;
  const dy = bestY?.diff ?? 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];

  // Uma linha por eixo, cobrindo todas as formas alinhadas naquela posição.
  if (bestX) {
    const pos = bestX.pos;
    const aligned = others.filter((o) => xs(o).some((v) => Math.abs(v - pos) < 0.5));
    const all = [snapped, ...aligned];
    guides.push({ axis: 'v', pos, from: Math.min(...all.map((b) => b.y)), to: Math.max(...all.map((b) => b.y + b.h)) });
  }
  if (bestY) {
    const pos = bestY.pos;
    const aligned = others.filter((o) => ys(o).some((v) => Math.abs(v - pos) < 0.5));
    const all = [snapped, ...aligned];
    guides.push({ axis: 'h', pos, from: Math.min(...all.map((b) => b.x)), to: Math.max(...all.map((b) => b.x + b.w)) });
  }
  return { dx, dy, guides };
}

/** Caixa que envolve várias caixas (seleção múltipla). */
export function boundingBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}
