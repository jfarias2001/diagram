import { useEffect, useState } from 'react';
import { useCommands } from '../../components/CommandPalette';
import { IconKey } from '../../components/icons';
import { Modal } from '../../components/ui';

// Atalhos dos editores (SPEC-009 §5.11): botão no canto, `Ctrl+/` sempre, e
// `?` quando a tecla não foi usada para editar — com um bloco selecionado,
// digitar "?" começa a editar o texto (CLAUDE.md §7), e o editor marca a tecla
// como tratada (preventDefault); só sem seleção ela abre esta lista.

/** Atalhos que valem nos dois editores (busca, paleta, esta lista). */
export const COMMON_SHORTCUTS: Array<[string, string]> = [
  ['Ctrl+K', 'paleta de comandos'],
  ['Ctrl+F', 'buscar no documento'],
  ['? ou Ctrl+/', 'esta lista de atalhos'],
];

function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

export function ShortcutHint({ rows }: { rows: Array<[string, string]> }) {
  const [open, setOpen] = useState(false);
  const all = [...rows, ...COMMON_SHORTCUTS];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === '?' && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey && !typingIn(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useCommands('shortcuts', () => [
    { id: 'shortcuts', label: 'Atalhos do teclado', group: 'Ajuda', shortcut: 'Ctrl+/', icon: IconKey, run: () => setOpen(true) },
  ]);

  return (
    <>
      <div className="absolute right-3 bottom-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          title="Atalhos do teclado (? ou Ctrl+/)"
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-sm transition-colors duration-(--dur-micro) hover:text-ink"
        >
          Atalhos
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Atalhos do teclado" width={520}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {all.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-xs font-medium">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </>
  );
}
