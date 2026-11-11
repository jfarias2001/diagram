import { useEffect, useRef, useState } from 'react';
import { IconClose } from './icons';
import { dismissToast, pauseToast, resumeToast, runToastAction, type ToastItem, useToasts } from './toastStore';

// SPEC-009 §5.4 — avisos no canto (no celular, embaixo e centralizados).
// Texto sempre como texto React: títulos de documento nunca viram HTML.

const EXIT_MS = 160;

type Shown = ToastItem & { leaving?: boolean };

const TONE: Record<ToastItem['tone'], string> = {
  ok: 'bg-ok',
  info: 'bg-brand',
  error: 'bg-danger',
};

export function Toaster() {
  const live = useToasts();
  const [shown, setShown] = useState<Shown[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  // Quem sai da fila fica mais um instante na tela, com a animação de saída.
  useEffect(() => {
    setShown((prev) => {
      const liveById = new Map(live.map((t) => [t.id, t]));
      const next: Shown[] = prev.map((p) => liveById.get(p.id) ?? (p.leaving ? p : { ...p, leaving: true }));
      for (const t of live) if (!prev.some((p) => p.id === t.id)) next.push(t);
      return next;
    });
  }, [live]);

  useEffect(() => {
    for (const item of shown) {
      if (!item.leaving || timers.current.has(item.id)) continue;
      timers.current.set(
        item.id,
        setTimeout(() => {
          timers.current.delete(item.id);
          setShown((prev) => prev.filter((p) => p.id !== item.id));
        }, EXIT_MS),
      );
    }
  }, [shown]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <div
      aria-live="polite"
      aria-label="Avisos"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {shown.map((item) => (
        <div
          key={item.id}
          role={item.tone === 'error' ? 'alert' : 'status'}
          data-toast={item.tone}
          onPointerEnter={() => pauseToast(item.id)}
          onPointerLeave={() => resumeToast(item.id)}
          onFocus={() => pauseToast(item.id)}
          onBlur={() => resumeToast(item.id)}
          className={[
            'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-pop border border-line bg-surface py-2.5 pr-2 pl-3 text-sm text-ink shadow-pop',
            item.leaving
              ? 'translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-exit'
              : 'animate-slide-up',
          ].join(' ')}
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TONE[item.tone]}`} />
          <span className="min-w-0 flex-1 break-words">{item.message}</span>
          {item.action && !item.acted && !item.leaving && (
            <button
              type="button"
              onClick={() => void runToastAction(item.id)}
              className="shrink-0 rounded-control px-2 py-1 text-sm font-semibold text-brand-ink hover:bg-brand-soft"
            >
              {item.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dispensar aviso"
            onClick={() => dismissToast(item.id)}
            className="shrink-0 rounded-control p-1 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
