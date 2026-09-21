import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { computeTreeRepairs, extractSearchText } from './tree.js';
import {
  addNode,
  createMindMapDoc,
  decodeDoc,
  deleteBranch,
  encodeDoc,
  moveNode,
  readNodes,
  repairTree,
  updateNode,
} from './ydoc.js';

const LOCAL = Symbol('local');

function sampleDoc() {
  const doc = createMindMapDoc('Raiz');
  addNode(doc, { id: 'a', parentId: 'root', text: 'A' });
  addNode(doc, { id: 'b', parentId: 'root', text: 'B' });
  addNode(doc, { id: 'a1', parentId: 'a', text: 'A1' });
  return doc;
}

/** Sincroniza dois docs nos dois sentidos, como o servidor faria. */
function sync(x: Y.Doc, y: Y.Doc) {
  Y.applyUpdate(y, Y.encodeStateAsUpdate(x, Y.encodeStateVector(y)));
  Y.applyUpdate(x, Y.encodeStateAsUpdate(y, Y.encodeStateVector(x)));
}

function fork(doc: Y.Doc) {
  return decodeDoc(encodeDoc(doc));
}

describe('operações do mapa', () => {
  it('cria o doc inicial com a raiz', () => {
    const nodes = readNodes(createMindMapDoc('Plano'));
    expect(nodes.root).toMatchObject({ parentId: null, text: 'Plano' });
  });

  it('insere irmão logo depois do nó indicado', () => {
    const doc = sampleDoc();
    addNode(doc, { id: 'mid', parentId: 'root', afterId: 'a' });
    const n = readNodes(doc);
    expect(n.a!.order).toBeLessThan(n.mid!.order);
    expect(n.mid!.order).toBeLessThan(n.b!.order);
  });

  it('apaga o ramo inteiro e nunca a raiz', () => {
    const doc = sampleDoc();
    expect(deleteBranch(doc, 'root')).toBe(false);
    expect(deleteBranch(doc, 'a')).toBe(true);
    expect(Object.keys(readNodes(doc)).sort()).toEqual(['b', 'root']);
  });

  it('bloqueia mover para dentro do próprio ramo', () => {
    const doc = sampleDoc();
    expect(moveNode(doc, 'a', 'a1', undefined)).toBe(false);
    expect(moveNode(doc, 'root', 'a', undefined)).toBe(false);
    expect(moveNode(doc, 'a1', 'b', undefined)).toBe(true);
    expect(readNodes(doc).a1!.parentId).toBe('b');
  });

  it('move como primeiro irmão com afterId = null', () => {
    const doc = sampleDoc();
    expect(moveNode(doc, 'b', 'root', null)).toBe(true);
    const n = readNodes(doc);
    expect(n.b!.order).toBeLessThan(n.a!.order);
  });

  it('limita o texto e ignora cor inválida', () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { text: 'x'.repeat(5000), color: 'red;background:url(x)' });
    const a = readNodes(doc).a!;
    expect(a.text.length).toBe(2000);
    expect(a.color).toBeUndefined();
  });

  it('desfazer só desfaz alterações locais', () => {
    const doc = sampleDoc();
    const undo = new Y.UndoManager(doc.getMap('nodes'), { trackedOrigins: new Set([LOCAL]) });
    updateNode(doc, 'a', { text: 'meu' }, LOCAL);
    updateNode(doc, 'b', { text: 'do colega' }, 'remoto');
    undo.undo();
    const n = readNodes(doc);
    expect(n.a!.text).toBe('A');
    expect(n.b!.text).toBe('do colega');
  });
});

describe('edição concorrente + reparo de árvore', () => {
  it('filho criado sob nó apagado por outro vira órfão e é reanexado à raiz', () => {
    const base = sampleDoc();
    const alice = fork(base);
    const bob = fork(base);
    deleteBranch(alice, 'a');
    addNode(bob, { id: 'novo', parentId: 'a1', text: 'Novo' });
    sync(alice, bob);

    expect(computeTreeRepairs(readNodes(alice)).map((r) => r.id)).toEqual(['novo']);
    repairTree(alice);
    repairTree(bob);
    sync(alice, bob);
    expect(readNodes(alice).novo!.parentId).toBe('root');
    expect(readNodes(alice)).toEqual(readNodes(bob));
  });

  it('movimentos cruzados que formam ciclo são reparados igual nos dois lados', () => {
    const base = sampleDoc();
    const alice = fork(base);
    const bob = fork(base);
    moveNode(alice, 'a', 'b', undefined); // a sob b
    moveNode(bob, 'b', 'a', undefined); // b sob a
    sync(alice, bob);

    expect(computeTreeRepairs(readNodes(alice))).toEqual(computeTreeRepairs(readNodes(bob)));
    repairTree(alice);
    repairTree(bob);
    sync(alice, bob);
    const n = readNodes(alice);
    expect(computeTreeRepairs(n)).toEqual([]);
    expect(n.a!.parentId === 'root' || n.b!.parentId === 'root').toBe(true);
    expect(n).toEqual(readNodes(bob));
  });
});

describe('extractSearchText', () => {
  it('junta os textos e respeita o limite', () => {
    const text = extractSearchText(readNodes(sampleDoc()));
    expect(text).toContain('Raiz');
    expect(text).toContain('A1');
    expect(extractSearchText(readNodes(sampleDoc()), 3).length).toBeLessThanOrEqual(3);
  });
});
