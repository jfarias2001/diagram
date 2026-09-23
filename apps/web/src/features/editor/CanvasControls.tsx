import { Panel, useReactFlow } from '@xyflow/react';
import { type ReactNode, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { IconFit, IconRedo, IconTidy, IconUndo, IconZoomIn, IconZoomOut } from '../../components/icons';

// Controles do canto inferior esquerdo (SPEC-002 §5.7). Substituem o <Controls>.

export const FIT_VIEW_OPTIONS = { padding: 0.25, maxZoom: 1.2 };

/** Estado das pilhas do desfazer, atualizado pelos eventos do UndoManager. */
function useUndoState(undo: Y.UndoManager | null) {
  const [state, setState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    if (!undo) return;
    const update = () => setState({ canUndo: undo.canUndo(), canRedo: undo.canRedo() });
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
  return state;
}

export function CanvasControls({
  undo,
  canEdit,
  onAfter,
  onTidy,
  canTidy,
}: {
  undo: Y.UndoManager | null;
  canEdit: boolean;
  /** Chamado depois de cada ação (devolve o foco ao mapa). */
  onAfter: () => void;
  /** Volta o mapa inteiro ao layout automático (SPEC-006 §5.3). */
  onTidy?: () => void;
  /** Só há o que organizar se algum bloco foi movido à mão. */
  canTidy?: boolean;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { canUndo, canRedo } = useUndoState(undo);
  const act = (fn: () => unknown) => () => {
    fn();
    onAfter();
  };

  return (
    <Panel position="bottom-left" className="export-hidden !m-3">
      <div role="toolbar" aria-label="Controles do mapa" className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm">
        {canEdit && (
          <>
            <ControlButton label="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={act(() => undo?.undo())}>
              <IconUndo />
            </ControlButton>
            <ControlButton label="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={act(() => undo?.redo())}>
              <IconRedo />
            </ControlButton>
            {onTidy && (
              <ControlButton label="Organizar automaticamente" disabled={!canTidy} onClick={act(onTidy)}>
                <IconTidy />
              </ControlButton>
            )}
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
      </div>
    </Panel>
  );
}

function ControlButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
