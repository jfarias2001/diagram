import { Panel, useReactFlow } from '@xyflow/react';
import { type ReactNode, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { FIT_VIEW_OPTIONS } from '../editor/CanvasControls';
import { IconFit, IconRedo, IconUndo, IconZoomIn, IconZoomOut } from '../editor/icons';
import { Spinner } from '../../components/ui';

// Controles do fluxograma (SPEC-003 §5.2): desfazer, zoom, grade e Organizar.

export function DiagramControls({
  undo,
  canEdit,
  snapToGrid,
  onToggleGrid,
  onOrganize,
  organizing,
  onAfter,
}: {
  undo: Y.UndoManager | null;
  canEdit: boolean;
  snapToGrid: boolean;
  onToggleGrid: () => void;
  onOrganize: () => void;
  organizing: boolean;
  onAfter: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [stack, setStack] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    if (!undo) return;
    const update = () => setStack({ canUndo: undo.canUndo(), canRedo: undo.canRedo() });
    update();
    undo.on('stack-item-added', update);
    undo.on('stack-item-popped', update);
    undo.on('stack-cleared', update);
    return () => {
      undo.off('stack-item-added', update);
      undo.off('stack-item-popped', update);
      undo.off('stack-cleared', update);
    };
  }, [undo]);

  const act = (fn: () => unknown) => () => {
    fn();
    onAfter();
  };

  return (
    <Panel position="bottom-left" className="export-hidden !m-3">
      <div role="toolbar" aria-label="Controles do fluxograma" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm">
        {canEdit && (
          <>
            <ControlButton label="Desfazer (Ctrl+Z)" disabled={!stack.canUndo} onClick={act(() => undo?.undo())}>
              <IconUndo />
            </ControlButton>
            <ControlButton label="Refazer (Ctrl+Shift+Z)" disabled={!stack.canRedo} onClick={act(() => undo?.redo())}>
              <IconRedo />
            </ControlButton>
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
          </>
        )}
        <ControlButton label="Afastar" onClick={act(() => zoomOut({ duration: 150 }))}>
          <IconZoomOut />
        </ControlButton>
        <ControlButton label="Aproximar" onClick={act(() => zoomIn({ duration: 150 }))}>
          <IconZoomIn />
        </ControlButton>
        <ControlButton label="Ajustar à tela" onClick={act(() => fitView({ ...FIT_VIEW_OPTIONS, duration: 250 }))}>
          <IconFit />
        </ControlButton>
        {canEdit && (
          <>
            <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
            <ControlButton
              label={snapToGrid ? 'Desligar o encaixe na grade (Alt segura solta)' : 'Ligar o encaixe na grade'}
              pressed={snapToGrid}
              onClick={onToggleGrid}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
            </ControlButton>
            <button
              type="button"
              onClick={onOrganize}
              disabled={organizing}
              title="Organizar automaticamente, de cima para baixo"
              className="ml-0.5 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              {organizing ? <Spinner /> : <IconOrganize />}
              Organizar
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}

function IconOrganize() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <rect x="9" y="2" width="6" height="5" rx="1" />
      <rect x="2" y="17" width="7" height="5" rx="1" />
      <rect x="15" y="17" width="7" height="5" rx="1" />
      <path d="M12 7v4M12 11H5.5v6M12 11h6.5v6" />
    </svg>
  );
}

function ControlButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${
        pressed ? 'bg-surface-2 text-ink' : 'text-muted'
      }`}
    >
      {children}
    </button>
  );
}
