import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { contrastRatio, HEX_COLOR, readableInk } from './document.js';
import {
  DEFAULT_THEME_ID,
  DOC_FONTS,
  DOC_THEMES,
  FONT_IDS,
  resolveFont,
  resolveTheme,
  THEME_IDS,
} from './theme.js';
import {
  addNode,
  clearNodeColors,
  createMindMapDoc,
  readNodes,
  readStyle,
  setDocumentStyle,
  styleMap,
  updateNode,
} from './ydoc.js';

const LOCAL = Symbol('local');

describe('temas prontos (SPEC-007 §2.1)', () => {
  it('todo tema tem as cores em #rrggbb e oito cores de ramo', () => {
    for (const id of THEME_IDS) {
      const theme = DOC_THEMES[id];
      expect(theme.id).toBe(id);
      for (const color of [theme.canvas, theme.surface, theme.ink, theme.line, theme.grid, theme.rootColor]) {
        expect(color).toMatch(HEX_COLOR);
      }
      expect(theme.branches).toHaveLength(8);
      for (const color of theme.branches) expect(color).toMatch(HEX_COLOR);
      expect(DOC_FONTS[theme.font]).toBeTruthy();
    }
  });

  // Requisito não funcional do PRD-007: nenhum tema pode nascer ilegível.
  it('o texto do tema tem contraste AA sobre o bloco e sobre o quadro', () => {
    for (const id of THEME_IDS) {
      const theme = DOC_THEMES[id];
      expect(contrastRatio(theme.ink, theme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.ink, theme.canvas)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('toda cor de ramo aceita um texto legível por cima', () => {
    for (const id of THEME_IDS) {
      for (const color of DOC_THEMES[id].branches) {
        expect(contrastRatio(readableInk(color), color)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // A linha de ligação é elemento gráfico: WCAG 1.4.11 pede 3:1 sobre o fundo.
  it('toda cor de ramo se destaca do fundo do quadro', () => {
    for (const id of THEME_IDS) {
      const theme = DOC_THEMES[id];
      for (const color of theme.branches) {
        expect(contrastRatio(color, theme.canvas)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('cada fonte tem pilha e fator de largura plausível', () => {
    for (const id of FONT_IDS) {
      const font = DOC_FONTS[id];
      expect(font.stack).toContain(',');
      expect(font.widthFactor).toBeGreaterThan(0.5);
      expect(font.widthFactor).toBeLessThan(1.5);
    }
  });
});

describe('resolveTheme', () => {
  it('sem estilo, cai no tema padrão', () => {
    expect(resolveTheme(undefined).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme({}).id).toBe(DEFAULT_THEME_ID);
  });

  it('fonte escolhida vence a do tema', () => {
    expect(resolveTheme({ theme: 'oceano' }).font).toBe(DOC_THEMES.oceano.font);
    expect(resolveFont({ theme: 'oceano', font: 'manuscrita' }).id).toBe('manuscrita');
  });

  it('fundo escolhido vence o do tema e redefine claro/escuro', () => {
    const claro = resolveTheme({ theme: 'paglamp' });
    expect(claro.mode).toBe('light');
    const escuro = resolveTheme({ theme: 'paglamp', background: '#101216' });
    expect(escuro.canvas).toBe('#101216');
    expect(escuro.mode).toBe('dark');
    // O texto do tema claro ficaria invisível: troca para um legível.
    expect(contrastRatio(escuro.ink, escuro.canvas)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('estilo no documento (SPEC-007 §2.1)', () => {
  it('grava e lê tema, fonte e fundo', () => {
    const doc = createMindMapDoc('Raiz');
    expect(readStyle(doc)).toEqual({});
    expect(setDocumentStyle(doc, { theme: 'neon', font: 'mono', background: '#101010' }, LOCAL)).toBe(true);
    expect(readStyle(doc)).toEqual({ theme: 'neon', font: 'mono', background: '#101010' });
  });

  it("'' volta ao padrão", () => {
    const doc = createMindMapDoc('Raiz');
    setDocumentStyle(doc, { theme: 'neon', font: 'mono' }, LOCAL);
    setDocumentStyle(doc, { font: '' }, LOCAL);
    expect(readStyle(doc)).toEqual({ theme: 'neon' });
    expect(resolveFont(readStyle(doc)).id).toBe(DOC_THEMES.neon.font);
  });

  it('valor inválido não grava nada', () => {
    const doc = createMindMapDoc('Raiz');
    expect(setDocumentStyle(doc, { theme: 'tema-do-mal' }, LOCAL)).toBe(false);
    expect(setDocumentStyle(doc, { background: 'red' }, LOCAL)).toBe(false);
    expect(setDocumentStyle(doc, { background: 'javascript:alert(1)' }, LOCAL)).toBe(false);
    expect(readStyle(doc)).toEqual({});
  });

  // CLAUDE.md §9: cliente adulterado escrevendo direto no Y.Map.
  it('lixo escrito direto no Y.Doc é ignorado na leitura', () => {
    const doc = createMindMapDoc('Raiz');
    const map = styleMap(doc);
    map.set('theme', 'url(javascript:alert(1))');
    map.set('font', 42);
    map.set('background', '#fff; background: url(http://mal.com)');
    expect(readStyle(doc)).toEqual({});
    expect(resolveTheme(readStyle(doc)).id).toBe(DEFAULT_THEME_ID);
  });

  it('trocar de tema é uma escrita só, mesmo num mapa grande', () => {
    const doc = createMindMapDoc('Raiz');
    for (let i = 0; i < 500; i++) addNode(doc, { id: `n${i}`, parentId: 'root', text: `Bloco ${i}` });
    let updates = 0;
    doc.on('afterTransaction', () => updates++);
    setDocumentStyle(doc, { theme: 'aurora' }, LOCAL);
    expect(updates).toBe(1);
  });
});

describe('clearNodeColors', () => {
  it('apaga contorno, preenchimento e texto do ramo, sem tocar no resto', () => {
    const doc = createMindMapDoc('Raiz');
    addNode(doc, { id: 'a', parentId: 'root', text: 'A' });
    addNode(doc, { id: 'a1', parentId: 'a', text: 'A1' });
    addNode(doc, { id: 'b', parentId: 'root', text: 'B' });
    updateNode(doc, 'a', { color: '#ff0000', fill: '#00ff00', ink: '#0000ff' }, LOCAL);
    updateNode(doc, 'a1', { fill: '#123456' }, LOCAL);
    updateNode(doc, 'b', { color: '#abcdef' }, LOCAL);

    expect(clearNodeColors(doc, 'a', LOCAL)).toBe(2);
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc));
    const nodes = readNodes(doc2);
    expect(nodes.a).toMatchObject({ text: 'A' });
    expect(nodes.a!.color).toBeUndefined();
    expect(nodes.a!.fill).toBeUndefined();
    expect(nodes.a!.ink).toBeUndefined();
    expect(nodes.a1!.fill).toBeUndefined();
    expect(nodes.b!.color).toBe('#abcdef'); // fora do ramo
  });
});
