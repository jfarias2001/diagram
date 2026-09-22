import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { INK_ON_DARK, INK_ON_LIGHT, readableInk, relativeLuminance } from './document.js';
import { childrenIndex, computeTreeRepairs, extractSearchText } from './tree.js';
import {
  addNode,
  clearOffsets,
  createMindMapDoc,
  decodeDoc,
  deleteBranch,
  encodeDoc,
  moveNode,
  moveSibling,
  nodesMap,
  readNodes,
  repairTree,
  setNodeOffset,
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

  it('inclui as notas, depois dos textos dos nós', () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { note: 'palavraúnica da nota' });
    const text = extractSearchText(readNodes(doc));
    expect(text).toContain('palavraúnica');
    expect(text.indexOf('palavraúnica')).toBeGreaterThan(text.indexOf('A1'));
  });
});

describe('nota e link no nó (SPEC-002 §2.2)', () => {
  it('grava e apaga nota e link', () => {
    const doc = sampleDoc();
    expect(updateNode(doc, 'a', { note: 'detalhes', link: 'https://paglamp.com.br' })).toBe(true);
    expect(readNodes(doc).a).toMatchObject({ note: 'detalhes', link: 'https://paglamp.com.br' });
    updateNode(doc, 'a', { note: '', link: '' });
    expect(readNodes(doc).a?.note).toBeUndefined();
    expect(readNodes(doc).a?.link).toBeUndefined();
  });

  it('link inválido não grava nada e retorna false', () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { link: 'https://ok.com' });
    expect(updateNode(doc, 'a', { link: 'javascript:alert(1)', note: 'x' })).toBe(false);
    expect(readNodes(doc).a).toMatchObject({ link: 'https://ok.com' });
    expect(readNodes(doc).a?.note).toBeUndefined();
  });

  it('descarta na leitura link inseguro gravado direto no Y.Doc', () => {
    const doc = sampleDoc();
    doc.getMap<Y.Map<unknown>>('nodes').get('a')?.set('link', 'javascript:alert(1)');
    doc.getMap<Y.Map<unknown>>('nodes').get('b')?.set('link', 'data:text/html,x');
    expect(readNodes(doc).a?.link).toBeUndefined();
    expect(readNodes(doc).b?.link).toBeUndefined();
  });

  it('corta nota grande e ignora nota que não é texto', () => {
    const doc = sampleDoc();
    const nodes = doc.getMap<Y.Map<unknown>>('nodes');
    nodes.get('a')?.set('note', 'x'.repeat(6000));
    nodes.get('b')?.set('note', { html: '<b>x</b>' });
    expect(readNodes(doc).a?.note).toHaveLength(5000);
    expect(readNodes(doc).b?.note).toBeUndefined();
  });

  it('desfazer volta a nota anterior', () => {
    const doc = sampleDoc();
    const undo = new Y.UndoManager(doc.getMap('nodes'), { trackedOrigins: new Set([LOCAL]) });
    updateNode(doc, 'a', { note: 'primeira' }, LOCAL);
    undo.stopCapturing();
    updateNode(doc, 'a', { note: 'segunda' }, LOCAL);
    undo.undo();
    expect(readNodes(doc).a?.note).toBe('primeira');
  });
});

// ---------- SPEC-006: posição livre, formato e cor do bloco ----------

describe('posição livre (SPEC-006 §2)', () => {
  it('grava e apaga o deslocamento manual', () => {
    const doc = sampleDoc();
    expect(setNodeOffset(doc, 'a', { dx: 120, dy: -40 })).toBe(true);
    expect(readNodes(doc).a).toMatchObject({ dx: 120, dy: -40 });
    expect(setNodeOffset(doc, 'a', null)).toBe(true);
    expect(readNodes(doc).a!.dx).toBeUndefined();
  });

  it('recusa deslocamento inválido e o descarta na leitura', () => {
    const doc = sampleDoc();
    expect(setNodeOffset(doc, 'a', { dx: Number.POSITIVE_INFINITY, dy: 0 })).toBe(false);
    expect(setNodeOffset(doc, 'a', { dx: 1e9, dy: 0 })).toBe(false);
    expect(setNodeOffset(doc, 'fantasma', { dx: 1, dy: 1 })).toBe(false);
    // dx sem dy (gravado direto no Y.Doc por um cliente adulterado) não vale.
    nodesMap(doc).get('a')!.set('dx', 10);
    expect(readNodes(doc).a!.dx).toBeUndefined();
  });

  it('organizar apaga o deslocamento do ramo inteiro numa transação só', () => {
    const doc = sampleDoc();
    setNodeOffset(doc, 'a', { dx: 50, dy: 50 });
    setNodeOffset(doc, 'a1', { dx: 10, dy: 10 });
    setNodeOffset(doc, 'b', { dx: 80, dy: 0 });

    let updates = 0;
    doc.on('update', () => updates++);
    expect(clearOffsets(doc, 'a')).toBe(2);
    expect(updates).toBe(1);

    const n = readNodes(doc);
    expect(n.a!.dx).toBeUndefined();
    expect(n.a1!.dx).toBeUndefined();
    expect(n.b!.dx).toBe(80); // outro ramo não é tocado
    expect(clearOffsets(doc, 'a')).toBe(0);
  });

  it('organizar a partir da raiz limpa o mapa inteiro', () => {
    const doc = sampleDoc();
    setNodeOffset(doc, 'a', { dx: 50, dy: 50 });
    setNodeOffset(doc, 'b', { dx: 80, dy: 0 });
    expect(clearOffsets(doc, 'root')).toBe(2);
    expect(Object.values(readNodes(doc)).every((n) => n.dx === undefined)).toBe(true);
  });
});

