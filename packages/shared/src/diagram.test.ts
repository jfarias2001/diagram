import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  addEdge,
  addShape,
  buildClip,
  CLIP_MAX_SHAPES,
  createDiagramDoc,
  deleteElements,
  diagramClipSchema,
  edgesMap,
  moveShapes,
  pasteClip,
  readDiagram,
  repairDiagram,
  shapesMap,
  updateEdges,
  updateShapes,
} from './diagram.js';
import { createDocumentBodySchema } from './schemas.js';
import { addNode, createMindMapDoc, extractDocSearchText, updateNode } from './ydoc.js';

const LOCAL = Symbol('local');

function flow() {
  const doc = createDiagramDoc();
  addShape(doc, { id: 'a', kind: 'terminator', x: 0, y: 0, text: 'Início' });
  addShape(doc, { id: 'b', kind: 'decision', x: 0, y: 120, text: 'Aprovado?' });
  addShape(doc, { id: 'c', kind: 'process', x: 200, y: 260, text: 'Emitir nota' });
  addEdge(doc, { id: 'e1', source: 'a', target: 'b' });
  addEdge(doc, { id: 'e2', source: 'b', target: 'c', label: 'Sim' });
  return doc;
}

function sync(x: Y.Doc, y: Y.Doc) {
  Y.applyUpdate(y, Y.encodeStateAsUpdate(x, Y.encodeStateVector(y)));
  Y.applyUpdate(x, Y.encodeStateAsUpdate(y, Y.encodeStateVector(x)));
}

let counter = 0;
const newId = () => `n${++counter}`;

describe('readDiagram (SPEC-003 §2.2)', () => {
  it('lê formas e conectores com padrões', () => {
    const snap = readDiagram(flow());
    expect(Object.keys(snap.shapes)).toHaveLength(3);
    expect(snap.shapes.b).toMatchObject({ kind: 'decision', w: 150, h: 100, text: 'Aprovado?' });
    expect(snap.edges.e2).toMatchObject({ source: 'b', target: 'c', label: 'Sim', line: 'orthogonal', arrow: 'end' });
  });

  it('descarta forma inválida, ignora cor que não é hex e corta texto', () => {
    const doc = flow();
    const raw = (fields: Record<string, unknown>) => {
      const y = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(fields)) y.set(k, v);
      return y;
    };
    shapesMap(doc).set('bad-kind', raw({ kind: 'script', x: 0, y: 0, w: 50, h: 50, text: '' }));
    shapesMap(doc).set('nan', raw({ kind: 'process', x: Number.NaN, y: 0, w: 50, h: 50 }));
    shapesMap(doc).set('inf', raw({ kind: 'process', x: 0, y: Infinity, w: 50, h: 50 }));
    shapesMap(doc).set('huge', raw({ kind: 'process', x: 0, y: 0, w: 99999, h: 50 }));
    shapesMap(doc).get('a')?.set('fill', 'red;background:url(x)');
    shapesMap(doc).get('a')?.set('text', 'x'.repeat(3000));
    const snap = readDiagram(doc);
    expect(snap.shapes['bad-kind']).toBeUndefined();
    expect(snap.shapes.nan).toBeUndefined();
    expect(snap.shapes.inf).toBeUndefined();
    expect(snap.shapes.huge).toBeUndefined();
    expect(snap.shapes.a?.fill).toBeUndefined();
    expect(snap.shapes.a?.text).toHaveLength(2000);
  });

  it('não devolve conector solto', () => {
    const doc = flow();
    shapesMap(doc).delete('c'); // apagado "por fora", sem cascata
    expect(readDiagram(doc).edges.e2).toBeUndefined();
    expect(readDiagram(doc).edges.e1).toBeDefined();
  });
});

describe('integridade (CLAUDE.md §7)', () => {
  it('apagar forma apaga os conectores dela; desfazer traz tudo', () => {
    const doc = flow();
    const undo = new Y.UndoManager([shapesMap(doc), edgesMap(doc)], { trackedOrigins: new Set([LOCAL]) });
    deleteElements(doc, ['b'], [], LOCAL);
    const after = readDiagram(doc);
    expect(after.shapes.b).toBeUndefined();
    expect(Object.keys(after.edges)).toHaveLength(0);
    expect(edgesMap(doc).size).toBe(0);
    undo.undo();
    const back = readDiagram(doc);
    expect(back.shapes.b).toBeDefined();
    expect(Object.keys(back.edges).sort()).toEqual(['e1', 'e2']);
  });

  it('addEdge recusa ponta inexistente e laço na mesma forma', () => {
    const doc = flow();
    expect(addEdge(doc, { id: 'x1', source: 'a', target: 'nao-existe' })).toBe(false);
    expect(addEdge(doc, { id: 'x2', source: 'a', target: 'a' })).toBe(false);
    expect(edgesMap(doc).has('x1')).toBe(false);
    expect(edgesMap(doc).has('x2')).toBe(false);
  });

  it('reparo de conector solto concorrente é idempotente e converge', () => {
    const doc1 = flow();
    const doc2 = new Y.Doc();
    sync(doc1, doc2);
    // Concorrente: um apaga "c", o outro liga um conector novo em "c".
    deleteElements(doc1, ['c'], []);
    addEdge(doc2, { id: 'e3', source: 'a', target: 'c' });
    sync(doc1, doc2);
    expect(edgesMap(doc1).has('e3')).toBe(true); // solto no Y.Doc
    expect(readDiagram(doc1).edges.e3).toBeUndefined(); // mas nunca desenhado
    expect(repairDiagram(doc1)).toBe(1);
    expect(repairDiagram(doc2)).toBe(1);
    sync(doc1, doc2);
    expect(repairDiagram(doc1)).toBe(0);
    expect([...edgesMap(doc1).keys()].sort()).toEqual([...edgesMap(doc2).keys()].sort());
  });
});

