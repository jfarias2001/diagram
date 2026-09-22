import { useState } from 'react';

/** Lista de atalhos no canto inferior direito, comum aos editores. */
export function ShortcutHint({ rows }: { rows: Array<[string, string]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
      {open && (
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-xl border border-line bg-surface p-3 text-xs shadow-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-sm hover:text-ink"
      >
        {open ? 'Fechar atalhos' : 'Atalhos'}
      </button>
    </div>
  );
}
