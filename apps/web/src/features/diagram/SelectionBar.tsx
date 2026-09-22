import type { EdgeArrow, EdgeLine, FlowEdgeRecord, Shape } from '@diagram/shared';
import { NodeToolbar, Position } from '@xyflow/react';
import { type ReactNode, useState } from 'react';
import { IconTrash } from '../editor/icons';
import { DEFAULT_STROKE, FILL_COLORS, STROKE_COLORS } from './shapes';

// Barra de estilo da seleção (SPEC-003 §5.2). Para formas, acompanha a seleção
// no quadro; para um conector, fica no topo.

export interface ShapeStyleActions {
  setFill: (color: string) => void;
  setStroke: (color: string) => void;
  toggleBold: () => void;
  remove: () => void;
}

export function ShapeSelectionBar({
  shapes,
  actions,
}: {
  shapes: Shape[];
  actions: ShapeStyleActions;
}) {
  const [popover, setPopover] = useState<'fill' | 'stroke' | null>(null);
  const first = shapes[0];
  if (!first) return null;
  const allBold = shapes.every((s) => s.bold);

  return (
    <NodeToolbar nodeId={shapes.map((s) => s.id)} isVisible position={Position.Top} offset={12}>
      <div className="export-hidden flex flex-col items-center gap-1.5" onKeyDown={(e) => e.stopPropagation()}>
        <div
          role="toolbar"
          aria-label={shapes.length > 1 ? `Ações de ${shapes.length} formas` : 'Ações da forma'}
          className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-md"
        >
          <BarButton label="Cor de fundo" pressed={popover === 'fill'} onClick={() => setPopover((p) => (p === 'fill' ? null : 'fill'))}>
            <span className="h-4 w-4 rounded border border-line" style={{ background: first.fill ?? '#ffffff' }} />
          </BarButton>
          <BarButton label="Cor da borda" pressed={popover === 'stroke'} onClick={() => setPopover((p) => (p === 'stroke' ? null : 'stroke'))}>
            <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: first.stroke ?? DEFAULT_STROKE }} />
          </BarButton>
          <BarButton label="Negrito" shortcut="Ctrl+B" pressed={allBold} onClick={actions.toggleBold}>
            <span className="w-4 text-sm font-bold">B</span>
          </BarButton>
          <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
          <BarButton label="Apagar" shortcut="Delete" danger onClick={actions.remove}>
            <IconTrash />
          </BarButton>
        </div>
        {popover && (
          <ColorRow
            colors={popover === 'fill' ? FILL_COLORS : STROKE_COLORS}
            current={popover === 'fill' ? first.fill : first.stroke}
            label={popover === 'fill' ? 'Cores de fundo' : 'Cores da borda'}
            onPick={(color) => {
              if (popover === 'fill') actions.setFill(color);
              else actions.setStroke(color);
              setPopover(null);
            }}
          />
        )}
      </div>
    </NodeToolbar>
  );
}

export interface EdgeStyleActions {
  setLine: (line: EdgeLine) => void;
  setArrow: (arrow: EdgeArrow) => void;
  toggleDashed: () => void;
  setColor: (color: string) => void;
  editLabel: () => void;
  remove: () => void;
}

const LINES: Array<{ value: EdgeLine; label: string; icon: string }> = [
  { value: 'orthogonal', label: 'Ângulo reto', icon: 'M2 4h7v8h7' },
  { value: 'straight', label: 'Reta', icon: 'M2 13L16 5' },
  { value: 'curved', label: 'Curva', icon: 'M2 13C7 13 8 5 16 5' },
];

const ARROWS: Array<{ value: EdgeArrow; label: string }> = [
  { value: 'end', label: 'Seta no fim' },
  { value: 'both', label: 'Seta nos dois lados' },
  { value: 'none', label: 'Sem seta' },
];

export function EdgeSelectionBar({ edge, actions }: { edge: FlowEdgeRecord; actions: EdgeStyleActions }) {
  const [colors, setColors] = useState(false);
  return (
    <div className="export-hidden absolute top-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
      <div role="toolbar" aria-label="Ações do conector" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-md">
        {LINES.map((l) => (
          <BarButton key={l.value} label={l.label} pressed={edge.line === l.value} onClick={() => actions.setLine(l.value)}>
            <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d={l.icon} />
            </svg>
          </BarButton>
        ))}
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <BarButton label="Tracejado" pressed={!!edge.dashed} onClick={actions.toggleDashed}>
          <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="3 3" aria-hidden>
            <path d="M2 9h14" />
          </svg>
        </BarButton>
        {ARROWS.map((a) => (
          <BarButton key={a.value} label={a.label} pressed={edge.arrow === a.value} onClick={() => actions.setArrow(a.value)}>
            <span className="text-xs font-medium">{a.value === 'end' ? '→' : a.value === 'both' ? '↔' : '—'}</span>
          </BarButton>
        ))}
        <BarButton label="Cor do conector" pressed={colors} onClick={() => setColors((c) => !c)}>
          <span className="h-4 w-4 rounded-full border-[3px]" style={{ borderColor: edge.color ?? DEFAULT_STROKE }} />
        </BarButton>
        <BarButton label="Texto do conector" onClick={actions.editLabel}>
          <span className="text-xs font-medium">Aa</span>
        </BarButton>
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <BarButton label="Apagar conector" shortcut="Delete" danger onClick={actions.remove}>
          <IconTrash />
        </BarButton>
      </div>
      {colors && (
        <ColorRow
          colors={STROKE_COLORS}
          current={edge.color}
          label="Cores do conector"
          onPick={(color) => {
            actions.setColor(color);
            setColors(false);
          }}
        />
      )}
    </div>
  );
}

function ColorRow({
  colors,
  current,
  label,
  onPick,
}: {
  colors: string[];
  current: string | undefined;
  label: string;
  onPick: (color: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-md">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cor ${color}`}
          aria-pressed={current === color}
          onClick={() => onPick(color)}
          className={`h-5 w-5 rounded-full border border-line transition ${
            current === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'
          }`}
          style={{ background: color }}
        />
      ))}
    </div>
  );
}

function BarButton({
  label,
  shortcut,
  pressed,
  danger,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 transition ${
        pressed ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
      } ${danger ? 'hover:!text-danger' : ''}`}
    >
      {children}
    </button>
  );
}
