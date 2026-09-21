import type { MindMapNode } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import { branchIds, estimateSize, isInBranch, layoutMindMap, orderBetween } from './layout';

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
