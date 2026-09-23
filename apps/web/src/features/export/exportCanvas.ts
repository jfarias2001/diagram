import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { toPng } from 'html-to-image';
import {
  type ExportFormat,
  fitScale,
  MAX_RASTER_PIXELS,
  MAX_RASTER_SIDE,
  type Orientation,
  PAGE_MARGIN_PT,
  type PageSize,
  pageSizeFor,
  PX_TO_PT,
  rasterScale,
  safeFileName,
} from './pageMath';

// Exportar o documento (SPEC-008 §5.6 / ADR-004). PNG e PDF pelo mesmo caminho:
// o que é exportado é o quadro que está na tela — inclusive no modo versão.
// O PDF é gerado NO NAVEGADOR; o documento não vai para servidor nenhum.

export type { ExportFormat, Orientation, PageSize };

export interface ExportOptions {
  format: ExportFormat;
  page: PageSize;
  orientation: Orientation;
  /** Com ou sem o fundo do quadro (PNG sem fundo sai transparente). */
  background: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'pdf',
  page: 'fit',
  orientation: 'landscape',
  background: true,
};

const PADDING = 48;
/** Teto do PNG, como na SPEC-002: a imagem é para a tela, não para o papel. */
const PNG_MAX_SIDE = 6000;

export interface ExportResult {
  /** true quando a resolução teve de ser reduzida pelos tetos do navegador. */
  reduced: boolean;
}

/** Desenha o quadro inteiro (não só o que está à vista) numa imagem PNG. */
async function renderBoard(
  nodes: Node[],
  size: { width: number; height: number },
  background: string | undefined,
): Promise<string> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) throw new Error('quadro não encontrado');
  const bounds = getNodesBounds(nodes);
  const view = getViewportForBounds(
    bounds,
    size.width,
    size.height,
    0.05,
    8,
    PADDING / Math.max(size.width, size.height),
  );

  // A fonte do documento pode ter acabado de ser baixada: sem esta espera, a
  // imagem sai com a fonte substituída (SPEC-007 §5.8).
  try {
    await document.fonts?.ready;
  } catch {
    // Navegador sem a API: segue com o que estiver carregado.
  }

  return toPng(viewport, {
    ...(background ? { backgroundColor: background } : {}),
    width: size.width,
    height: size.height,
    pixelRatio: 1,
    // Botões do editor (o "+" do nó, as barras) não saem na imagem (SPEC-002 §10).
    filter: (el) => !(el instanceof HTMLElement && el.classList.contains('export-hidden')),
    style: {
      width: `${size.width}px`,
      height: `${size.height}px`,
      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    },
  });
}

function download(href: string, name: string) {
  const link = document.createElement('a');
  link.download = name;
  link.href = href;
  link.click();
}

/** Fundo do quadro em uso — não o do resto da interface (SPEC-006 §5.5). */
function boardBackground(): string {
  const board = document.querySelector<HTMLElement>('[data-board]') ?? document.body;
  return getComputedStyle(board).getPropertyValue('--canvas').trim() || '#ffffff';
}

export async function exportCanvas(
  nodes: Node[],
  title: string,
  options: ExportOptions = DEFAULT_EXPORT,
): Promise<ExportResult> {
  if (nodes.length === 0) return { reduced: false };
  const bounds = getNodesBounds(nodes);
  const boundsPx = { width: bounds.width + PADDING * 2, height: bounds.height + PADDING * 2 };
  const background = options.background ? boardBackground() : undefined;

  if (options.format === 'png') {
    const scale = Math.min(2, PNG_MAX_SIDE / Math.max(boundsPx.width, boundsPx.height));
    const size = { width: Math.ceil(boundsPx.width * scale), height: Math.ceil(boundsPx.height * scale) };
    download(await renderBoard(nodes, size, background), safeFileName(title, 'png'));
    return { reduced: scale < 2 };
  }

  // PDF: a página manda no tamanho, e o raster é calculado para ~200 dpi nela.
  const page = pageSizeFor(options.page, options.orientation, boundsPx);
  const margin = options.page === 'fit' ? 0 : PAGE_MARGIN_PT;
  const scale = fitScale(boundsPx, page, margin);
  const drawn = {
    width: boundsPx.width * PX_TO_PT * scale,
    height: boundsPx.height * PX_TO_PT * scale,
  };
  const raster = rasterScale(drawn, boundsPx, 200, MAX_RASTER_SIDE, MAX_RASTER_PIXELS);
  const dataUrl = await renderBoard(nodes, { width: raster.width, height: raster.height }, background);

  // A biblioteca de PDF só é baixada quando alguém exporta (ADR-004).
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    unit: 'pt',
    format: [page.width, page.height],
    orientation: page.width >= page.height ? 'landscape' : 'portrait',
    compress: true,
  });
  // Só o título vai nos metadados — nada de autor nem e-mail (SPEC-008 §6).
  pdf.setProperties({ title });
  pdf.addImage(
    dataUrl,
    'PNG',
    (page.width - drawn.width) / 2,
    (page.height - drawn.height) / 2,
    drawn.width,
    drawn.height,
    undefined,
    'FAST',
  );
  pdf.save(safeFileName(title, 'pdf'));
  return { reduced: raster.reduced };
}
