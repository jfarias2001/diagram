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
  reparentNode,
  repairTree,
  setNodeOffset,
  setNodeOffsets,
  setNodeSide,
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
  // Fora da raiz, todos os irmãos contam. Na raiz, só os do mesmo lado — a
  // diferença está no bloco da SPEC-008 §2.3, mais abaixo.
  it('sobe e desce um irmão', () => {
    const doc = sampleDoc();
    addNode(doc, { id: 'a2', parentId: 'a' });
    addNode(doc, { id: 'a3', parentId: 'a' });
    const order = () => childrenIndex(readNodes(doc)).get('a')!.map((n) => n.id);
    expect(order()).toEqual(['a1', 'a2', 'a3']);

    expect(moveSibling(doc, 'a3', 'up')).toBe(true);
    expect(order()).toEqual(['a1', 'a3', 'a2']);
    expect(moveSibling(doc, 'a3', 'up')).toBe(true);
    expect(order()).toEqual(['a3', 'a1', 'a2']);
    expect(moveSibling(doc, 'a3', 'down')).toBe(true);
    expect(order()).toEqual(['a1', 'a3', 'a2']);
  });

  it('recusa nas pontas, na raiz e em nó inexistente', () => {
    const doc = sampleDoc();
    addNode(doc, { id: 'a2', parentId: 'a' });
    expect(moveSibling(doc, 'a1', 'up')).toBe(false);
    expect(moveSibling(doc, 'a2', 'down')).toBe(false);
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

describe('setNodeOffsets em lote (SPEC-007 §5.1)', () => {
  it('grava vários deslocamentos numa transação só', () => {
    const doc = sampleDoc();
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    const gravados = setNodeOffsets(
      doc,
      [
        { id: 'a', offset: { dx: 100, dy: 40 } },
        { id: 'a1', offset: { dx: -20, dy: 10 } },
      ],
      LOCAL,
    );
    expect(gravados).toBe(2);
    expect(transactions).toBe(1);
    const nodes = readNodes(doc);
    expect(nodes.a).toMatchObject({ dx: 100, dy: 40 });
    expect(nodes.a1).toMatchObject({ dx: -20, dy: 10 });
  });

  it('entrada inválida é ignorada sem derrubar as boas', () => {
    const doc = sampleDoc();
    const gravados = setNodeOffsets(
      doc,
      [
        { id: 'a', offset: { dx: 10, dy: 10 } },
        { id: 'fantasma', offset: { dx: 5, dy: 5 } },
        { id: 'b', offset: { dx: Number.NaN, dy: 0 } },
        { id: 'a1', offset: { dx: 1e9, dy: 0 } },
      ],
      LOCAL,
    );
    expect(gravados).toBe(1);
    const nodes = readNodes(doc);
    expect(nodes.a).toMatchObject({ dx: 10, dy: 10 });
    expect(nodes.b!.dx).toBeUndefined();
    expect(nodes.a1!.dx).toBeUndefined();
    expect(nodes.fantasma).toBeUndefined();
  });

  it('offset null apaga o deslocamento', () => {
    const doc = sampleDoc();
    setNodeOffsets(doc, [{ id: 'a', offset: { dx: 10, dy: 10 } }], LOCAL);
    setNodeOffsets(doc, [{ id: 'a', offset: null }], LOCAL);
    expect(readNodes(doc).a!.dx).toBeUndefined();
  });
});

describe('reparentNode (SPEC-007 §5.2)', () => {
  it('troca o pai, zera a posição manual e faz tudo numa transação', () => {
    const doc = sampleDoc();
    setNodeOffsets(doc, [{ id: 'a1', offset: { dx: 300, dy: 200 } }], LOCAL);
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);

    expect(reparentNode(doc, 'a1', 'b', LOCAL)).toBe(true);
    expect(transactions).toBe(1);
    const nodes = readNodes(doc);
    expect(nodes.a1!.parentId).toBe('b');
    expect(nodes.a1!.dx).toBeUndefined();
    expect(nodes.a1!.dy).toBeUndefined();
  });

  it('leva o ramo inteiro junto, com texto e cores', () => {
    const doc = sampleDoc();
    addNode(doc, { id: 'a1x', parentId: 'a1', text: 'Neto' });
    updateNode(doc, 'a1', { fill: '#d0ebff', note: 'anotação' }, LOCAL);
    reparentNode(doc, 'a1', 'b', LOCAL);
    const nodes = readNodes(doc);
    expect(nodes.a1).toMatchObject({ parentId: 'b', fill: '#d0ebff', note: 'anotação' });
    expect(nodes.a1x!.parentId).toBe('a1'); // o ramo continua pendurado nele
  });

  it('recusa a raiz, alvo inexistente e ciclo', () => {
    const doc = sampleDoc();
    expect(reparentNode(doc, 'root', 'a', LOCAL)).toBe(false);
    expect(reparentNode(doc, 'a', 'fantasma', LOCAL)).toBe(false);
    expect(reparentNode(doc, 'a', 'a1', LOCAL)).toBe(false); // descendente
    expect(reparentNode(doc, 'a', 'a', LOCAL)).toBe(false); // ele mesmo
    expect(readNodes(doc).a!.parentId).toBe('root');
  });

  it('um Ctrl+Z devolve o nó ao pai anterior', () => {
    const doc = sampleDoc();
    const undo = new Y.UndoManager(nodesMap(doc), { trackedOrigins: new Set([LOCAL]) });
    reparentNode(doc, 'a1', 'b', LOCAL);
    expect(readNodes(doc).a1!.parentId).toBe('b');
    undo.undo();
    expect(readNodes(doc).a1!.parentId).toBe('a');
  });
});

describe('cor do texto do bloco (SPEC-007 §2.2)', () => {
  it('só aceita #rrggbb, na escrita e na leitura', () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { ink: '#112233' }, LOCAL);
    expect(readNodes(doc).a!.ink).toBe('#112233');

    updateNode(doc, 'a', { ink: 'red' }, LOCAL);
    expect(readNodes(doc).a!.ink).toBeUndefined(); // valor inválido volta ao padrão

    nodesMap(doc).get('a')!.set('ink', 'url(javascript:alert(1))');
    expect(readNodes(doc).a!.ink).toBeUndefined();
  });

  it("ink: '' volta à cor sugerida", () => {
    const doc = sampleDoc();
    updateNode(doc, 'a', { ink: '#112233' }, LOCAL);
    updateNode(doc, 'a', { ink: '' }, LOCAL);
    expect(readNodes(doc).a!.ink).toBeUndefined();
  });
});

