import type { ShapeKind } from '@diagram/shared';
import { useEffect, useRef } from 'react';
import { ShapePreview } from './ShapePalette';
import { PALETTE_ORDER, SHAPE_LABEL } from './shapes';

// Mini menu ao soltar uma seta no vazio (SPEC-003 §5.2): escolhe a forma que
// nasce ali, já ligada.

export function QuickShapeMenu({
  at,
  onPick,
  onClose,
}: {
  at: { x: number; y: number };
  onPick: (kind: ShapeKind) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // No próximo tick: o clique que abriu o menu não pode fechá-lo.
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', close);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Criar forma ligada"
      className="export-hidden absolute z-30 grid w-[184px] grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
      style={{ left: at.x, top: at.y }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {PALETTE_ORDER.map((kind, i) => (
        <button
          key={kind}
          role="menuitem"
          type="button"
          autoFocus={i === 0}
          title={SHAPE_LABEL[kind]}
          aria-label={SHAPE_LABEL[kind]}
          onClick={() => onPick(kind)}
          className="flex items-center justify-center rounded-lg p-1.5 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
        >
          <ShapePreview kind={kind} size={32} />
        </button>
      ))}
    </div>
  );
}
