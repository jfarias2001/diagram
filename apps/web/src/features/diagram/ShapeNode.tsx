import { SHAPE_TEXT_MAX, type ShapeKind } from '@diagram/shared';
import { Handle, type Node, type NodeProps, NodeResizer, Position, useConnection } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { DEFAULT_FILL, DEFAULT_STROKE, ShapeSvg, TEXT_INSET } from './shapes';
import { usePeersFor } from '../editor/presence';

export type ShapeNodeData = {
  kind: ShapeKind;
  text: string;
  fill: string;
  stroke: string;
  /** Cor do texto, já resolvida pelo tema ou pela escolha da pessoa. */
  ink: string;
  bold: boolean;
  editing: boolean;
  /** Texto inicial quando a edição começou digitando. */
  draft: string | null;
  canEdit: boolean;
  onCommit: (id: string, text: string | null) => void;
};

export type ShapeFlowNode = Node<ShapeNodeData, 'shape'>;

const HANDLES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

function ShapeNodeComponent({ id, data, selected }: NodeProps<ShapeFlowNode>) {
  // Enquanto uma seta está sendo puxada, a forma inteira vira alvo: soltar em
  // qualquer ponto dela conecta (SPEC-003 §5.2).
  const connection = useConnection();
  const isTarget = connection.inProgress && connection.fromNode?.id !== id;
  const inset = TEXT_INSET[data.kind];
  const peers = usePeersFor(id);
  const peer = peers[0];
  const isText = data.kind === 'text';
  const isTerminator = data.kind === 'terminator';

  return (
    <div className="group relative h-full w-full" style={{ color: data.ink }}>
      {data.canEdit && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={24}
          minHeight={24}
          lineClassName="export-hidden !border-brand"
          handleClassName="export-hidden !h-2.5 !w-2.5 !rounded-sm !border-brand !bg-surface"
        />
      )}

      {/* A cápsula é desenhada em CSS; as outras formas, em SVG (SPEC-003 §5.3). */}
      {isTerminator ? (
        <div
          className="absolute inset-0 rounded-full border-2"
          style={{ background: data.fill, borderColor: data.stroke }}
        />
      ) : (
        <ShapeSvg kind={data.kind} fill={isText ? 'none' : data.fill} stroke={data.stroke} className="absolute inset-0 h-full w-full" />
      )}

      <div
        className="absolute flex items-center justify-center overflow-hidden"
        style={{
          left: `${inset.x}%`,
          right: `${inset.x}%`,
          top: `${inset.y}%`,
          bottom: `${inset.y}%`,
        }}
      >
        {data.editing ? (
          <ShapeTextEditor initial={data.draft ?? data.text} onDone={(text) => data.onCommit(id, text)} />
        ) : (
          // Texto sempre renderizado como texto — nunca HTML (CLAUDE.md §9).
          <span
            className={`w-full text-center text-sm leading-snug break-words whitespace-pre-wrap ${data.bold ? 'font-bold' : ''}`}
            style={isText ? { color: data.stroke } : undefined}
          >
            {data.text}
          </span>
        )}
      </div>

      {selected && (
        <div className="pointer-events-none absolute -inset-1 rounded-md ring-2 ring-brand" aria-hidden />
      )}
      {/* O anel é meu; o tracejado de fora é do colega — convivem (SPEC-009 §5.7). */}
      {peer && (
        <>
          <div
            className={`pointer-events-none absolute rounded-md ${selected ? '-inset-2.5' : '-inset-1'}`}
            style={{ outline: `2px dashed ${peer.color}` }}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute -top-5 left-0 rounded px-1.5 py-px text-2xs font-medium whitespace-nowrap text-white"
            style={{ background: peer.color }}
          >
            {peers.map((p) => p.name.split(' ')[0]).join(', ')}
          </span>
        </>
      )}

      {HANDLES.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          // ConnectionMode.Loose: a mesma alça serve de origem e de destino.
          type="source"
          position={h.position}
          isConnectable={data.canEdit}
          className={`export-hidden !h-2.5 !w-2.5 !border-2 !border-brand !bg-surface !opacity-0 transition-opacity group-hover:!opacity-100 ${
            selected ? '!opacity-100' : ''
          }`}
        />
      ))}
      {isTarget && (
        <Handle
          id="area"
          type="target"
          position={Position.Top}
          className="export-hidden !absolute !inset-0 !h-full !w-full !transform-none !rounded-none !border-0 !bg-transparent"
          style={{ left: 0, top: 0, right: 0, bottom: 0 }}
        />
      )}
    </div>
  );
}

function ShapeTextEditor({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = (text: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(text);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      maxLength={SHAPE_TEXT_MAX}
      aria-label="Texto da forma"
      className="nodrag nopan h-full w-full resize-none bg-transparent text-center text-sm leading-snug outline-none"
      onChange={(e) => setValue(e.target.value)}
      // O valor vem do próprio campo, não do estado: o estado pode estar um
      // render atrás (texto guardado + Enter logo em seguida — SPEC-009).
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
    />
  );
}

export const ShapeNode = memo(ShapeNodeComponent);
export { DEFAULT_FILL, DEFAULT_STROKE };
