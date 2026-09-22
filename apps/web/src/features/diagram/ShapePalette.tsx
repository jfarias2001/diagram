import type { ShapeKind } from '@diagram/shared';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FILL, DEFAULT_STROKE, PALETTE_ORDER, SHAPE_LABEL, ShapeSvg } from './shapes';

// Paleta de formas (SPEC-003 §5.2). O arrasto usa eventos de ponteiro (não o
// arrastar HTML5), então funciona igual com mouse, caneta e toque.

const DRAG_THRESHOLD_PX = 5;

export function ShapePalette({
  onPick,
  onDropShape,
}: {
  onPick: (kind: ShapeKind) => void;
  /** Soltou no quadro, na posição da tela. */
  onDropShape: (kind: ShapeKind, at: { x: number; y: number }) => void;
}) {
  const [drag, setDrag] = useState<{ kind: ShapeKind; x: number; y: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      setDrag((cur) => {
        if (!cur) return cur;
        const moved = cur.moved || Math.hypot(e.clientX - cur.x, e.clientY - cur.y) > DRAG_THRESHOLD_PX;
        return { ...cur, x: e.clientX, y: e.clientY, moved };
      });
    };
    const up = (e: PointerEvent) => {
      const cur = dragRef.current;
      setDrag(null);
      if (!cur) return;
      const overCanvas = (e.target as HTMLElement | null)?.closest('.react-flow');
      if (cur.moved && overCanvas) onDropShape(cur.kind, { x: e.clientX, y: e.clientY });
      else if (!cur.moved) onPick(cur.kind); // clique simples
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, onDropShape, onPick]);

  return (
    <>
      <aside
        aria-label="Formas"
        className="export-hidden z-10 flex w-[84px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-2"
      >
        {PALETTE_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            title={`${SHAPE_LABEL[kind]} — arraste para o quadro ou clique`}
            aria-label={SHAPE_LABEL[kind]}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              setDrag({ kind, x: e.clientX, y: e.clientY, moved: false });
            }}
            className="flex cursor-grab touch-none flex-col items-center gap-1 rounded-lg p-1.5 text-[10px] text-muted transition hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
          >
            <ShapePreview kind={kind} />
            <span className="w-full truncate text-center leading-tight">{SHAPE_LABEL[kind]}</span>
          </button>
        ))}
      </aside>
      {drag?.moved && (
        <div
          className="pointer-events-none fixed z-50 opacity-80"
          style={{ left: drag.x - 30, top: drag.y - 19 }}
          aria-hidden
        >
          <ShapePreview kind={drag.kind} size={60} />
        </div>
      )}
    </>
  );
}

export function ShapePreview({ kind, size = 40 }: { kind: ShapeKind; size?: number }) {
  const style = { width: size, height: size * 0.62 };
  if (kind === 'terminator') {
    return <span className="block rounded-full border-2" style={{ ...style, background: DEFAULT_FILL, borderColor: DEFAULT_STROKE }} />;
  }
  if (kind === 'text') {
    return (
      <span className="flex items-center justify-center font-semibold text-ink" style={style} aria-hidden>
        Aa
      </span>
    );
  }
  return (
    <span className="block" style={style}>
      <ShapeSvg kind={kind} fill={kind === 'note' ? '#fff3bf' : DEFAULT_FILL} stroke={DEFAULT_STROKE} strokeWidth={2} className="h-full w-full" />
    </span>
  );
}