describe('operações', () => {
  it('move várias formas numa transação e limita coordenadas', () => {
    const doc = flow();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    moveShapes(doc, [
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 5e9, y: 0, w: 1 },
    ]);
    expect(transactions).toBe(1);
    const snap = readDiagram(doc);
    expect(snap.shapes.a).toMatchObject({ x: 10, y: 20 });
    expect(snap.shapes.b).toMatchObject({ x: 1_000_000, w: 24 });
  });

  it('estilos de forma e conector validam cores', () => {
    const doc = flow();
    updateShapes(doc, ['a', 'b'], { fill: '#d3f9d8', bold: true });
    updateShapes(doc, ['a'], { stroke: 'javascript:alert(1)' });
    updateEdges(doc, ['e1'], { line: 'curved', dashed: true, arrow: 'both', color: '#1c7ed6', label: 'ok' });
    const snap = readDiagram(doc);
    expect(snap.shapes.a).toMatchObject({ fill: '#d3f9d8', bold: true });
    expect(snap.shapes.a?.stroke).toBeUndefined();
    expect(snap.edges.e1).toMatchObject({ line: 'curved', dashed: true, arrow: 'both', color: '#1c7ed6', label: 'ok' });
  });

  it('nota nova vem com fundo amarelo', () => {
    const doc = createDiagramDoc();
    addShape(doc, { id: 'n', kind: 'note', x: 0, y: 0 });
    expect(readDiagram(doc).shapes.n?.fill).toBe('#fff3bf');
  });
});

describe('copiar e colar (SPEC-003 §5.7)', () => {
  it('clip leva só conectores internos; colar gera ids novos e remapeia', () => {
    const doc = flow();
    const clip = buildClip(readDiagram(doc), ['b', 'c']);
    expect(clip.shapes.map((s) => s.id).sort()).toEqual(['b', 'c']);
    expect(clip.edges.map((e) => e.id)).toEqual(['e2']);

    const parsed = diagramClipSchema.parse(JSON.parse(JSON.stringify(clip)));
    const created = pasteClip(doc, parsed, { x: 24, y: 24 }, newId);
    const snap = readDiagram(doc);
    expect(created).toHaveLength(2);
    expect(created.some((id) => ['b', 'c'].includes(id))).toBe(false);
    const pastedB = Object.values(snap.shapes).find((s) => created.includes(s.id) && s.text === 'Aprovado?')!;
    expect(pastedB).toMatchObject({ x: 24, y: 144 });
    const pastedEdge = Object.values(snap.edges).find((e) => e.source === pastedB.id)!;
    expect(created).toContain(pastedEdge.target);
    expect(pastedEdge.label).toBe('Sim');
  });

  it('recusa clip grande demais ou com campo inválido', () => {
    const shape = { id: 's', kind: 'process', x: 0, y: 0, w: 100, h: 60, text: '', z: 1 };
    const many = { paglamp: 'diagram-clip', v: 1, edges: [], shapes: Array.from({ length: CLIP_MAX_SHAPES + 1 }, (_, i) => ({ ...shape, id: `s${i}` })) };
    expect(diagramClipSchema.safeParse(many).success).toBe(false);
    const badColor = { paglamp: 'diagram-clip', v: 1, edges: [], shapes: [{ ...shape, fill: 'url(evil)' }] };
    expect(diagramClipSchema.safeParse(badColor).success).toBe(false);
    const badKind = { paglamp: 'diagram-clip', v: 1, edges: [], shapes: [{ ...shape, kind: 'iframe' }] };
    expect(diagramClipSchema.safeParse(badKind).success).toBe(false);
    expect(diagramClipSchema.safeParse({ hello: 'world' }).success).toBe(false);
  });
});

describe('busca e contrato da API', () => {
  it('extractDocSearchText serve para mapa e fluxograma', () => {
    const mind = createMindMapDoc('Planejamento');
    addNode(mind, { id: 'x', parentId: 'root', text: 'Marketing' });
    updateNode(mind, 'x', { note: 'orçamento' });
    expect(extractDocSearchText(mind)).toContain('orçamento');
    const text = extractDocSearchText(flow());
    expect(text).toContain('Emitir nota');
    expect(text).toContain('Sim');
  });

  it('createDocumentBodySchema aceita DIAGRAM e recusa tipo desconhecido', () => {
    expect(createDocumentBodySchema.parse({ title: 'Fluxo', type: 'DIAGRAM' }).type).toBe('DIAGRAM');
    expect(createDocumentBodySchema.parse({ title: 'Mapa' }).type).toBe('MINDMAP');
    expect(createDocumentBodySchema.safeParse({ title: 'X', type: 'FOO' }).success).toBe(false);
  });
});
