import { NODE_TEXT_MAX, type NodeShape } from '@diagram/shared';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { IconLink, IconNote, IconPlus } from './icons';
import { SHAPE_PADDING, type Side } from './layout';

export type MindNodeData = {
  text: string;
  side: Side;
  color: string;
  /** Formato do bloco (SPEC-006 §5.4). */
  shape: NodeShape;
  /** Preenchimento escolhido, ou null = fundo do quadro. */
  fill: string | null;
  /** Cor do texto com contraste sobre o preenchimento, ou null = tinta do quadro. */
  ink: string | null;
  /** Bloco sob o ponteiro durante um arrasto: soltar aqui troca o pai. */
  dropTarget: boolean;
  /** Modo religar (SPEC-007 §5.2): este bloco não pode receber o bloco solto. */
  blocked: boolean;
  /** Modo religar: este bloco é um destino possível. */
  picking: boolean;
  bold: boolean;
  hasHiddenChildren: boolean;
  editing: boolean;
  /** Texto inicial ao começar a editar digitando (substitui o conteúdo). */
  draft: string | null;
  /** Colegas com este nó selecionado. */
  peers: Array<{ name: string; color: string }>;
  canEdit: boolean;
  hasNote: boolean;
  /** Já validado por readNode (só http/https/mailto). */
  link: string | null;
  onCommit: (id: string, text: string | null) => void;
  /** Teclas digitadas antes de o campo conseguir foco (ver NodeEditor). */
  takePending: () => string;
  /** Callbacks estáveis (SPEC-002 §5.4). */
  onAddChild: (id: string) => void;
  onOpenNote: (id: string) => void;
};

/** Marca um Enter apertado antes de o campo de texto ganhar foco. */
export const PENDING_ENTER = String.fromCharCode(0);

export type MindFlowNode = Node<MindNodeData, 'mind'>;

const hiddenHandle = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent';

/**
 * "+" na borda de fora do nó (SPEC-002 §5.2). Aparece no hover só com CSS
 * (sem estado React) e fica visível no nó selecionado, para funcionar no toque.
 * O atraso ao esconder deixa o mouse atravessar a folga até o botão.
 */
