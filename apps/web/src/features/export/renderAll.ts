import { useSyncExternalStore } from 'react';

// SPEC-009 §5.8 — os quadros desenham só o que está na tela
// (`onlyRenderVisibleElements`), mas a exportação fotografa o DOM: o que está
// fora da vista simplesmente não estaria na imagem. Durante a exportação, os
// quadros desenham TUDO; depois voltam ao normal.
//
// A exportação também espera a animação de layout assentar (SPEC-009 §5.6.2):
// quem anima se registra em `settlers`.

let renderAll = 0;
const listeners = new Set<() => void>();
const settlers = new Set<() => Promise<void>>();

function emit() {
  for (const listener of listeners) listener();
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Liga o "desenhar tudo", espera a animação e 2 frames; devolve quem desliga. */
export async function requestRenderAll(): Promise<() => void> {
  renderAll += 1;
  emit();
  await Promise.all([...settlers].map((settle) => settle()));
  await nextFrame();
  await nextFrame();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    renderAll -= 1;
    emit();
  };
}

/** Registra quem precisa assentar antes da foto (animação de layout). */
export function registerSettler(settle: () => Promise<void>): () => void {
  settlers.add(settle);
  return () => settlers.delete(settle);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRenderAll(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => renderAll > 0,
    () => false,
  );
}