describe('ordem entre irmãos (SPEC-006 §5.2)', () => {
  it('sobe e desce um irmão', () => {
    const doc = sampleDoc();
    addNode(doc, { id: 'c', parentId: 'root' });
    const order = () => childrenIndex(readNodes(doc)).get('root')!.map((n) => n.id);
    expect(order()).toEqual(['a', 'b', 'c']);

    expect(moveSibling(doc, 'c', 'up')).toBe(true);
    expect(order()).toEqual(['a', 'c', 'b']);
    expect(moveSibling(doc, 'c', 'up')).toBe(true);
    expect(order()).toEqual(['c', 'a', 'b']);
    expect(moveSibling(doc, 'c', 'down')).toBe(true);
    expect(order()).toEqual(['a', 'c', 'b']);
  });

  it('recusa nas pontas, na raiz e em nó inexistente', () => {
    const doc = sampleDoc();
    expect(moveSibling(doc, 'a', 'up')).toBe(false);
    expect(moveSibling(doc, 'b', 'down')).toBe(false);
    expect(moveSibling(doc, 'root', 'up')).toBe(false);
    expect(moveSibling(doc, 'fantasma', 'up')).toBe(false);
  });
});

describe('formato e cor do bloco (SPEC-006 §6)', () => {
  it('aceita formato e preenchimento válidos e volta ao padrão com ""', () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { shape: 'hexagon', fill: '#d0ebff' });
    expect(readNodes(doc).a).toMatchObject({ shape: 'hexagon', fill: '#d0ebff' });
    updateNode(doc, 'a', { shape: '', fill: '' });
    expect(readNodes(doc).a!.shape).toBeUndefined();
    expect(readNodes(doc).a!.fill).toBeUndefined();
  });

  it('descarta formato e cor forjados direto no Y.Doc', () => {
    const doc = sampleDoc();
    const y = nodesMap(doc).get('a')!;
    y.set('shape', '<img src=x onerror=alert(1)>');
    y.set('fill', 'url(javascript:alert(1))');
    expect(readNodes(doc).a!.shape).toBeUndefined();
    expect(readNodes(doc).a!.fill).toBeUndefined();

    y.set('fill', '#fff'); // hex curto também não vale
    expect(readNodes(doc).a!.fill).toBeUndefined();
  });

  it('sobrevive à ida e volta pelo encode/decode', () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { shape: 'ellipse', fill: '#1b2230' });
    setNodeOffset(doc, 'a', { dx: 33, dy: -12 });
    expect(readNodes(fork(doc)).a).toMatchObject({ shape: 'ellipse', fill: '#1b2230', dx: 33, dy: -12 });
  });
});

describe('readableInk (SPEC-006 §5.4)', () => {
  const contrast = (a: string, b: string) => {
    const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };

  it('escolhe texto escuro em fundo claro e claro em fundo escuro', () => {
    expect(readableInk('#ffffff')).toBe(INK_ON_LIGHT);
    expect(readableInk('#fff3bf')).toBe(INK_ON_LIGHT);
    expect(readableInk('#1b2230')).toBe(INK_ON_DARK);
    expect(readableInk('#495057')).toBe(INK_ON_DARK);
  });

  it('dá contraste AA (4,5:1) em toda a paleta de preenchimento', () => {
    for (const fill of ['#ffffff', '#fff3bf', '#ffe3e3', '#d3f9d8', '#d0ebff', '#f3d9fa', '#495057', '#1b2230']) {
      expect(contrast(fill, readableInk(fill))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cor inválida não quebra o cálculo', () => {
    expect(readableInk('nope')).toBe(INK_ON_LIGHT);
  });
});
