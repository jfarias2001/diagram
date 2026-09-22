import { type DocumentSummary, type VersionSummary } from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useState } from 'react';
import * as Y from 'yjs';
import { ErrorText, Spinner } from '../../components/ui';
import { useBoardTheme } from '../editor/boardTheme';
import { EditorHeader } from '../editor/EditorHeader';
import { ShortcutHint } from '../editor/ShortcutHint';
import type { CollabState } from '../editor/useCollab';
import { useCheckpoint } from '../history/checkpoint';
import { HistoryPanel } from '../history/HistoryPanel';
import { useVersionPreview } from '../history/useVersionPreview';
import { VersionBanner } from '../history/VersionBanner';
import { DiagramCanvas } from './DiagramCanvas';
import { useDiagram, useDiagramUndo } from './useDiagram';

/** Documento vazio enquanto a versão não chega (SPEC-005 §5.2). */
const EMPTY_DOC = new Y.Doc();

const SHORTCUTS: Array<[string, string]> = [
  ['Arrastar da paleta', 'nova forma'],
  ['Arrastar da borda', 'ligar com seta'],
  ['Duplo clique', 'editar texto'],
  ['Delete', 'apagar seleção'],
  ['Setas (Shift = mais)', 'mover seleção'],
  ['Arrastar no fundo', 'selecionar várias'],
  ['Espaço + arrastar', 'mover o quadro'],
  ['Roda do mouse', 'zoom'],
  ['Alt (segurando)', 'soltar da grade'],
  ['Ctrl+C / V / D', 'copiar, colar, duplicar'],
  ['Ctrl+Z / Ctrl+Y', 'desfazer/refazer'],
];

const READ_ONLY_SHORTCUTS: Array<[string, string]> = [
  ['Espaço + arrastar', 'mover o quadro'],
  ['Roda do mouse', 'zoom'],
];

export default function DiagramEditor({
  doc,
  provider,
  meta,
  state,
}: {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  meta: DocumentSummary;
  state: CollabState;
}) {
  const canEdit = !state.readOnly;
  const diagram = useDiagram(doc, canEdit);
  const undo = useDiagramUndo(doc);
  const board = useBoardTheme();

  // Modo versão (SPEC-005 §5.2).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<VersionSummary | null>(null);
  const { preview, error: previewError } = useVersionPreview(meta.id, viewing);
  const previewDiagram = useDiagram(preview?.doc ?? EMPTY_DOC, false);
  const checkpoint = useCheckpoint(meta.id, canEdit);
  const inPreview = !!viewing;

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        meta={meta}
        state={state}
        provider={provider}
        board={board}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((open) => !open)}
      />
      {viewing && (
        <VersionBanner
          documentId={meta.id}
          version={viewing}
          canRestore={canEdit}
          canSave={state.status === 'saved'}
          onBack={() => setViewing(null)}
        />
      )}
      <ErrorText error={previewError} />
      {/* O tema vale só daqui para dentro (SPEC-006 §5.5). */}
      <div className="relative flex-1" data-board={board.theme}>
        {inPreview ? (
          preview ? (
            <DiagramCanvas
              key={preview.version.id}
              doc={preview.doc}
              diagram={previewDiagram}
              provider={null}
              canEdit={false}
              undo={null}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Spinner />
            </div>
          )
        ) : (
          <DiagramCanvas
            doc={doc}
            diagram={diagram}
            provider={provider}
            canEdit={canEdit}
            undo={undo}
            onCheckpoint={checkpoint}
          />
        )}
        <ShortcutHint rows={canEdit && !inPreview ? SHORTCUTS : READ_ONLY_SHORTCUTS} />
        {historyOpen && (
          <HistoryPanel
            documentId={meta.id}
            canEdit={canEdit}
            viewingId={viewing?.id ?? null}
            onView={setViewing}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
