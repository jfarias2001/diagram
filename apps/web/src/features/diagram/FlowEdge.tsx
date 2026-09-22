import { EDGE_LABEL_MAX, type EdgeArrow, type EdgeLine } from '@diagram/shared';
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
} from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import { DEFAULT_STROKE } from './shapes';

// Conector do fluxograma (SPEC-003 §5.2): traçado conforme `line`, seta e rótulo.

export type FlowEdgeData = {
  line: EdgeLine;
  dashed: boolean;
  arrow: EdgeArrow;
  color: string;
  label: string;
  editing: boolean;
  canEdit: boolean;
  onCommitLabel: (id: string, label: string | null) => void;
  onEditLabel: (id: string) => void;
};

export type DiagramFlowEdge = Edge<FlowEdgeData, 'flow'>;

function FlowEdgeComponent({ id, data, selected, markerEnd, markerStart, ...props }: EdgeProps<DiagramFlowEdge>) {
  const params = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  };
  const [path, labelX, labelY] =
    data?.line === 'straight'
      ? getStraightPath(params)
      : data?.line === 'curved'
        ? getBezierPath(params)
        : getSmoothStepPath({ ...params, borderRadius: 8 });

  const color = data?.color ?? DEFAULT_STROKE;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.6 : 1.8,
          strokeDasharray: data?.dashed ? '6 5' : undefined,
        }}
      />
      {(data?.label || data?.editing) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          >
            {data.editing ? (
              <LabelEditor initial={data.label} onDone={(label) => data.onCommitLabel(id, label)} />
            ) : (
              <button
                type="button"
                onDoubleClick={() => data.canEdit && data.onEditLabel(id)}
                className="board-text cursor-default rounded border border-line bg-surface px-1.5 py-0.5 text-xs font-medium text-ink shadow-sm"
              >
                {data.label}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function LabelEditor({ initial, onDone }: { initial: string; onDone: (label: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (label: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(label);
  };
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);

  return (
    <input
      ref={ref}
      value={value}
      maxLength={EDGE_LABEL_MAX}
      aria-label="Texto do conector"
      size={Math.max(4, value.length)}
      className="nodrag nopan rounded border border-filament bg-surface px-1.5 py-0.5 text-center text-xs text-ink outline-none"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
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

export const FlowEdge = memo(FlowEdgeComponent);
