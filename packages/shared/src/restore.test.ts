import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addEdge, addShape, createDiagramDoc, readDiagram, updateShapes } from './diagram.js';
import { applySnapshotState } from './restore.js';
import {
  addNode,
  createMindMapDoc,
  deleteBranch,
  encodeDoc,
  nodesMap,
  readNodes,
  readStyle,
  setDocumentStyle,
  styleMap,
  updateNode,
} from './ydoc.js';

// SPEC-005 §2.3 — restaurar reconcilia o conteúdo vivo com o da versão.

function mapDoc() {
  const doc = createMindMapDoc('Raiz');
  addNode(doc, { id: 'a', parentId: 'root', text: 'A' });
  addNode(doc, { id: 'a1', parentId: 'a', text: 'A1' });
  addNode(doc, { id: 'b', parentId: 'root', text: 'B' });
  return doc;
}

describe('applySnapshotState no mapa mental', () => {
  it('devolve o ramo apagado e desfaz as edições posteriores', () => {
    const doc = mapDoc();
    const versao = encodeDoc(doc);

    deleteBranch(doc, 'a');
    updateNode(doc, 'b', { text: 'B editado' });
    addNode(doc, { id: 'c', parentId: 'root', text: 'C depois' });
    expect(Object.keys(readNodes(doc)).sort()).toEqual(['b', 'c', 'root']);

    applySnapshotState(doc, versao);
    const restaurado = readNodes(doc);
    expect(Object.keys(restaurado).sort()).toEqual(['a', 'a1', 'b', 'root']);
    expect(restaurado.b!.text).toBe('B');
    expect(restaurado.a1!.parentId).toBe('a');
  });

  it('dois clientes que recebem o mesmo restore convergem', () => {
    const doc = mapDoc();
    const versao = encodeDoc(doc);
    const colega = new Y.Doc();
    Y.applyUpdate(colega, encodeDoc(doc));

    deleteBranch(doc, 'a');
    Y.applyUpdate(colega, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(colega)));

    applySnapshotState(doc, versao);
    Y.applyUpdate(colega, Y.encodeStateAsUpdate(doc, Y.encodeStateVector(colega)));
    expect(readNodes(colega)).toEqual(readNodes(doc));
  });

  it('conteúdo perigoso guardado numa versão antiga não volta', () => {
    const doc = mapDoc();
    // Versão gravada por um cliente adulterado, direto no Y.Map.
    const y = nodesMap(doc).get('a')!;
    y.set('link', 'javascript:alert(1)');
    y.set('color', 'url(javascript:alert(1))');
    y.set('dx', Number.POSITIVE_INFINITY);
    const versao = encodeDoc(doc);

    const limpo = mapDoc();
    applySnapshotState(limpo, versao);
    const node = readNodes(limpo).a!;
    expect(node.link).toBeUndefined();
    expect(node.color).toBeUndefined();
    expect(node.dx).toBeUndefined();
  });

  it('versão com nó órfão volta reparada', () => {
    const doc = mapDoc();
    nodesMap(doc).get('a1')!.set('parentId', 'sumiu');
    const versao = encodeDoc(doc);

    const alvo = mapDoc();
    applySnapshotState(alvo, versao);
    expect(readNodes(alvo).a1!.parentId).toBe('root'); // reanexado pelo reparo
  });
});

describe('applySnapshotState no fluxograma', () => {
  it('devolve formas e conectores apagados, sem deixar conector solto', () => {
    const doc = createDiagramDoc();
    addShape(doc, { id: 's1', kind: 'process', x: 0, y: 0, text: 'Começo' });
    addShape(doc, { id: 's2', kind: 'decision', x: 200, y: 0, text: 'Deu certo?' });
    addEdge(doc, { id: 'e1', source: 's1', target: 's2', label: 'Sim' });
    const versao = encodeDoc(doc);

    updateShapes(doc, ['s1'], { text: 'Outro começo', fill: '#d0ebff' });
    addShape(doc, { id: 's3', kind: 'process', x: 400, y: 0, text: 'Depois' });
    applySnapshotState(doc, versao);

    const snap = readDiagram(doc);
    expect(Object.keys(snap.shapes).sort()).toEqual(['s1', 's2']);
    expect(snap.shapes.s1!.text).toBe('Começo');
    expect(snap.shapes.s1!.fill).toBeUndefined();
    expect(snap.edges.e1).toMatchObject({ source: 's1', target: 's2', label: 'Sim' });
  });
});

describe('applySnapshotState no estilo do documento (SPEC-007 §2.3)', () => {
  it('restaurar devolve o tema, a fonte e o fundo daquela versão', () => {
    const doc = mapDoc();
    setDocumentStyle(doc, { theme: 'oceano', font: 'manuscrita', background: '#101820' });
    const versao = encodeDoc(doc);

    setDocumentStyle(doc, { theme: 'neon', font: 'mono', background: '' });
    applySnapshotState(doc, versao);
    expect(readStyle(doc)).toEqual({ theme: 'oceano', font: 'manuscrita', background: '#101820' });
  });

  it('versão sem estilo volta ao tema padrão', () => {
    const doc = mapDoc();
    const versao = encodeDoc(doc); // antes de qualquer tema
    setDocumentStyle(doc, { theme: 'neon' });
    applySnapshotState(doc, versao);
    expect(readStyle(doc)).toEqual({});
  });

  it('estilo adulterado numa versão antiga não volta', () => {
    const doc = mapDoc();
    styleMap(doc).set('theme', 'url(javascript:alert(1))');
    styleMap(doc).set('background', '#fff;position:fixed');
    const versao = encodeDoc(doc);

    const alvo = mapDoc();
    applySnapshotState(alvo, versao);
    expect(readStyle(alvo)).toEqual({});
  });
});
