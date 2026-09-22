import { type DocumentSummary, findRoot, type VersionSummary } from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useQuery } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import * as Y from 'yjs';
import { ErrorText, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useCheckpoint } from '../history/checkpoint';
import { HistoryPanel } from '../history/HistoryPanel';
import { useVersionPreview } from '../history/useVersionPreview';
import { VersionBanner } from '../history/VersionBanner';
import { AppearancePanel } from './AppearancePanel';
import { useBoardTheme } from './boardTheme';
import { EditorHeader } from './EditorHeader';
import { MindMapCanvas } from './MindMapCanvas';
import { NotePanel } from './NotePanel';
import { ShortcutHint } from './ShortcutHint';
import { type CollabState, useCollab } from './useCollab';
import { useMindMapNodes, useUndoManager } from './useMindMap';

// O editor de fluxograma é um chunk à parte (SPEC-003 §5.1).
const DiagramEditor = lazy(() => import('../diagram/DiagramEditor'));

export default function EditorPage() {
  const { id = '' } = useParams();
  const meta = useQuery({
    queryKey: ['document', id],
    queryFn: () => api<DocumentSummary>(`/documents/${id}`),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });
  const { session, state } = useCollab(id);

  if (meta.error instanceof ApiError && meta.error.status === 401) return <Navigate to={`/login?next=/m/${id}`} replace />;
  if (meta.error || state.failed === 'not-found') return <NoAccess />;
  if (state.failed === 'unauthenticated') return <Navigate to={`/login?next=/m/${id}`} replace />;
  if (state.failed === 'password-change-required') return <Navigate to="/trocar-senha" replace />;

  const loading = (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner />
      {state.status === 'offline' ? 'Sem conexão com o servidor. Tentando de novo…' : 'Abrindo documento…'}
    </div>
  );
  if (!meta.data || !session || !state.synced) return loading;

  return (
    <ReactFlowProvider>
      {meta.data.type === 'DIAGRAM' ? (
        <Suspense fallback={loading}>
          <DiagramEditor doc={session.doc} provider={session.provider} meta={meta.data} state={state} />
        </Suspense>
      ) : (
        <Editor doc={session.doc} provider={session.provider} meta={meta.data} state={state} />
      )}
    </ReactFlowProvider>
  );
}

function NoAccess() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-xl font-semibold">Documento não encontrado</p>
      <p className="max-w-sm text-sm text-muted">
        Ele pode ter sido apagado, ou você não tem acesso. Peça ao dono do documento para compartilhá-lo com você.
      </p>
      <Link to="/" className="text-sm font-medium underline">
        Voltar para os documentos
      </Link>
    </div>
  );
}

function Editor({
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
  const nodes = useMindMapNodes(doc, canEdit);
  const undo = useUndoManager(doc);
  const [selectedId, setSelectedId] = useState<string | null>(() => findRoot(nodes)?.id ?? null);
  const [noteOpen, setNoteOpen] = useState(false);
  const openNote = useCallback(() => setNoteOpen(true), []);
  const noteNodeId = useRef<string | null>(null);

  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const board = useBoardTheme(doc, canEdit);
  const selected = selectedId ? nodes[selectedId] : undefined;

  // Modo versão (SPEC-005 §5.2): o quadro passa a vir de um Y.Doc local.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<VersionSummary | null>(null);
  const { preview, error: previewError } = useVersionPreview(meta.id, viewing);
  const previewNodes = useMindMapNodes(preview?.doc ?? EMPTY_DOC, false);
  // A versão guarda o próprio tema: olhar uma versão antiga mostra como ela era.
  const previewBoard = useBoardTheme(preview?.doc ?? EMPTY_DOC, false);
  const checkpoint = useCheckpoint(meta.id, canEdit);

  // Tópico apagado (por alguém) com a nota aberta: fecha o painel (SPEC-002 §5.5).
  useEffect(() => {
    if (noteOpen && noteNodeId.current && !nodes[noteNodeId.current]) setNoteOpen(false);
    noteNodeId.current = noteOpen ? (selectedId ?? noteNodeId.current) : null;
  }, [nodes, noteOpen, selectedId]);

  const inPreview = !!viewing;

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        meta={meta}
        state={state}
        provider={provider}
        appearanceOpen={appearanceOpen}
        onToggleAppearance={() => setAppearanceOpen((open) => !open)}
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

      {/* O tema do documento vale só daqui para dentro (SPEC-007 §5.4). */}
      <div
        className="relative flex-1"
        data-board={(inPreview ? previewBoard : board).theme.mode}
        style={(inPreview ? previewBoard : board).vars}
      >
        {inPreview ? (
          preview ? (
            // Chave por versão: o canvas recomeça limpo a cada versão aberta.
            <MindMapCanvas
              key={preview.version.id}
              doc={preview.doc}
              nodes={previewNodes}
              provider={null}
              canEdit={false}
              undo={null}
              selectedId={null}
              onSelect={NOOP}
              onOpenNote={NOOP}
              board={previewBoard}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">
              <Spinner />
            </div>
          )
        ) : (
          <MindMapCanvas
            doc={doc}
            nodes={nodes}
            provider={provider}
            canEdit={canEdit}
            undo={undo}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpenNote={openNote}
            onCheckpoint={checkpoint}
            board={board}
          />
        )}
        <ShortcutHint rows={canEdit && !inPreview ? MIND_SHORTCUTS : [['Setas', 'navegar']]} />
        {noteOpen && !inPreview && (
          <NotePanel doc={doc} node={selected} canEdit={canEdit} onClose={() => setNoteOpen(false)} />
        )}
        {appearanceOpen && !inPreview && (
          <AppearancePanel doc={doc} board={board} canEdit={canEdit} onClose={() => setAppearanceOpen(false)} />
        )}
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

/** Documento vazio para o hook de preview funcionar antes de a versão chegar. */
const EMPTY_DOC = new Y.Doc();
const NOOP = () => {};

const MIND_SHORTCUTS: Array<[string, string]> = [
  ['Tab', 'novo filho'],
  ['Enter', 'novo irmão'],
  ['F2, digitar ou duplo clique', 'editar texto'],
  ['Delete', 'apagar ramo'],
  ['Espaço', 'recolher/abrir'],
  ['Setas', 'navegar'],
  ['Ctrl+Z / Ctrl+Y', 'desfazer/refazer'],
  ['Ctrl+B', 'negrito'],
  ['Arrastar', 'move só este bloco (Shift leva o ramo)'],
  ['Soltar sobre outro bloco', 'trocar de pai'],
  ['Ctrl+X, depois clicar', 'cortar a ligação e religar'],
  ['Ctrl+↑ / Ctrl+↓', 'mover entre irmãos'],
];
