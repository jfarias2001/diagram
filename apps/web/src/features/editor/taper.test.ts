import { describe, expect, it } from 'vitest';
import { edgeWidthForDepth, taperedPath } from './taper';

/** Extrai os pares de coordenadas de um `d`. */
function points(d: string): Array<{ x: number; y: number }> {
  return [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

describe('taperedPath (SPEC-007 §5.5)', () => {
  it('devolve um caminho fechado que começa com M e termina com Z', () => {
    const d = taperedPath({ x: 0, y: 0 }, { x: 200, y: 60 }, 6, 2);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(points(d).length).toBeGreaterThan(20);
  });

  it('é grosso na saída e fino na chegada', () => {
    const d = taperedPath({ x: 0, y: 0 }, { x: 200, y: 0 }, 8, 2);
    const list = points(d);
    const first = list[0]!;
    const last = list[list.length - 1]!;
    // Primeiro e último ponto são os dois lados da MESMA ponta (ida e volta).
    expect(Math.abs(first.y - last.y)).toBeCloseTo(8, 1);

    const meio = Math.floor(list.length / 2);
    const larguraNaChegada = Math.abs(list[meio - 1]!.y - list[meio]!.y);
    expect(larguraNaChegada).toBeCloseTo(2, 1);
  });

  it('não quebra com as pontas no mesmo lugar', () => {
    const d = taperedPath({ x: 10, y: 10 }, { x: 10, y: 10 }, 4, 1);
    expect(d).toContain('M');
    expect(points(d).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('funciona para os dois lados do mapa', () => {
    const direita = taperedPath({ x: 0, y: 0 }, { x: 150, y: 20 }, 5, 2);
    const esquerda = taperedPath({ x: 0, y: 0 }, { x: -150, y: 20 }, 5, 2);
    expect(points(direita).some((p) => p.x > 100)).toBe(true);
    expect(points(esquerda).some((p) => p.x < -100)).toBe(true);
  });

  it('espessura nunca fica negativa nem some', () => {
    const d = taperedPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, -5);
    expect(points(d).every((p) => Number.isFinite(p.y))).toBe(true);
  });
});

describe('edgeWidthForDepth', () => {
  it('afina com a profundidade mas nunca desaparece', () => {
    const base = 3.5;
    const larguras = [1, 2, 3, 8, 40].map((d) => edgeWidthForDepth(base, d));
    expect(larguras[0]).toBeCloseTo(base, 5);
    expect(larguras[1]!).toBeLessThan(larguras[0]!);
    expect(larguras[4]!).toBeGreaterThanOrEqual(1.2);
  });
});
