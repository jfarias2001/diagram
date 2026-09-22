import { type DocumentSummary, findRoot } from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useQuery } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type * as Y from 'yjs';
import { Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
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

  const selected = selectedId ? nodes[selectedId] : undefined;

  // Tópico apagado (por alguém) com a nota aberta: fecha o painel (SPEC-002 §5.5).
  useEffect(() => {
    if (noteOpen && noteNodeId.current && !nodes[noteNodeId.current]) setNoteOpen(false);
    noteNodeId.current = noteOpen ? (selectedId ?? noteNodeId.current) : null;
  }, [nodes, noteOpen, selectedId]);

  return (
    <div className="flex h-full flex-col">
      <EditorHeader meta={meta} state={state} provider={provider} />

      <div className="relative flex-1">
        <MindMapCanvas
          doc={doc}
          nodes={nodes}
          provider={provider}
          canEdit={canEdit}
          undo={undo}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onOpenNote={openNote}
        />
        <ShortcutHint rows={canEdit ? MIND_SHORTCUTS : [['Setas', 'navegar']]} />
        {noteOpen && <NotePanel doc={doc} node={selected} canEdit={canEdit} onClose={() => setNoteOpen(false)} />}
      </div>
    </div>
  );
}

const MIND_SHORTCUTS: Array<[string, string]> = [
  ['Tab', 'novo filho'],
  ['Enter', 'novo irmão'],
  ['F2, digitar ou duplo clique', 'editar texto'],
  ['Delete', 'apagar ramo'],
  ['Espaço', 'recolher/abrir'],
  ['Setas', 'navegar'],
  ['Ctrl+Z / Ctrl+Y', 'desfazer/refazer'],
  ['Ctrl+B', 'negrito'],
  ['Arrastar', 'mover nó'],
];
