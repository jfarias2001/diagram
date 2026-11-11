import { Panel } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { IconArrowDown, IconArrowUp, IconClose, IconSearch } from '../../components/icons';

// SPEC-009 §5.9 — barra de busca do documento (Ctrl+F), no topo do quadro.
// Enter/Shift+Enter navegam; Esc fecha (e desfaz a revelação local).

export function MapSearch({
  count,
  index,
  onQuery,
  onStep,
  onClose,
}: {
  count: number;
  index: number;
  onQuery: (query: string) => void;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.select(), []);

  // Debounce curto: o mapa não é varrido a cada letra.
  useEffect(() => {
    const t = setTimeout(() => onQuery(value), 120);
    return () => clearTimeout(t);
  }, [value, onQuery]);

  const status = !value.trim() ? '' : count === 0 ? 'Nenhum resultado' : `${index + 1} de ${count}`;

  return (
    <Panel position="top-center" className="export-hidden !mt-3">
      <div
        role="search"
        aria-label="Buscar no documento"
        className="flex animate-pop-in items-center gap-1 rounded-pop border border-line bg-surface py-1 pr-1 pl-2.5 shadow-pop"
        onKeyDown={(e) => {
          // Os atalhos do quadro não disparam de dentro da busca (CLAUDE.md §7).
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onStep(e.shiftKey ? -1 : 1);
          }
        }}
      >
        <IconSearch size={16} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Buscar no documento"
          aria-label="Buscar no documento"
          className="h-8 w-56 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <span aria-live="polite" className="min-w-[88px] text-right text-xs text-muted tabular-nums">
          {status}
        </span>
        <button
          type="button"
          aria-label="Resultado anterior (Shift+Enter)"
          title="Anterior (Shift+Enter)"
          disabled={count === 0}
          onClick={() => onStep(-1)}
          className="rounded-control p-1.5 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          <IconArrowUp size={15} />
        </button>
        <button
          type="button"
          aria-label="Próximo resultado (Enter)"
          title="Próximo (Enter)"
          disabled={count === 0}
          onClick={() => onStep(1)}
          className="rounded-control p-1.5 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        >
          <IconArrowDown size={15} />
        </button>
        <button
          type="button"
          aria-label="Fechar busca (Esc)"
          onClick={onClose}
          className="rounded-control p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <IconClose size={15} />
        </button>
      </div>
    </Panel>
  );
}
