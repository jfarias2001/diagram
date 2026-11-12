import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Função com identidade fixa que sempre chama a versão mais recente de `fn`.
 *
 * O React Flow repassa `onNodeClick`, `onEdgeClick` etc. para CADA nó e ligação
 * (componentes memorizados). Uma arrow function nova a cada render faz todos
 * redesenharem — no arrasto, isso acontecia a cada movimento do mouse.
 * Só para tratadores de evento: não chamar durante o render.
 */
export function useStableHandler<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
