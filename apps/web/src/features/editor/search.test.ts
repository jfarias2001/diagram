import type { MindMapNode, NodeRecord } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import { ancestorsOf, normalizeText, searchDiagram, searchNodes, withLocalExpand } from './search';

// SPEC-009 §5.9 / §7 — busca no documento.

const n = (id: string, parentId: string | null, order: number, text: string, extra: Partial<MindMapNode> = {}) =>
  ({ id, parentId, order, text, ...extra }) as MindMapNode;

// Raiz com dois ramos à direita e um à esquerda; "Orçamento" em três lugares.
const nodes: NodeRecord = {
  root: n('root', null, 0, 'Plano'),
  d1: n('d1', 'root', 1, 'Orçamento anual', { side: 'right' }),
  d2: n('d2', 'root', 2, 'Equipe', { side: 'right', collapsed: true }),
  d2a: n('d2a', 'd2', 1, 'Contratações'),
  d2b: n('d2b', 'd2', 2, 'Treinamento', { note: 'Rever o ORCAMENTO de cursos' }),
  e1: n('e1', 'root', 3, 'orcamento extra', { side: 'left' }),
};

describe('searchNodes', () => {
  it('ignora acento e caixa', () => {
    expect(normalizeText('Orçamento')).toBe('orcamento');
    expect(searchNodes(nodes, 'ORÇAMENTO')).toHaveLength(3);
  });

  it('ordem de leitura: direita de cima para baixo (com o recolhido), depois esquerda', () => {
    expect(searchNodes(nodes, 'orcamento')).toEqual(['d1', 'd2b', 'e1']);
  });

  it('procura também na nota', () => {
    expect(searchNodes(nodes, 'cursos')).toEqual(['d2b']);
  });

  it('consulta vazia não acha nada', () => {
    expect(searchNodes(nodes, '   ')).toEqual([]);
  });
});

describe('withLocalExpand', () => {
  it('abre só os ancestrais recolhidos do resultado, sem mexer na entrada', () => {
    const frozen = structuredClone(nodes);
    const view = withLocalExpand(nodes, 'd2b');
    expect(view.d2?.collapsed).toBe(false);
    expect(nodes.d2?.collapsed).toBe(true);
    expect(nodes).toEqual(frozen);
    // Só o ancestral afetado é copiado; o resto é o mesmo objeto.
    expect(view.d1).toBe(nodes.d1);
    expect(view.d2).not.toBe(nodes.d2);
  });

  it('nada a abrir: devolve o próprio registro', () => {
    expect(withLocalExpand(nodes, 'd1')).toBe(nodes);
    expect(withLocalExpand(nodes, null)).toBe(nodes);
  });

  it('ancestorsOf sobe até a raiz e não entra em ciclo', () => {
    expect(ancestorsOf(nodes, 'd2b')).toEqual(['d2', 'root']);
    const cyclic = { a: n('a', 'b', 0, ''), b: n('b', 'a', 0, '') };
    expect(ancestorsOf(cyclic, 'a')).toEqual(['b', 'a']);
  });
});

describe('searchDiagram', () => {
  const shape = (id: string, x: number, y: number, text: string) =>
    ({ id, kind: 'process', x, y, w: 100, h: 50, text, z: 0 }) as never;
  it('formas e rótulos de conector, de cima para baixo', () => {
    const shapes = { a: shape('a', 0, 200, 'Aprovar pedido'), b: shape('b', 0, 0, 'Pedido recebido'), c: shape('c', 0, 400, 'Fim') };
    const edges = { e: { id: 'e', source: 'b', target: 'c', label: 'pedido ok' } as never };
    expect(searchDiagram(shapes, edges, 'pedido')).toEqual([
      { kind: 'shape', id: 'b' },
      { kind: 'shape', id: 'a' },
      { kind: 'edge', id: 'e' },
    ]);
  });
});
