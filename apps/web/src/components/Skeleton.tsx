import { type ReactNode, useEffect, useRef, useState } from 'react';

// SPEC-009 §5.5 — esqueleto no formato do conteúdo, no lugar do círculo
// girando. Para não piscar: só aparece se a espera passar de 200 ms e, uma
// vez na tela, fica pelo menos 400 ms (PESQUISA-001 §6).

export const SKELETON_DELAY = 200;
export const SKELETON_MIN = 400;

/**
 * Regra de tempo, sem React (testada em Skeleton.test.ts). `set(true)` quando
 * começa a carregar, `set(false)` quando termina; `onChange` diz se o
 * esqueleto deve estar na tela.
 */
export function createDelayedFlag(onChange: (shown: boolean) => void, delay = SKELETON_DELAY, min = SKELETON_MIN) {
  let shown = false;
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const change = (next: boolean) => {
    if (next === shown) return;
    shown = next;
    if (next) shownAt = Date.now();
    onChange(next);
  };
  return {
    set(active: boolean) {
      clear();
      if (active) {
        if (!shown) timer = setTimeout(() => change(true), delay);
        return;
      }
      if (!shown) return;
      const left = min - (Date.now() - shownAt);
      if (left <= 0) change(false);
      else timer = setTimeout(() => change(false), left);
    },
    dispose: clear,
  };
}

export function useDelayedFlag(active: boolean): boolean {
  const [shown, setShown] = useState(false);
  const flag = useRef<ReturnType<typeof createDelayedFlag> | null>(null);
  if (!flag.current) flag.current = createDelayedFlag(setShown);
  useEffect(() => flag.current?.set(active), [active]);
  useEffect(() => () => flag.current?.dispose(), []);
  return shown;
}

/**
 * Enquanto `loading`: nada nos primeiros 200 ms, depois o `skeleton`. Pronto
 * (e passado o tempo mínimo do esqueleto), o conteúdo — calculado só então.
 */
export function Deferred({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: () => ReactNode;
}) {
  const shown = useDelayedFlag(loading);
  if (shown) return <div aria-busy="true">{skeleton}</div>;
  if (loading) return <div aria-busy="true" className="min-h-8" />;
  return <>{children()}</>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-shimmer rounded-control bg-surface-2 ${className}`} />;
}

export function CardsSkeleton({ view }: { view: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <Skeleton className="h-28 rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 4, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="h-7 w-7 rounded-full" />}
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      <div className="px-4 py-3">
        <Skeleton className="h-3 w-1/3" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1fr] items-center gap-4 px-4 py-3.5">
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
          <Skeleton className="h-3.5" />
        </div>
      ))}
    </div>
  );
}

/** Editor abrindo: cabeçalho e quadro vazio, com o recado de status. */
export function EditorSkeleton({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-4 border-b border-line bg-surface px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-48" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center bg-[radial-gradient(var(--grid)_1.2px,transparent_1.2px)] [background-size:22px_22px]">
        <Skeleton className="h-14 w-48 rounded-2xl" />
        <p role="status" className="absolute bottom-6 text-sm text-muted">
          {message}
        </p>
      </div>
    </div>
  );
}
