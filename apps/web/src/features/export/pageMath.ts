// Contas da exportação (SPEC-008 §5.6). Tudo aqui é função pura, para o
// tamanho da página e a resolução do raster terem teste — é o que separa um PDF
// legível de uma imagem borrada.

export type ExportFormat = 'png' | 'pdf';
export type PageSize = 'fit' | 'a4' | 'a3';
export type Orientation = 'landscape' | 'portrait';

export interface Size {
  width: number;
  height: number;
}

/** 1 px de CSS = 1/96". O PDF trabalha em pontos (1/72"). */
export const PX_TO_PT = 72 / 96;

/** Tamanhos em pontos, no formato retrato. */
const PAGES: Record<Exclude<PageSize, 'fit'>, Size> = {
  a4: { width: 595.28, height: 841.89 },
  a3: { width: 841.89, height: 1190.55 },
};

/** Margem da página (pt). Em "ajustado ao mapa" o desenho já vem com folga. */
export const PAGE_MARGIN_PT = 28;

/** Limite do formato PDF: 200 polegadas por lado. */
const MAX_PAGE_PT = 14_400;

/** Tetos do `<canvas>` do navegador (SPEC-008 §6). */
export const MAX_RASTER_SIDE = 12_000;
export const MAX_RASTER_PIXELS = 40_000_000;

/** Alvo de nitidez do raster embutido no PDF. */
export const TARGET_DPI = 200;

/**
 * Tamanho da página em pontos. `fit` acompanha o desenho (limitado ao teto do
 * formato); A4/A3 viram paisagem quando pedido.
 */
export function pageSizeFor(page: PageSize, orientation: Orientation, boundsPx: Size): Size {
  if (page === 'fit') {
    const width = Math.max(1, boundsPx.width) * PX_TO_PT;
    const height = Math.max(1, boundsPx.height) * PX_TO_PT;
    const shrink = Math.min(1, MAX_PAGE_PT / Math.max(width, height));
    return { width: width * shrink, height: height * shrink };
  }
  const base = PAGES[page];
  return orientation === 'landscape' ? { width: base.height, height: base.width } : { ...base };
}

/** Quanto reduzir o desenho para caber na área útil da página. */
export function fitScale(boundsPx: Size, page: Size, marginPt: number): number {
  const width = Math.max(1, page.width - marginPt * 2);
  const height = Math.max(1, page.height - marginPt * 2);
  const drawn = { width: Math.max(1, boundsPx.width) * PX_TO_PT, height: Math.max(1, boundsPx.height) * PX_TO_PT };
  return Math.min(width / drawn.width, height / drawn.height);
}

export interface Raster {
  /** Escala aplicada ao quadro para gerar a imagem. */
  scale: number;
  width: number;
  height: number;
  /** true quando a resolução teve de cair por causa dos tetos. */
  reduced: boolean;
}

/**
 * Resolução do raster para uma área de `areaPt` no papel: mira `dpi`, mas
 * respeita os tetos do navegador. Se não couber, reduz em vez de falhar.
 */
export function rasterScale(
  areaPt: Size,
  boundsPx: Size,
  dpi = TARGET_DPI,
  maxSide = MAX_RASTER_SIDE,
  maxPixels = MAX_RASTER_PIXELS,
): Raster {
  const wanted = {
    width: Math.max(1, Math.round((areaPt.width / 72) * dpi)),
    height: Math.max(1, Math.round((areaPt.height / 72) * dpi)),
  };
  const limit = Math.min(
    1,
    maxSide / Math.max(wanted.width, wanted.height),
    Math.sqrt(maxPixels / (wanted.width * wanted.height)),
  );
  const width = Math.max(1, Math.floor(wanted.width * limit));
  const height = Math.max(1, Math.floor(wanted.height * limit));
  return {
    scale: width / Math.max(1, boundsPx.width),
    width,
    height,
    reduced: limit < 1,
  };
}

/** Nome de arquivo seguro a partir do título (sem caminho nem caractere estranho). */
export function safeFileName(title: string, extension: 'png' | 'pdf'): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${cleaned || 'documento'}.${extension}`;
}
