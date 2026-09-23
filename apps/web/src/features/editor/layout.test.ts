import type { MindMapNode } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import {
  branchIds,
  estimateSize,
  isInBranch,
  layoutMindMap,
  offsetsForSoloMove,
  orderBetween,
  type PositionedNode,
  resolvePositions,
} from './layout';

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

describe('offsetsForSoloMove (SPEC-007 §5.1)', () => {
  /** Posições resolvidas de um mapa, por id. */
  function positionsOf(nodes: Record<string, MindMapNode>): Map<string, PositionedNode> {
    return new Map(resolvePositions(nodes).map((p) => [p.id, p]));
  }

  it('o bloco vai para onde foi solto e os filhos ficam exatamente onde estavam', () => {
    const nodes = map(['root', null, 0], ['a', 'root', 1], ['a1', 'a', 1], ['a2', 'a', 2]);
    const antes = positionsOf(nodes);
    const destino = { x: (antes.get('a')?.x ?? 0) + 220, y: (antes.get('a')?.y ?? 0) - 140 };

    const entries = offsetsForSoloMove(antes, 'a', 'root', ['a1', 'a2'], destino);
    expect(entries).toHaveLength(3);

    // Aplica o que seria gravado e resolve de novo.
    const movidos = { ...nodes };
    for (const { id, offset } of entries) movidos[id] = { ...movidos[id]!, dx: offset.dx, dy: offset.dy };
    const depois = positionsOf(movidos);

    expect(depois.get('a')?.x).toBeCloseTo(destino.x, 6);
    expect(depois.get('a')?.y).toBeCloseTo(destino.y, 6);
    for (const filho of ['a1', 'a2']) {
      expect(depois.get(filho)?.x).toBeCloseTo(antes.get(filho)?.x ?? Number.NaN, 6);
      expect(depois.get(filho)?.y).toBeCloseTo(antes.get(filho)?.y ?? Number.NaN, 6);
    }
  });

  it('a raiz não compensa nada: o mapa inteiro acompanha', () => {
    const nodes = map(['root', null, 0], ['a', 'root', 1]);
    const antes = positionsOf(nodes);
    const entries = offsetsForSoloMove(antes, 'root', null, [], { x: 50, y: 70 });
    expect(entries).toEqual([{ id: 'root', offset: { dx: 50, dy: 70 } }]);
  });

  it('bloco sem filhos gera uma entrada só', () => {
    const nodes = map(['root', null, 0], ['a', 'root', 1]);
    expect(offsetsForSoloMove(positionsOf(nodes), 'a', 'root', [], { x: 10, y: 10 })).toHaveLength(1);
  });

  it('filho de ramo recolhido (não desenhado) é ignorado', () => {
    const nodes = map(['root', null, 0], ['a', 'root', 1], ['a1', 'a', 1]);
    const posicoes = positionsOf({ ...nodes, a: { ...nodes.a!, collapsed: true } });
    const entries = offsetsForSoloMove(posicoes, 'a', 'root', ['a1'], { x: 10, y: 10 });
    expect(entries.map((e) => e.id)).toEqual(['a']);
  });

  it('bloco que sumiu no meio do arrasto não gera escrita', () => {
    expect(offsetsForSoloMove(new Map(), 'fantasma', 'root', [], { x: 0, y: 0 })).toEqual([]);
  });
});

describe('estimateSize por fonte (SPEC-007 §5.4)', () => {
  it('fonte condensada ocupa menos e monoespaçada ocupa mais', () => {
    const texto = 'Planejamento de campanha';
    const padrao = estimateSize(texto, false, 0, 'rounded', 1).width;
    const condensada = estimateSize(texto, false, 0, 'rounded', 0.82).width;
    const mono = estimateSize(texto, false, 0, 'rounded', 1.12).width;
    expect(condensada).toBeLessThan(padrao);
    expect(mono).toBeGreaterThan(padrao);
  });

  it('o mapa inteiro acompanha o fator da fonte', () => {
    const largoPadrao = layoutMindMap(sample, 1);
    const largoCondensado = layoutMindMap(sample, 0.82);
    const xA = (list: typeof largoPadrao) => list.find((p) => p.id === 'a1')?.x ?? 0;
    expect(Math.abs(xA(largoCondensado))).toBeLessThanOrEqual(Math.abs(xA(largoPadrao)));
  });
});

// ---------- SPEC-008 §5.5: o lado do ramo é lido, não redividido ----------

describe('lado do ramo no layout (SPEC-008)', () => {
  const withSides = (...list: Array<[string, 'left' | 'right' | undefined]>) => {
    const nodes = map(['root', null, 0], ...list.map(([id], at) => [id, 'root', at + 1] as [string, string, number]));
    for (const [id, side] of list) if (side) nodes[id] = { ...nodes[id]!, side };
    return nodes;
  };

  it('documento antigo (nenhum lado gravado) desenha como antes', () => {
    const nodes = withSides(['a', undefined], ['b', undefined], ['c', undefined]);
    const byId = Object.fromEntries(layoutMindMap(nodes).map((p) => [p.id, p]));
    expect([byId.a?.side, byId.b?.side, byId.c?.side]).toEqual(['right', 'right', 'left']);
  });

  it('respeita o lado gravado em cada ramo', () => {
    const nodes = withSides(['a', 'left'], ['b', 'left'], ['c', 'right']);
    const byId = Object.fromEntries(layoutMindMap(nodes).map((p) => [p.id, p]));
    expect([byId.a?.side, byId.b?.side, byId.c?.side]).toEqual(['left', 'left', 'right']);
    expect(byId.a?.x).toBeLessThan(0);
    expect(byId.c?.x).toBeGreaterThan(0);
  });

  it('o irmão novo fica do mesmo lado e ABAIXO — o bug do PRD-008 §1', () => {
    const nodes = withSides(['a', 'right'], ['b', 'right']);
    const byId = Object.fromEntries(layoutMindMap(nodes).map((p) => [p.id, p]));
    expect(byId.b?.side).toBe('right');
    expect(byId.b?.x).toBe(byId.a?.x);
    expect(byId.b?.y).toBeGreaterThan(byId.a?.y ?? 0);
  });

  it('criar o quinto ramo não muda o lado de nenhum dos quatro', () => {
    const four = withSides(['a', 'right'], ['b', 'right'], ['c', 'left'], ['d', 'left']);
    const before = Object.fromEntries(layoutMindMap(four).map((p) => [p.id, p.side]));
    const five = { ...four, e: { id: 'e', parentId: 'root', order: 5, text: 'e', side: 'right' as const } };
    const after = Object.fromEntries(layoutMindMap(five).map((p) => [p.id, p.side]));
    for (const id of ['a', 'b', 'c', 'd']) expect(after[id]).toBe(before[id]);
  });
});
