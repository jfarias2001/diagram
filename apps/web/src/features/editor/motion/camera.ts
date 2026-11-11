// SPEC-009 §5.6.3 — a câmera acompanha o bloco que se cria ou se navega.
// Função pura: só desloca (nunca muda o zoom) e só quando o bloco sai da
// área segura — quem já está vendo o bloco não tem a tela mexida.

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Retângulo em coordenadas do fluxo (canto superior esquerdo + tamanho). */
export interface Box extends Size {
  x: number;
  y: number;
}

export const SAFE_MARGIN = 80;

function axis(start: number, size: number, view: number, margin: number): number {
  const safeStart = margin;
  const safeEnd = view - margin;
  // Maior que a área segura: alinha pelo começo (o texto começa ali).
  if (size > safeEnd - safeStart) return safeStart - start;
  if (start < safeStart) return safeStart - start;
  if (start + size > safeEnd) return safeEnd - (start + size);
  return 0;
}

/** Novo deslocamento do viewport para o bloco ficar visível, ou `null` se já está. */
export function panToReveal(viewport: Viewport, container: Size, box: Box, margin = SAFE_MARGIN): { x: number; y: number } | null {
  // A margem nunca passa de um quarto da tela (tela pequena, celular).
  const mx = Math.min(margin, container.width / 4);
  const my = Math.min(margin, container.height / 4);
  const sx = box.x * viewport.zoom + viewport.x;
  const sy = box.y * viewport.zoom + viewport.y;
  const dx = axis(sx, box.width * viewport.zoom, container.width, mx);
  const dy = axis(sy, box.height * viewport.zoom, container.height, my);
  if (dx === 0 && dy === 0) return null;
  return { x: viewport.x + dx, y: viewport.y + dy };
}
