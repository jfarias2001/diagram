// Traço da ligação que afina do pai para o filho (SPEC-007 §5.5). É a mesma
// curva de Bézier horizontal que o React Flow desenha, só que preenchida: um
// polígono entre dois deslocamentos da curva, largo na saída e fino na chegada.

const SAMPLES = 24;
/** Quanto a curva "puxa" para os lados, em fração da distância horizontal. */
const CURVATURE = 0.5;
const MIN_WIDTH = 0.4;

interface Point {
  x: number;
  y: number;
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

function cubicPrime(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
}

/** Pontos de controle: saem na horizontal das duas pontas, como no mapa. */
function controls(sx: number, tx: number): [number, number] {
  const pull = Math.max(24, Math.abs(tx - sx) * CURVATURE) * Math.sign(tx - sx || 1);
  return [sx + pull, tx - pull];
}

/**
 * Caminho fechado (`d` de um `<path>` preenchido) ligando as duas pontas, com
 * espessura `startWidth` na saída e `endWidth` na chegada.
 */
export function taperedPath(
  source: Point,
  target: Point,
  startWidth: number,
  endWidth: number,
): string {
  const w0 = Math.max(MIN_WIDTH, startWidth);
  const w1 = Math.max(MIN_WIDTH, endWidth);
  const [cx1, cx2] = controls(source.x, target.x);
  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = cubic(source.x, cx1, cx2, target.x, t);
    const y = cubic(source.y, source.y, target.y, target.y, t);
    let dx = cubicPrime(source.x, cx1, cx2, target.x, t);
    let dy = cubicPrime(source.y, source.y, target.y, target.y, t);
    const len = Math.hypot(dx, dy);
    // Pontas coincidentes: a derivada zera. Cai numa normal vertical.
    if (len < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    const half = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: x - dy * half, y: y + dx * half });
    right.push({ x: x + dy * half, y: y - dx * half });
  }

  const round = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const forward = left.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p)}`).join('');
  const back = right
    .slice()
    .reverse()
    .map((p) => `L${round(p)}`)
    .join('');
  return `${forward}${back}Z`;
}

/**
 * Espessura de saída de um nível: o primeiro ramo é o mais grosso e vai
 * afinando, com um piso para não sumir em mapas fundos.
 */
export function edgeWidthForDepth(base: number, depth: number): number {
  return Math.max(1.2, base * 0.82 ** Math.max(0, depth - 1));
}
