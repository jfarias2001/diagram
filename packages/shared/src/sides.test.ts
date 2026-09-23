import { describe, expect, it } from 'vitest';
import type { MindMapNode, NodeSide } from './document.js';
import { resolveSides, sideForNewBranch } from './sides.js';

// SPEC-008 §2.2 — o lado do ramo é dado, não resultado de uma divisão feita a
// cada desenho. Estes testes travam as duas coisas que o PRD-008 §6 exige:
// documento antigo continua igual, e nenhum ramo troca de lado sozinho.

function branches(...list: Array<[string, NodeSide?]>): MindMapNode[] {
  return list.map(([id, side], at) => ({ id, parentId: 'root', order: at + 1, text: id, ...(side ? { side } : {}) }));
}

const sidesOf = (list: MindMapNode[]) => Object.fromEntries(resolveSides(list));

describe('resolveSides — sem nenhum lado gravado (documento antigo)', () => {
  it('reproduz exatamente a divisão antiga: primeira metade à direita', () => {
    expect(sidesOf(branches(['a']))).toEqual({ a: 'right' });
    expect(sidesOf(branches(['a'], ['b']))).toEqual({ a: 'right', b: 'left' });
    expect(sidesOf(branches(['a'], ['b'], ['c']))).toEqual({ a: 'right', b: 'right', c: 'left' });
    expect(sidesOf(branches(['a'], ['b'], ['c'], ['d']))).toEqual({
      a: 'right',
      b: 'right',
      c: 'left',
      d: 'left',
    });
  });

  it('divide 5 e 8 ramos como a regra antiga (ceil da metade à direita)', () => {
    const five = Object.values(sidesOf(branches(['a'], ['b'], ['c'], ['d'], ['e'])));
    expect(five).toEqual(['right', 'right', 'right', 'left', 'left']);
    const eight = Object.values(sidesOf(branches(['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h'])));
    expect(eight.filter((s) => s === 'right')).toHaveLength(4);
  });

  it('mapa sem nenhum ramo devolve mapa vazio', () => {
    expect(resolveSides([]).size).toBe(0);
  });
});

describe('resolveSides — com lado gravado', () => {
  it('respeita o lado de quem tem', () => {
    expect(sidesOf(branches(['a', 'left'], ['b', 'right']))).toEqual({ a: 'left', b: 'right' });
  });

  it('quem não tem herda do irmão anterior', () => {
    expect(sidesOf(branches(['a', 'left'], ['b'], ['c']))).toEqual({ a: 'left', b: 'left', c: 'left' });
  });

  it('sem anterior, herda do próximo', () => {
    expect(sidesOf(branches(['a'], ['b', 'left']))).toEqual({ a: 'left', b: 'left' });
  });

  it('o mais próximo ganha: cada metade fica com o seu vizinho', () => {
    expect(sidesOf(branches(['a', 'right'], ['b'], ['c', 'left'], ['d']))).toEqual({
      a: 'right',
      b: 'right',
      c: 'left',
      d: 'left',
    });
  });

  it('lado forjado é ignorado (volta a ser "sem lado")', () => {
    const forged = branches(['a', 'right'], ['b']);
    (forged[1] as unknown as { side: unknown }).side = '<script>';
    expect(sidesOf(forged)).toEqual({ a: 'right', b: 'right' });
  });
});

describe('sideForNewBranch', () => {
  it('nasce do mesmo lado do irmão de referência', () => {
    expect(sideForNewBranch(branches(['a', 'left'], ['b', 'right']), 'a')).toBe('left');
    expect(sideForNewBranch(branches(['a', 'left'], ['b', 'right']), 'b')).toBe('right');
  });

  it('sem referência, vai para o lado com menos ramos', () => {
    expect(sideForNewBranch(branches(['a', 'right'], ['b', 'right'], ['c', 'left']))).toBe('left');
  });

  it('empate vai para a direita, como a regra antiga começava', () => {
    expect(sideForNewBranch([])).toBe('right');
    expect(sideForNewBranch(branches(['a', 'right'], ['b', 'left']))).toBe('right');
  });
});

describe('nenhum ramo troca de lado quando outro nasce (PRD-008 §6)', () => {
  it('os quatro primeiros ficam parados quando o quinto é criado com lado', () => {
    const before = branches(['a'], ['b'], ['c'], ['d']);
    const frozen = before.map((n) => ({ ...n, side: resolveSides(before).get(n.id) }));
    const after = [...frozen, { id: 'e', parentId: 'root', order: 5, text: 'e', side: 'right' as NodeSide }];
    const sides = resolveSides(after);
    for (const node of before) expect(sides.get(node.id)).toBe(resolveSides(before).get(node.id));
  });
});
