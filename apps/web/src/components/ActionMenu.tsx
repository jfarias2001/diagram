import { type ComponentType, type KeyboardEvent, useEffect, useRef } from 'react';

// Menu em grade das ações do bloco (SPEC-008 §5.4). Era uma fileira de ícones
// sem rótulo, que ninguém decifrava; agora cada ação tem ícone, nome e atalho,
// agrupados por assunto. O mesmo componente serve mapa mental e fluxograma.

export interface ActionItem {
  id: string;
  label: string;
  /** Atalho de teclado, mostrado embaixo do nome. */
  shortcut?: string;
  icon: ComponentType<{ size?: number }>;
  /** Estado ligado/desligado (negrito, "leva o ramo junto"…). */
  pressed?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ActionGroup {
  title: string;
  items: ActionItem[];
}

const COLUMNS = 3;

export function ActionMenu({
  groups,
  label = 'Ações do bloco',
  onClose,
}: {
  groups: ActionGroup[];
  label?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = groups.flatMap((g) => g.items).filter((i) => !i.disabled);

  // O primeiro item recebe o foco: o menu é navegável só pelo teclado. Ao
  // fechar, o foco volta para quem abriu — a não ser que o fechamento já o
  // tenha levado a outro lugar (o mapa devolve ao quadro) — SPEC-009 §5.3.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = ref.current;
    menu?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    return () => {
      const active = document.activeElement;
      const lost = !active || active === document.body || !!menu?.contains(active);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const move = (from: HTMLElement, step: number) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const at = buttons.indexOf(from as HTMLButtonElement);
    if (at < 0) return;
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, at + step))];
    next?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Os atalhos do quadro não disparam de dentro do menu (CLAUDE.md §7).
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };
    if (e.key in keys) {
      e.preventDefault();
      move(target, keys[e.key] as number);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(target, e.key === 'Home' ? -items.length : items.length);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="export-hidden max-h-[60vh] w-[268px] animate-pop-in overflow-y-auto rounded-modal border border-line bg-surface p-2 shadow-pop"
    >
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.title} className="mb-1 last:mb-0">
            <p className="px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-wider text-muted uppercase">
              {group.title}
            </p>
            <div className="grid grid-cols-3 gap-1">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  aria-pressed={item.pressed}
                  title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                  onClick={item.onSelect}
                  className={[
                    'flex flex-col items-center gap-1 rounded-pop px-1 py-2 text-center transition-colors duration-(--dur-micro)',
                    'focus:bg-surface-2 focus:outline-none',
                    item.pressed ? 'bg-brand-soft text-brand-ink' : 'text-ink hover:bg-surface-2',
                    item.danger ? 'hover:bg-danger/10 hover:text-danger' : '',
                  ].join(' ')}
                >
                  <item.icon size={20} />
                  <span className="text-2xs leading-tight font-medium">{item.label}</span>
                  {item.shortcut && <span className="text-2xs text-muted">{item.shortcut}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
