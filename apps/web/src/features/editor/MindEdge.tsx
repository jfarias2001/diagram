import { type Edge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { IconScissors } from '../../components/icons';
import { taperedPath } from './taper';

// Ligação do mapa mental (SPEC-007 §5.5): traço preenchido que sai grosso do
// pai e afina até o filho, como na referência. Selecionar a linha abre o
// "Cortar e religar" (§5.2).

export type MindEdgeData = {
  color: string;
  /** Espessura na saída, já ajustada pela profundidade. */
  width: number;
  /** Fração da espessura na chegada. */
  taper: number;
  /** Só quem edita pode cortar. */
  canCut: boolean;
  onCut: (childId: string) => void;
};

export type MindFlowEdge = Edge<MindEdgeData, 'mind'>;

/** Ponto médio da mesma curva desenhada por `taperedPath`. */
function midpoint(sx: number, sy: number, tx: number, ty: number) {
  const pull = Math.max(24, Math.abs(tx - sx) * 0.5) * Math.sign(tx - sx || 1);
  const x = 0.125 * sx + 0.375 * (sx + pull) + 0.375 * (tx - pull) + 0.125 * tx;
  const y = 0.5 * sy + 0.5 * ty;
  return { x, y };
}

function MindEdgeComponent({ id, data, source, target, sourceX, sourceY, targetX, targetY, selected }: EdgeProps<MindFlowEdge>) {
  const color = data?.color ?? 'currentColor';
  const width = data?.width ?? 3;
  const d = taperedPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, width, width * (data?.taper ?? 0.45));
  const mid = midpoint(sourceX, sourceY, targetX, targetY);

  return (
    <>
      <path
        d={d}
        fill={color}
        stroke={color}
        strokeWidth={selected ? 2 : 0}
        strokeLinejoin="round"
        className={selected ? 'mind-edge-selected' : undefined}
      />
      {/* Faixa invisível e larga: a linha fina continua fácil de clicar. */}
      <path
        d={`M${sourceX},${sourceY}C${sourceX + 60},${sourceY} ${targetX - 60},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="react-flow__edge-interaction"
      />
      {selected && data?.canCut && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan export-hidden absolute"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`, pointerEvents: 'all' }}
          >
            <button
              type="button"
              title="Cortar e religar em outro tópico-pai"
              aria-label="Cortar e religar em outro tópico-pai"
              data-edge={id}
              data-source={source}
              onClick={(e) => {
                e.stopPropagation();
                data.onCut(target);
              }}
              className="flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2 text-xs font-medium text-ink shadow-md transition hover:bg-surface-2"
            >
              <IconScissors size={13} />
              Cortar
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const MindEdge = memo(MindEdgeComponent);
