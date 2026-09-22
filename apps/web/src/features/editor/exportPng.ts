import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { toPng } from 'html-to-image';

const PADDING = 48;
const MAX_SIDE = 6000;

/** Nome de arquivo seguro a partir do título (sem caminho nem caracteres especiais). */
export function safeFileName(title: string): string {
  const cleaned = title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${cleaned || 'documento'}.png`;
}

/** Exporta o documento inteiro (não só o que está na tela) como PNG — mapa ou fluxograma. */
export async function exportCanvasPng(nodes: Node[], title: string): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  const scale = Math.min(2, MAX_SIDE / Math.max(bounds.width + PADDING * 2, bounds.height + PADDING * 2));
  const width = Math.ceil((bounds.width + PADDING * 2) * scale);
  const height = Math.ceil((bounds.height + PADDING * 2) * scale);
  const view = getViewportForBounds(bounds, width, height, 0.05, 4, PADDING / Math.max(width, height));
  // Fundo do quadro em uso, não o do resto da interface (SPEC-006 §5.5).
  const board = viewport.closest<HTMLElement>('[data-board]') ?? document.body;
  const background = getComputedStyle(board).getPropertyValue('--canvas').trim() || '#ffffff';

  const dataUrl = await toPng(viewport, {
    backgroundColor: background,
    width,
    height,
    pixelRatio: 1,
    // Botões do editor (o "+" do nó) não saem na imagem (SPEC-002 §10).
    filter: (el) => !(el instanceof HTMLElement && el.classList.contains('export-hidden')),
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    },
  });

  const link = document.createElement('a');
  link.download = safeFileName(title);
  link.href = dataUrl;
  link.click();
}