function AddChildButton({ id, side, color, selected, onAdd }: {
  id: string;
  side: 'left' | 'right';
  color: string;
  selected: boolean;
  onAdd: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Adicionar tópico filho"
      title="Adicionar tópico filho (Tab)"
      onClick={(e) => {
        e.stopPropagation();
        onAdd(id);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={[
        'nodrag nopan export-hidden absolute top-1/2 z-10 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-full border-2 bg-surface text-ink shadow-sm',
        'transition-[opacity,visibility,transform] delay-150 hover:scale-110 group-hover:visible group-hover:opacity-100 group-hover:delay-0',
        selected ? 'visible opacity-100' : 'invisible opacity-0',
      ].join(' ')}
      style={{ borderColor: color, [side]: -26 }}
    >
      <IconPlus size={12} strokeWidth={3} />
    </button>
  );
}

/** Formatos desenhados em SVG: borda e preenchimento que o CSS não faz. */
const SVG_SHAPES = new Set<NodeShape>(['ellipse', 'hexagon']);

/** Caixa do formato feita com CSS (SPEC-006 §5.4). */
const CSS_SHAPE_CLASS: Record<NodeShape, string> = {
  rounded: 'rounded-xl border-2',
  rect: 'rounded-[3px] border-2',
  capsule: 'rounded-full border-2',
  underline: 'rounded-none border-0 border-b-2',
  ellipse: 'border-0',
  hexagon: 'border-0',
};

/** Fundo do formato, atrás do texto. `preserveAspectRatio="none"` estica ao bloco. */
function ShapeBackground({ shape, fill, stroke, lit }: { shape: NodeShape; fill: string; stroke: string; lit: boolean }) {
  const common = { fill, stroke, strokeWidth: lit ? 4 : 2.5, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={lit ? { filter: 'drop-shadow(0 0 6px var(--filament))' } : undefined}
    >
      {shape === 'ellipse' ? (
        <ellipse cx="50" cy="50" rx="49" ry="48" {...common} />
      ) : (
        <polygon points="18,2 82,2 99,50 82,98 18,98 1,50" {...common} />
      )}
    </svg>
  );
}

function MindNodeComponent({ id, data, selected }: NodeProps<MindFlowNode>) {
  const isRoot = data.side === 'root';
  const peer = data.peers[0];
  const canAdd = data.canEdit && !data.editing;
  const shape = data.shape;
  const drawn = SVG_SHAPES.has(shape);
  const extra = SHAPE_PADDING[shape] ?? SHAPE_PADDING.rounded;

  return (
    <div
      className={[
        'group relative text-ink',
        CSS_SHAPE_CLASS[shape],
        data.fill || drawn ? '' : 'bg-surface',
        isRoot ? 'px-6 py-3 text-lg font-semibold' : 'px-3.5 py-1.5 text-sm',
        data.bold ? 'font-bold' : '',
        selected && !drawn ? 'node-lit' : '',
        data.dropTarget ? 'drop-target' : '',
        data.blocked ? 'rewire-blocked' : '',
        data.picking ? 'rewire-target' : '',
      ].join(' ')}
      style={{
        borderColor: data.color,
        maxWidth: (isRoot ? 320 : 260) + extra.x,
        minWidth: 48 + extra.x,
        paddingLeft: `calc(${isRoot ? '1.5rem' : '0.875rem'} + ${extra.x / 2}px)`,
        paddingRight: `calc(${isRoot ? '1.5rem' : '0.875rem'} + ${extra.x / 2}px)`,
        paddingTop: `calc(${isRoot ? '0.75rem' : '0.375rem'} + ${extra.y}px)`,
        paddingBottom: `calc(${isRoot ? '0.75rem' : '0.375rem'} + ${extra.y}px)`,
        // Cor validada na leitura do Y.Doc: só #rrggbb chega aqui (SPEC-006 §6).
        ...(data.fill && !drawn ? { background: data.fill } : {}),
        ...(data.ink ? { color: data.ink } : {}),
        ...(peer && !selected ? { outline: `2px dashed ${peer.color}`, outlineOffset: 3 } : {}),
      }}
    >
      {drawn && (
        <ShapeBackground
          shape={shape}
          fill={data.fill ?? 'var(--surface)'}
          stroke={data.color}
          lit={!!selected}
        />
      )}
      <div className="relative flex items-start gap-1.5">
        {/* Texto sempre renderizado como texto — nunca HTML (CLAUDE.md §9). */}
        {data.editing ? (
          <NodeEditor
            initial={data.draft ?? data.text}
            takePending={data.takePending}
            onDone={(text) => data.onCommit(id, text)}
          />
        ) : (
          <span className="block min-w-0 flex-1 whitespace-pre-wrap break-words">{data.text || ' '}</span>
        )}
        {(data.hasNote || data.link) && (
          <span className="flex shrink-0 items-center gap-0.5 self-center text-muted">
            {data.hasNote && (
              <button
                type="button"
                aria-label="Ver nota"
                title="Ver nota"
                className="nodrag nopan rounded p-0.5 hover:bg-surface-2 hover:text-ink"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onOpenNote(id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <IconNote size={14} />
              </button>
            )}
            {data.link && (
              <a
                href={data.link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir link: ${data.link}`}
                title={data.link}
                className="nodrag nopan rounded p-0.5 hover:bg-surface-2 hover:text-ink"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <IconLink size={14} />
              </a>
            )}
          </span>
        )}
      </div>

      {peer && (
        <span
          className="pointer-events-none absolute -top-5 left-2 rounded px-1.5 py-px text-[10px] font-medium whitespace-nowrap text-white"
          style={{ background: peer.color }}
        >
          {data.peers.map((p) => p.name.split(' ')[0]).join(', ')}
        </span>
      )}

      {data.hasHiddenChildren && (
        <span
          className={`absolute top-1/2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${canAdd ? 'group-hover:invisible' : ''} ${canAdd && selected ? 'invisible' : ''}`}
          style={{ background: data.color, [data.side === 'left' ? 'left' : 'right']: -20 }}
          title="Ramo recolhido (Espaço para abrir)"
        >
          +
        </span>
      )}

      {canAdd && (isRoot ? (['left', 'right'] as const) : [data.side as 'left' | 'right']).map((side) => (
        <AddChildButton key={side} id={id} side={side} color={data.color} selected={!!selected} onAdd={data.onAddChild} />
      ))}

      <Handle type="target" position={Position.Left} id="t-l" isConnectable={false} className={hiddenHandle} />
      <Handle type="target" position={Position.Right} id="t-r" isConnectable={false} className={hiddenHandle} />
      <Handle type="source" position={Position.Left} id="s-l" isConnectable={false} className={hiddenHandle} />
      <Handle type="source" position={Position.Right} id="s-r" isConnectable={false} className={hiddenHandle} />
    </div>
  );
}

function NodeEditor({
  initial,
  takePending,
  onDone,
}: {
  initial: string;
  takePending: () => string;
  onDone: (text: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  const finish = (text: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(text);
  };

  // O React Flow deixa um nó novo invisível até medi-lo, e focus() falha nesse
  // intervalo. Tenta a cada frame; o que foi digitado enquanto isso não se perde.
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const tryFocus = () => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (document.activeElement === el) {
        const pending = takePending();
        const enter = pending.indexOf(PENDING_ENTER);
        if (enter >= 0) {
          // Enter também foi apertado antes do foco: confirma direto.
          finish(el.value + pending.slice(0, enter));
          return;
        }
        if (pending) setValue((v) => v + pending);
        requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
      } else if (tries++ < 30) {
        frame = requestAnimationFrame(tryFocus);
      }
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda uma vez por edição
  }, [takePending]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={Math.max(1, value.split('\n').length)}
      maxLength={NODE_TEXT_MAX}
      aria-label="Texto do nó"
      className="nodrag nopan block w-full min-w-[120px] flex-1 resize-none bg-transparent outline-none"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        // Atalhos do editor não disparam enquanto se digita.
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
    />
  );
}

export const MindNode = memo(MindNodeComponent);
