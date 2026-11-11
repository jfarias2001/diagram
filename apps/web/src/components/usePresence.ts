import { type TransitionEvent, useEffect, useRef, useState } from 'react';

// SPEC-009 §5.2 — mantém montado o que está saindo até a animação de saída
// acabar. O CSS anima por [data-state] (enter → open → exit), ver index.css.
//
// - Abrir: monta em `enter` e passa a `open` dois frames depois (o navegador
//   precisa pintar o estado inicial, senão não há transição).
// - Fechar: passa a `exit` e desmonta no fim da transição — ou no teto de
//   segurança, se o evento não vier (elemento escondido, navegador sem suporte).
//   Com "reduzir movimento" a transição dura 1 ms, então o evento vem na hora.

export type PresenceState = 'enter' | 'open' | 'exit';

const SAFETY_MS = 400;

export function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<PresenceState>('enter');
  const frames = useRef<number[]>([]);

  useEffect(() => {
    const cancel = () => {
      frames.current.forEach(cancelAnimationFrame);
      frames.current = [];
    };
    if (open) {
      setMounted(true);
      setState('enter');
      frames.current.push(
        requestAnimationFrame(() => {
          frames.current.push(requestAnimationFrame(() => setState('open')));
        }),
      );
      return cancel;
    }
    setState('exit');
    const timer = setTimeout(() => setMounted(false), SAFETY_MS);
    return () => {
      cancel();
      clearTimeout(timer);
    };
  }, [open]);

  const onTransitionEnd = (e: TransitionEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && !open) setMounted(false);
  };

  return { mounted, state, onTransitionEnd };
}
