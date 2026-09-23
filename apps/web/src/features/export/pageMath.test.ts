import { describe, expect, it } from 'vitest';
import {
  fitScale,
  MAX_RASTER_PIXELS,
  MAX_RASTER_SIDE,
  PAGE_MARGIN_PT,
  pageSizeFor,
  PX_TO_PT,
  rasterScale,
  safeFileName,
} from './pageMath';

// SPEC-008 §7 — as contas que decidem se o PDF sai legível ou borrado.

describe('pageSizeFor', () => {
  it('A4 e A3 em retrato e paisagem', () => {
    expect(pageSizeFor('a4', 'portrait', { width: 100, height: 100 })).toMatchObject({ width: 595.28 });
    const a4 = pageSizeFor('a4', 'landscape', { width: 100, height: 100 });
    expect(a4.width).toBeGreaterThan(a4.height);
    expect(Math.round(a4.width)).toBe(842);
    const a3 = pageSizeFor('a3', 'portrait', { width: 100, height: 100 });
    expect(Math.round(a3.height)).toBe(1191);
  });

  it('"ajustado" acompanha o desenho, convertendo px de CSS em pontos', () => {
    const page = pageSizeFor('fit', 'landscape', { width: 960, height: 480 });
    expect(page.width).toBeCloseTo(960 * PX_TO_PT);
    expect(page.height).toBeCloseTo(480 * PX_TO_PT);
  });

  it('"ajustado" nunca passa do teto do formato PDF (200 polegadas)', () => {
    const page = pageSizeFor('fit', 'landscape', { width: 200_000, height: 50_000 });
    expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(14_400);
    // A proporção é mantida: o desenho não distorce.
    expect(page.width / page.height).toBeCloseTo(4, 3);
  });
});

describe('fitScale', () => {
  it('em "ajustado", o desenho cabe exatamente (escala 1)', () => {
    const bounds = { width: 800, height: 600 };
    const page = pageSizeFor('fit', 'landscape', bounds);
    expect(fitScale(bounds, page, 0)).toBeCloseTo(1);
  });

  it('desenho largo reduz pela largura; desenho alto, pela altura', () => {
    const page = pageSizeFor('a4', 'landscape', { width: 1, height: 1 });
    const wide = fitScale({ width: 4000, height: 300 }, page, PAGE_MARGIN_PT);
    const tall = fitScale({ width: 300, height: 4000 }, page, PAGE_MARGIN_PT);
    expect(wide).toBeLessThan(1);
    expect(tall).toBeLessThan(1);
    // O desenho largo aproveita mais a página paisagem que o alto.
    expect(wide).toBeGreaterThan(tall);
  });

  it('desenho pequeno é ampliado para ocupar a página', () => {
    const page = pageSizeFor('a4', 'portrait', { width: 1, height: 1 });
    expect(fitScale({ width: 200, height: 200 }, page, PAGE_MARGIN_PT)).toBeGreaterThan(1);
  });
});

describe('rasterScale', () => {
  it('mira 200 dpi na área impressa', () => {
    // Uma área de 1 polegada (72 pt) deve virar 200 px.
    const raster = rasterScale({ width: 72, height: 72 }, { width: 100, height: 100 });
    expect(raster.width).toBe(200);
    expect(raster.height).toBe(200);
    expect(raster.reduced).toBe(false);
    expect(raster.scale).toBeCloseTo(2);
  });

  it('A4 paisagem inteiro cabe nos tetos e não é reduzido', () => {
    const page = pageSizeFor('a4', 'landscape', { width: 1, height: 1 });
    const raster = rasterScale(page, { width: 1200, height: 800 });
    expect(raster.reduced).toBe(false);
    expect(raster.width).toBeLessThanOrEqual(MAX_RASTER_SIDE);
    expect(raster.width * raster.height).toBeLessThanOrEqual(MAX_RASTER_PIXELS);
  });

  it('página enorme reduz a resolução em vez de estourar o navegador', () => {
    const raster = rasterScale({ width: 14_400, height: 14_400 }, { width: 20_000, height: 20_000 });
    expect(raster.reduced).toBe(true);
    expect(Math.max(raster.width, raster.height)).toBeLessThanOrEqual(MAX_RASTER_SIDE);
    expect(raster.width * raster.height).toBeLessThanOrEqual(MAX_RASTER_PIXELS);
  });

  it('nunca devolve tamanho zero', () => {
    const raster = rasterScale({ width: 0.01, height: 0.01 }, { width: 0, height: 0 });
    expect(raster.width).toBeGreaterThanOrEqual(1);
    expect(raster.height).toBeGreaterThanOrEqual(1);
  });
});

describe('safeFileName', () => {
  it('mantém letras, números e acentos, e troca o resto', () => {
    expect(safeFileName('Plano 2026 — Comercial/Vendas', 'pdf')).toBe('Plano 2026 ComercialVendas.pdf');
    expect(safeFileName('Ação', 'png')).toBe('Ação.png');
  });

  it('título vazio ou só símbolos vira "documento"', () => {
    expect(safeFileName('', 'pdf')).toBe('documento.pdf');
    expect(safeFileName('///', 'pdf')).toBe('documento.pdf');
  });

  it('não deixa caminho passar', () => {
    expect(safeFileName('../../etc/passwd', 'pdf')).toBe('etcpasswd.pdf');
  });
});
