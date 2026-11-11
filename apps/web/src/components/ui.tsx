import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react';
import { usePresence } from './usePresence';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
};

// SPEC-008 §5.1: a ação principal é o degradê azul→violeta da marca.
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[linear-gradient(120deg,var(--brand),var(--brand-2))] text-on-brand shadow-sm hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger text-on-danger hover:opacity-90',
};

export function Button({
  variant = 'secondary',
  className = '',
  size = 'md',
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      // SPEC-009 §5.5: retorno ao pressionar (escala 0,97) e foco visível.
      className={`inline-flex items-center justify-center gap-2 rounded-control font-medium transition-[transform,background-color,filter,opacity,color] duration-(--dur-micro) ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/**
 * Rótulo + campo + dica/erro. O campo recebe `id` e as props de acessibilidade
 * (`aria-describedby` aponta para a dica ou o erro; `aria-invalid` com erro).
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string, aria: { 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const aria = {
    ...(error || hint ? { 'aria-describedby': noteId } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id, aria)}
      {error ? (
        <p id={noteId} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'h-10 min-w-0 rounded-control border border-line bg-surface px-3 text-sm text-ink transition-[border-color,box-shadow] duration-(--dur-micro) placeholder:text-muted focus:border-brand focus:ring-[3px] focus:ring-brand-soft focus:outline-none aria-invalid:border-danger';

/** Ocupa a largura toda, salvo quando `className` define outra. */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const width = /(^|\s)(w-|flex-1|max-w-)/.test(props.className ?? '') ? '' : 'w-full';
  return <input {...props} className={`${inputClass} ${width} ${props.className ?? ''}`} />;
}

/** Largura pelo conteúdo, salvo quando `className` define outra. */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} shrink-0 pr-8 ${props.className ?? ''}`} />;
}

/**
 * Modal nativo (<dialog>): foco preso, Esc fecha, acessível. Entra e sai com
 * animação (SPEC-009 §5.2): ao fechar, o conteúdo continua desenhado — com o
 * que tinha da última vez aberto — até a saída terminar, e só então o
 * `dialog.close()` roda. Assim quem chamou pode limpar o próprio estado na hora.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { mounted, state, onTransitionEnd } = usePresence(open);
  const last = useRef({ title, children, footer });
  if (open) last.current = { title, children, footer };
  const shown = last.current;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (mounted && !dialog.open) dialog.showModal();
    if (!mounted && dialog.open) dialog.close();
  }, [mounted]);

  return (
    <dialog
      ref={ref}
      data-motion="modal"
      data-state={state}
      aria-labelledby={titleId}
      onTransitionEnd={onTransitionEnd}
      onClose={() => {
        if (open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{ width: `min(${width}px, calc(100vw - 32px))` }}
      className="m-auto rounded-modal border border-line bg-surface p-0 text-ink shadow-modal"
    >
      {mounted && (
        <div className="flex flex-col gap-5 p-6">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {shown.title}
          </h2>
          <div className="flex flex-col gap-4">{shown.children}</div>
          {shown.footer && <div className="flex justify-end gap-2">{shown.footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.';
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

/** Marca: um nó central com três ramos, na cor de ação (SPEC-008 §5.1). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 16 6 8M16 16l10-8M16 16v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="6" cy="8" r="3" fill="currentColor" />
      <circle cx="26" cy="8" r="3" fill="currentColor" />
      <circle cx="16" cy="27" r="3" fill="currentColor" />
      <circle cx="16" cy="16" r="7" fill="var(--brand-soft)" />
      <circle cx="16" cy="16" r="4.5" fill="var(--brand)" />
    </svg>
  );
}

const AVATAR_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5c7cfa'];

export function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#5c7cfa';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?';
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-2xs font-semibold text-white ring-2 ring-surface"
      style={{ width: size, height: size, background: color ?? colorFor(name) }}
    >
      {initials(name)}
    </span>
  );
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, seconds] of units) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit);
  }
  return 'agora mesmo';
}
