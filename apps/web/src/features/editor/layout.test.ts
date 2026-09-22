import type { MindMapNode } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import { branchIds, estimateSize, isInBranch, layoutMindMap, orderBetween, resolvePositions } from './layout';

function map(...list: Array<[string, string | null, number]>): Record<string, MindMapNode> {
  return Object.fromEntries(list.map(([id, parentId, order]) => [id, { id, parentId, order, text: id }]));
}

const sample = map(['root', null, 0], ['a', 'root', 1], ['b', 'root', 2], ['c', 'root', 3], ['a1', 'a', 1]);

describe('layoutMindMap', () => {
  it('coloca a raiz no centro e divide os ramos entre direita e esquerda', () => {
    const byId = Object.fromEntries(layoutMindMap(sample).map((p) => [p.id, p]));
    expect(byId.root).toMatchObject({ x: 0, y: 0, side: 'root' });
    expect(byId.a?.side).toBe('right');
    expect(byId.b?.side).toBe('right');
    expect(byId.c?.side).toBe('left');
    expect(byId.a?.x).toBeGreaterThan(0);
    expect(byId.c?.x).toBeLessThan(0);
    expect(byId.a1?.x).toBeGreaterThan(byId.a?.x ?? 0);
  });

  it('esconde filhos de ramos colapsados', () => {
    const collapsed = { ...sample, a: { ...sample.a!, collapsed: true } };
    expect(layoutMindMap(collapsed).map((p) => p.id)).not.toContain('a1');
  });
});

describe('integridade da árvore', () => {
  it('detecta movimento para dentro do próprio ramo', () => {
    expect(isInBranch(sample, 'a', 'a1')).toBe(true);
    expect(isInBranch(sample, 'a', 'a')).toBe(true);
    expect(isInBranch(sample, 'a', 'b')).toBe(false);
  });

  it('lista o ramo inteiro', () => {
    expect(branchIds(sample, 'a').sort()).toEqual(['a', 'a1']);
  });

  it('calcula ordem entre irmãos', () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(3, undefined)).toBe(4);
    expect(orderBetween(undefined, 1)).toBe(0);
  });
});

describe('layout sem sobreposição', () => {
  it('irmãos com texto longo e várias linhas não se sobrepõem', () => {
    const long = 'um texto bem comprido que vai quebrar em várias linhas dentro do nó do mapa mental';
    const nodes = map(['root', null, 0], ['a', 'root', 1], ['x', 'a', 1], ['y', 'a', 2], ['z', 'a', 3]);
    nodes.x!.text = long;
    nodes.y!.text = 'linha 1\nlinha 2\nlinha 3';
    const pos = Object.fromEntries(layoutMindMap(nodes).map((p) => [p.id, p]));
    const box = (id: string) => ({ ...estimateSize(nodes[id]!.text), y: pos[id]!.y });
    for (const [a, b] of [['x', 'y'], ['y', 'z']] as const) {
      const A = box(a);
      const B = box(b);
      expect(B.y - A.y).toBeGreaterThanOrEqual((A.height + B.height) / 2);
    }
  });

  it('coluna dos netos começa depois do filho mais largo', () => {
    const nodes = map(['root', null, 0], ['a', 'root', 1], ['a1', 'a', 1]);
    nodes.a!.text = 'um ramo com um título bastante longo';
    const pos = Object.fromEntries(layoutMindMap(nodes).map((p) => [p.id, p]));
    expect(pos.a1!.x).toBeGreaterThanOrEqual(pos.a!.x + estimateSize(nodes.a!.text).width);
  });
});

// ---------- SPEC-006 §2.2: posições resolvidas (automático + manual) ----------

describe('resolvePositions', () => {
  it('sem deslocamento manual, é exatamente o layout automático', () => {
    expect(resolvePositions(sample)).toEqual(layoutMindMap(sample));
  });

  it('desloca o nó movido e leva o ramo junto, sem mexer nos outros', () => {
    const auto = Object.fromEntries(layoutMindMap(sample).map((p) => [p.id, p]));
    const moved = { ...sample, a: { ...sample.a!, dx: 400, dy: 250 } };
    const byId = Object.fromEntries(resolvePositions(moved).map((p) => [p.id, p]));

    // 'a' fica onde foi solto (relativo à raiz, que está em 0,0).
    expect(byId.a).toMatchObject({ x: 400, y: 250 });
    // o filho mantém o desenho relativo ao pai.
    const relX = (auto.a1?.x ?? 0) - (auto.a?.x ?? 0);
    const relY = (auto.a1?.y ?? 0) - (auto.a?.y ?? 0);
    expect(byId.a1?.x).toBeCloseTo(400 + relX);
    expect(byId.a1?.y).toBeCloseTo(250 + relY);
    // irmãos não movidos continuam onde estavam.
    expect(byId.b).toMatchObject({ x: auto.b?.x, y: auto.b?.y });
  });

  it('mover a raiz move o mapa inteiro', () => {
    const auto = Object.fromEntries(layoutMindMap(sample).map((p) => [p.id, p]));
    const moved = { ...sample, root: { ...sample.root!, dx: -100, dy: 60 } };
    const byId = Object.fromEntries(resolvePositions(moved).map((p) => [p.id, p]));
    expect(byId.root).toMatchObject({ x: -100, y: 60 });
    expect(byId.b?.x).toBeCloseTo((auto.b?.x ?? 0) - 100);
    expect(byId.b?.y).toBeCloseTo((auto.b?.y ?? 0) + 60);
  });

  it('filho novo de um pai movido nasce perto do pai', () => {
    const moved = {
      ...sample,
      a: { ...sample.a!, dx: 500, dy: 500 },
      novo: { id: 'novo', parentId: 'a', order: 2, text: 'Novo' },
    };
    const byId = Object.fromEntries(resolvePositions(moved).map((p) => [p.id, p]));
    const dist = Math.hypot((byId.novo?.x ?? 0) - 500, (byId.novo?.y ?? 0) - 500);
    expect(dist).toBeLessThan(400);
  });

  it('não desenha filhos de ramo colapsado nem estoura a pilha em mapa fundo', () => {
    const collapsed = { ...sample, a: { ...sample.a!, collapsed: true, dx: 10, dy: 10 } };
    expect(resolvePositions(collapsed).map((p) => p.id)).not.toContain('a1');

    const deep: Record<string, MindMapNode> = { root: { id: 'root', parentId: null, order: 0, text: 'r' } };
    for (let i = 0; i < 5000; i++) {
      deep[`n${i}`] = { id: `n${i}`, parentId: i === 0 ? 'root' : `n${i - 1}`, order: 1, text: 'x' };
    }
    deep.n0 = { ...deep.n0!, dx: 20, dy: 20 };
    expect(resolvePositions(deep)).toHaveLength(5001);
  });
});

describe('estimateSize por formato (SPEC-006 §5.4)', () => {
  it('elipse e hexágono pedem mais espaço que o arredondado', () => {
    const base = estimateSize('Um tópico qualquer');
    expect(estimateSize('Um tópico qualquer', false, 0, 'ellipse').width).toBeGreaterThan(base.width);
    expect(estimateSize('Um tópico qualquer', false, 0, 'hexagon').width).toBeGreaterThan(base.width);
    expect(estimateSize('Um tópico qualquer', false, 0, 'ellipse').height).toBeGreaterThan(base.height);
  });
});
