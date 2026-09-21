import { NODE_TEXT_MAX } from '@diagram/shared';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { Side } from './layout';

export type MindNodeData = {
  text: string;
  side: Side;
  color: string;
  bold: boolean;
  hasHiddenChildren: boolean;
  editing: boolean;
  /** Texto inicial ao começar a editar digitando (substitui o conteúdo). */
  draft: string | null;
  /** Colegas com este nó selecionado. */
  peers: Array<{ name: string; color: string }>;
  onCommit: (id: string, text: string | null) => void;
  /** Teclas digitadas antes de o campo conseguir foco (ver NodeEditor). */
  takePending: () => string;
};

/** Marca um Enter apertado antes de o campo de texto ganhar foco. */
export const PENDING_ENTER = String.fromCharCode(0);

export type MindFlowNode = Node<MindNodeData, 'mind'>;

const hiddenHandle = '!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent';

function MindNodeComponent({ id, data, selected }: NodeProps<MindFlowNode>) {
  const isRoot = data.side === 'root';
  const peer = data.peers[0];

  return (
    <div
      className={[
        'relative rounded-xl border-2 bg-surface text-ink',
        isRoot ? 'px-6 py-3 font-display text-lg font-semibold' : 'px-3.5 py-1.5 text-sm',
        data.bold ? 'font-bold' : '',
        selected ? 'node-lit' : '',
      ].join(' ')}
      style={{
        borderColor: data.color,
        maxWidth: isRoot ? 320 : 260,
        minWidth: 48,
        ...(peer && !selected ? { outline: `2px dashed ${peer.color}`, outlineOffset: 3 } : {}),
      }}
    >
      {/* Texto sempre renderizado como texto — nunca HTML (CLAUDE.md §9). */}
      {data.editing ? (
        <NodeEditor
          initial={data.draft ?? data.text}
          takePending={data.takePending}
          onDone={(text) => data.onCommit(id, text)}
        />
      ) : (
        <span className="block whitespace-pre-wrap break-words">{data.text || ' '}</span>
      )}

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
          className="absolute top-1/2 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: data.color, [data.side === 'left' ? 'left' : 'right']: -20 }}
          title="Ramo recolhido (Espaço para abrir)"
        >
          +
        </span>
      )}

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
      className="nodrag nopan block w-full min-w-[120px] resize-none bg-transparent outline-none"
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
