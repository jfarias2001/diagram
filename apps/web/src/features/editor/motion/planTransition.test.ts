import { describe, expect, it } from 'vitest';
import { lerpPoint, planTransition, type Point } from './planTransition';

// SPEC-009 §5.6.1 / §7 — as regras de "o que anima" no quadro.

const P = (x: number, y: number): Point => ({ x, y });
const map = (entries: Array<[string, Point]>) => new Map(entries);

// root ─ a ─ a1 ─ a1x
//      └ b
const parents: Record<string, string | null> = { root: null, a: 'root', a1: 'a', a1x: 'a1', b: 'root', novo: 'a', neto: 'novo' };
const parentOf = (id: string) => parents[id] ?? null;

describe('planTransition', () => {
  it('nó que mudou de lugar desliza de onde está desenhado', () => {
    const plan = planTransition({
      shown: map([['root', P(0, 0)], ['a', P(100, 0)], ['b', P(100, 40)]]),
      next: map([['root', P(0, 0)], ['a', P(100, 0)], ['b', P(100, 80)]]),
      parentOf,
    });
    expect([...plan.tracks.keys()]).toEqual(['b']);
    expect(plan.tracks.get('b')).toEqual({ from: P(100, 40), to: P(100, 80) });
    expect(plan.animate).toBe(true);
  });

  it('interrompido no meio: continua da posição mostrada, sem pulo', () => {
    const plan = planTransition({
      shown: map([['b', P(100, 55)]]), // estava a caminho de 80
      next: map([['b', P(100, 120)]]),
      parentOf,
    });
    expect(plan.tracks.get('b')?.from).toEqual(P(100, 55));
  });

  it('nó novo nasce saindo do pai', () => {
    const plan = planTransition({
      shown: map([['root', P(0, 0)], ['a', P(100, 0)]]),
      next: map([['root', P(0, 0)], ['a', P(100, 0)], ['novo', P(200, 0)]]),
      parentOf,
    });
    expect(plan.born).toEqual(new Set(['novo']));
    expect(plan.tracks.get('novo')).toEqual({ from: P(100, 0), to: P(200, 0) });
  });

  it('pai também novo: o neto sai do avô (expandir um ramo)', () => {
    const plan = planTransition({
      shown: map([['root', P(0, 0)], ['a', P(100, 0)]]),
      next: map([['root', P(0, 0)], ['a', P(100, 0)], ['novo', P(200, 0)], ['neto', P(300, 0)]]),
      parentOf,
    });
    expect(plan.tracks.get('neto')?.from).toEqual(P(100, 0));
  });

  it('recolher: os que somem viram fantasmas indo para o ancestral visível', () => {
    const plan = planTransition({
      shown: map([['root', P(0, 0)], ['a', P(100, 0)], ['a1', P(200, 0)], ['a1x', P(300, 0)]]),
      next: map([['root', P(0, 0)], ['a', P(100, 0)]]),
      parentOf,
    });
    expect(plan.ghosts).toEqual([
      { id: 'a1', from: P(200, 0), to: P(100, 0) },
      { id: 'a1x', from: P(300, 0), to: P(100, 0) },
    ]);
  });

  it('sem ancestral presente (raiz trocada, restauração), some sem fantasma', () => {
    const plan = planTransition({
      shown: map([['a', P(100, 0)]]),
      next: map([['x', P(0, 0)]]),
      parentOf,
    });
    expect(plan.ghosts).toEqual([]);
  });

  it('mudança grande demais não anima', () => {
    const shown = new Map<string, Point>();
    const next = new Map<string, Point>();
    for (let i = 0; i < 301; i++) {
      shown.set(`n${i}`, P(0, i));
      next.set(`n${i}`, P(50, i));
    }
    const plan = planTransition({ shown, next, parentOf: () => null });
    expect(plan.animate).toBe(false);
    expect(planTransition({ shown, next, parentOf: () => null, maxAnimated: 400 }).animate).toBe(true);
  });

  it('deslocamento menor que minDistance não anima (setas do fluxograma, fim do arrasto)', () => {
    const plan = planTransition({
      shown: map([['s', P(0, 0)]]),
      next: map([['s', P(8, 0)]]),
      parentOf,
      minDistance: 24,
    });
    expect(plan.tracks.size).toBe(0);
  });

  it('nada mudou: plano vazio', () => {
    const same = map([['root', P(0, 0)], ['a', P(100, 0)]]);
    const plan = planTransition({ shown: same, next: same, parentOf });
    expect(plan.tracks.size + plan.ghosts.length + plan.born.size).toBe(0);
  });

  it('ciclo forjado no parentOf não trava', () => {
    const plan = planTransition({
      shown: map([['root', P(0, 0)]]),
      next: map([['x', P(1, 1)]]),
      parentOf: (id) => (id === 'x' ? 'y' : 'x'),
    });
    expect(plan.born.has('x')).toBe(true);
  });
});

describe('lerpPoint', () => {
  it('vai de from (0) a to (1)', () => {
    expect(lerpPoint(P(0, 0), P(10, 20), 0)).toEqual(P(0, 0));
    expect(lerpPoint(P(0, 0), P(10, 20), 0.5)).toEqual(P(5, 10));
    expect(lerpPoint(P(0, 0), P(10, 20), 1)).toEqual(P(10, 20));
  });
});
