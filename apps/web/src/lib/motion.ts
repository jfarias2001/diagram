import { useSyncExternalStore } from 'react';

// SPEC-009 §5.1 — o ritmo de movimento em JS. Os mesmos números dos tokens
// --dur-* do index.css: o React Flow (zoom, câmera) e a animação de layout
// recebem duração em milissegundos, não em CSS.

export const DUR = {
  micro: 120,
  fast: 180,
  base: 240,
  slow: 320,
} as const;

const QUERY = '(prefers-reduced-motion: reduce)';

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

/** "Reduzir movimento" ligado no sistema operacional. */
export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}

/** Duração efetiva: 0 com "reduzir movimento" (nada desliza nem cresce). */
export function motionMs(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}

function subscribe(onChange: () => void): () => void {
  const list = media();
  if (!list) return () => {};
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** Versão reativa: o componente re-renderiza se a preferência mudar. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/** Desaceleração cúbica: rápido no começo, assenta no fim (entrada e resposta). */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}