// ---------- SPEC-008 §2.3: lado do ramo gravado no documento ----------

describe('lado do ramo (SPEC-008 §2.3)', () => {
  it('ramo de 1º nível nasce com lado; filho de outro nó não recebe lado', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root', text: 'A' });
    addNode(doc, { id: 'a1', parentId: 'a', text: 'A1' });
    const nodes = readNodes(doc);
    expect(nodes.a?.side).toBe('right');
    expect(nodes.a1?.side).toBeUndefined();
  });

  it('irmão criado depois de um ramo nasce do MESMO lado (o bug do PRD-008 §1)', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root', text: 'A' });
    addNode(doc, { id: 'b', parentId: 'root', afterId: 'a', text: 'B' });
    addNode(doc, { id: 'c', parentId: 'root', afterId: 'b', text: 'C' });
    const nodes = readNodes(doc);
    expect([nodes.a?.side, nodes.b?.side, nodes.c?.side]).toEqual(['right', 'right', 'right']);
  });

  it('sem irmão de referência, equilibra os lados', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root' });
    addNode(doc, { id: 'b', parentId: 'root' });
    addNode(doc, { id: 'c', parentId: 'root' });
    const nodes = readNodes(doc);
    expect([nodes.a?.side, nodes.b?.side, nodes.c?.side]).toEqual(['right', 'left', 'right']);
  });

  it('congela o lado dos ramos antigos numa transação só (um Ctrl+Z desfaz)', () => {
    // Documento "antigo": três ramos escritos sem lado nenhum.
    const doc = createMindMapDoc('Raiz');
    const map = nodesMap(doc);
    for (const [id, order] of [['a', 1], ['b', 2], ['c', 3]] as const) {
      const y = new Y.Map<unknown>();
      y.set('parentId', 'root');
      y.set('order', order);
      y.set('text', id);
      map.set(id, y);
    }
    expect(Object.values(readNodes(doc)).every((n) => n.side === undefined)).toBe(true);

    let transactions = 0;
    doc.on('afterTransaction', () => {
      transactions += 1;
    });
    addNode(doc, { id: 'd', parentId: 'root', afterId: 'c' });
    expect(transactions).toBe(1);

    const nodes = readNodes(doc);
    // a e b estavam à direita e c à esquerda pela regra antiga — e ficam onde estavam.
    expect([nodes.a?.side, nodes.b?.side, nodes.c?.side]).toEqual(['right', 'right', 'left']);
    expect(nodes.d?.side).toBe('left'); // herdou de c
  });

  it('lado forjado no Y.Map não é lido', () => {
    const doc = sampleDoc();
    nodesMap(doc).get('a')?.set('side', 'atras-do-pai');
    expect(readNodes(doc).a?.side).toBeUndefined();
  });

  it('virar filho da raiz dá lado; sair da raiz tira o lado', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root' });
    addNode(doc, { id: 'a1', parentId: 'a' });
    expect(readNodes(doc).a1?.side).toBeUndefined();
    moveNode(doc, 'a1', 'root', undefined);
    expect(readNodes(doc).a1?.side).toBe('left');
    moveNode(doc, 'a1', 'a', undefined);
    expect(readNodes(doc).a1?.side).toBeUndefined();
  });

  it('reparentNode para a raiz aceita o lado pedido (arrastar para o outro lado)', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root' });
    addNode(doc, { id: 'a1', parentId: 'a' });
    reparentNode(doc, 'a1', 'root', LOCAL, 'left');
    expect(readNodes(doc).a1?.side).toBe('left');
  });

  it('setNodeSide troca o lado só de filho direto da raiz', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root' });
    addNode(doc, { id: 'a1', parentId: 'a' });
    expect(setNodeSide(doc, 'a', 'left', LOCAL)).toBe(true);
    expect(readNodes(doc).a?.side).toBe('left');
    expect(setNodeSide(doc, 'a1', 'left', LOCAL)).toBe(false);
    expect(setNodeSide(doc, 'root', 'left', LOCAL)).toBe(false);
    expect(setNodeSide(doc, 'a', 'left', LOCAL)).toBe(false); // já está nesse lado
  });

  it('mover para cima/baixo na raiz só considera os irmãos do mesmo lado', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'r1', parentId: 'root', side: 'right' });
    addNode(doc, { id: 'l1', parentId: 'root', side: 'left' });
    addNode(doc, { id: 'r2', parentId: 'root', afterId: 'r1', side: 'right' });
    // r2 está à direita, abaixo de r1: subir troca com r1, não com o bloco da esquerda.
    expect(moveSibling(doc, 'r2', 'up', LOCAL)).toBe(true);
    const nodes = readNodes(doc);
    expect((nodes.r2?.order ?? 0) < (nodes.r1?.order ?? 0)).toBe(true);
    expect(nodes.l1?.side).toBe('left');
    // O primeiro da direita não tem para onde subir.
    expect(moveSibling(doc, 'r2', 'up', LOCAL)).toBe(false);
  });

  it('o lado viaja entre dois clientes pelo Yjs', () => {
    const a = createMindMapDoc('Raiz');
    addNode(a, { id: 'x', parentId: 'root', side: 'left' });
    const b = fork(a);
    expect(readNodes(b).x?.side).toBe('left');
  });
});
