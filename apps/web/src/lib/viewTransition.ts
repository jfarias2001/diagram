import { flushSync } from 'react-dom';
import { prefersReducedMotion } from './motion';

// SPEC-009 §5.5 — troca de visual (cartões ⇄ lista, filtro) com crossfade
// nativo do navegador. Sem suporte ou com "reduzir movimento": muda direto.

type StartViewTransition = (update: () => void) => unknown;

export function withViewTransition(update: () => void) {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start || prefersReducedMotion()) {
    update();
    return;
  }
  start.call(document, () => flushSync(update));
}
