import {
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { usePresence } from './usePresence';

// SPEC-009 §5.3 — o menu único do sistema (documento, pasta, "+ Criar",
// usuário). Antes eram quatro menus feitos à mão, cada um com um defeito:
// sem setas, sem devolver o foco, fechando só com clique de mouse.
//
// - Abre a partir do gatilho (transform-origin no canto dele).
// - Teclado: foca o primeiro item; ↑ ↓ Home End e a letra inicial navegam;
//   Esc fecha e devolve o foco ao gatilho.
// - Fecha com toque/clique fora (pointerdown) e quando o foco sai (Tab).

export interface MenuItem {
  label: string;
  /** Linha de apoio, embaixo do rótulo. */
  description?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export type MenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls'?: string;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

const PLACEMENT: Record<MenuPlacement, { box: string; origin: string }> = {
  'bottom-start': { box: 'top-full left-0 mt-1.5', origin: 'top left' },
  'bottom-end': { box: 'top-full right-0 mt-1.5', origin: 'top right' },
  'top-start': { box: 'bottom-full left-0 mb-1.5', origin: 'bottom left' },
  'top-end': { box: 'bottom-full right-0 mb-1.5', origin: 'bottom right' },
};

export function Menu({
  label,
  items,
  trigger,
  placement = 'bottom-end',
  width = 'w-52',
  className = '',
}: {
  /** Nome acessível do menu. */
  label: string;
  items: MenuItem[];
  trigger: (props: MenuTriggerProps) => ReactNode;
  placement?: MenuPlacement;
  /** Classe de largura (Tailwind). */
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, state, onTransitionEnd } = usePresence(open);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabled = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Ao abrir, o foco vai para o primeiro item (teclado e leitor de tela).
  useEffect(() => {
    if (open && mounted) enabled()[0]?.focus({ preventScroll: true });
  }, [open, mounted]);

  // Clique ou toque fora fecha.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') close(true);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Letra inicial: próximo item que começa com ela.
      const key = e.key.toLocaleLowerCase('pt-BR');
      const order = [...list.slice(at + 1), ...list.slice(0, at + 1)];
      order.find((el) => el.textContent?.trim().toLocaleLowerCase('pt-BR').startsWith(key))?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const place = PLACEMENT[placement];

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className}`}
      onBlur={(e) => {
        // Tab para fora do menu fecha (sem roubar o foco de volta).
        if (open && !wrapperRef.current?.contains(e.relatedTarget as Node | null)) close(false);
      }}
    >
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        ...(open ? { 'aria-controls': menuId } : {}),
        onClick: () => setOpen((o) => !o),
        onKeyDown: (e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        },
      })}
      {mounted && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          data-motion="pop"
          data-state={state}
          onTransitionEnd={onTransitionEnd}
          onKeyDown={onListKeyDown}
          style={{ '--origin': place.origin } as CSSProperties}
          className={`absolute z-40 ${place.box} ${width} flex flex-col rounded-pop border border-line bg-surface p-1 text-ink shadow-pop`}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                tabIndex={-1}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
                className={[
                  'flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left text-sm outline-none',
                  'hover:bg-surface-2 focus-visible:bg-surface-2 focus:bg-surface-2',
                  'disabled:cursor-not-allowed disabled:opacity-45',
                  item.danger ? 'text-danger' : '',
                ].join(' ')}
              >
                {Icon && <Icon size={16} className="mt-0.5 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.label}</span>
                  {item.description && <span className="block text-xs text-muted">{item.description}</span>}
                </span>
                {item.shortcut && (
                  <kbd className="mt-0.5 shrink-0 font-sans text-2xs text-muted">{item.shortcut}</kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
