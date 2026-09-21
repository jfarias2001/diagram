import { type DocumentSummary, findRoot, type NodeRecord, updateNode } from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import type * as Y from 'yjs';
import { Avatar, Button, colorFor, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../auth/session';
import { exportMindMapPng } from './exportPng';
import { BRANCH_COLORS, MindMapCanvas } from './MindMapCanvas';
import { ShareDialog } from './ShareDialog';
import { type CollabState, type SaveStatus, useCollab } from './useCollab';
import { LOCAL_ORIGIN, useMindMapNodes, useUndoManager } from './useMindMap';

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

  if (!meta.data || !session || !state.synced) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted">
        <Spinner />
        {state.status === 'offline' ? 'Sem conexão com o servidor. Tentando de novo…' : 'Abrindo mapa…'}
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <Editor doc={session.doc} provider={session.provider} meta={meta.data} state={state} />
    </ReactFlowProvider>
  );
}

function NoAccess() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-xl font-semibold">Mapa não encontrado</p>
      <p className="max-w-sm text-sm text-muted">
        Ele pode ter sido apagado, ou você não tem acesso. Peça ao dono do mapa para compartilhá-lo com você.
      </p>
      <Link to="/" className="text-sm font-medium underline">
        Voltar para os mapas
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
  const me = useMe().data;
  const canEdit = !state.readOnly;
  const nodes = useMindMapNodes(doc, canEdit);
  const undo = useUndoManager(doc);
  const [selectedId, setSelectedId] = useState<string | null>(() => findRoot(nodes)?.id ?? null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (me) provider.setAwarenessField('user', { id: me.id, name: me.name, color: colorFor(me.id) });
  }, [provider, me]);

  const selected = selectedId ? nodes[selectedId] : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link to="/" className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-ink" aria-label="Voltar para os mapas">
          ← Mapas
        </Link>
        <TitleField meta={meta} canEdit={canEdit} />
        <StatusPill status={state.status} readOnly={state.readOnly} />
        <div className="ml-auto flex items-center gap-2">
          <Presence provider={provider} />
          <ExportButton title={meta.title} />
          <Button variant="primary" onClick={() => setSharing(true)}>
            Compartilhar
          </Button>
        </div>
      </header>

      <div className="relative flex-1">
        <MindMapCanvas
          doc={doc}
          nodes={nodes}
          provider={provider}
          canEdit={canEdit}
          undo={undo}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {canEdit && selected && <StylePanel doc={doc} nodes={nodes} nodeId={selected.id} />}
        <ShortcutHint canEdit={canEdit} />
      </div>

      {me && (
        <ShareDialog documentId={meta.id} myRole={meta.myRole} myId={me.id} open={sharing} onClose={() => setSharing(false)} />
      )}
    </div>
  );
}

function TitleField({ meta, canEdit }: { meta: DocumentSummary; canEdit: boolean }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(meta.title);
  useEffect(() => setTitle(meta.title), [meta.title]);
  const save = useMutation({
    mutationFn: (value: string) => api<DocumentSummary>(`/documents/${meta.id}`, { method: 'PATCH', json: { title: value } }),
    onSuccess: (doc) => {
      qc.setQueryData(['document', meta.id], doc);
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => setTitle(meta.title),
  });

  if (!canEdit) return <h1 className="truncate font-display text-base font-semibold">{meta.title}</h1>;
  return (
    <input
      aria-label="Título do mapa"
      value={title}
      maxLength={200}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => {
        const value = title.trim();
        if (value && value !== meta.title) save.mutate(value);
        else setTitle(meta.title);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setTitle(meta.title);
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 max-w-md flex-1 truncate rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-base font-semibold hover:border-line focus:border-filament focus:outline-none"
    />
  );
}

const STATUS: Record<SaveStatus, { label: string; dot: string }> = {
  connecting: { label: 'Conectando…', dot: 'bg-muted' },
  saving: { label: 'Salvando…', dot: 'bg-filament' },
  saved: { label: 'Salvo', dot: 'bg-ok' },
  offline: { label: 'Offline — as alterações serão enviadas ao reconectar', dot: 'bg-danger' },
};

function StatusPill({ status, readOnly }: { status: SaveStatus; readOnly: boolean }) {
  const s = STATUS[status];
  return (
    <span className="hidden items-center gap-2 text-xs text-muted md:flex" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {readOnly ? 'Somente leitura' : s.label}
    </span>
  );
}

function Presence({ provider }: { provider: HocuspocusProvider }) {
  const [people, setPeople] = useState<Array<{ key: number; name: string; color: string }>>([]);
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => {
      const seen = new Set<string>();
      const list: Array<{ key: number; name: string; color: string }> = [];
      awareness.getStates().forEach((state, clientId) => {
        const user = state.user as { id?: string; name?: string; color?: string } | undefined;
        if (clientId === awareness.clientID || !user?.name || seen.has(user.id ?? user.name)) return;
        seen.add(user.id ?? user.name);
        list.push({ key: clientId, name: user.name, color: user.color ?? colorFor(user.name) });
      });
      setPeople(list);
    };
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [provider]);

  if (people.length === 0) return null;
  return (
    <div className="flex -space-x-2" aria-label={`Também no mapa: ${people.map((p) => p.name).join(', ')}`}>
      {people.slice(0, 5).map((p) => (
        <Avatar key={p.key} name={p.name} color={p.color} />
      ))}
      {people.length > 5 && <Avatar name={`+${people.length - 5}`} color="#667085" />}
    </div>
  );
}

function ExportButton({ title }: { title: string }) {
  const { getNodes } = useReactFlow();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await exportMindMapPng(getNodes(), title);
        } finally {
          setBusy(false);
        }
      }}
    >
      Exportar PNG
    </Button>
  );
}

function StylePanel({ doc, nodes, nodeId }: { doc: Y.Doc; nodes: NodeRecord; nodeId: string }) {
  const node = nodes[nodeId];
  if (!node) return null;
  return (
    <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-sm">
      {BRANCH_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cor ${color}`}
          aria-pressed={node.color === color}
          onClick={() => updateNode(doc, nodeId, { color }, LOCAL_ORIGIN)}
          className={`h-5 w-5 rounded-full transition ${node.color === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'}`}
          style={{ background: color }}
        />
      ))}
      <button
        type="button"
        onClick={() => updateNode(doc, nodeId, { color: '' }, LOCAL_ORIGIN)}
        className="rounded-md px-1.5 text-xs text-muted hover:bg-surface-2 hover:text-ink"
        title="Voltar à cor do ramo"
      >
        Auto
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button
        type="button"
        aria-pressed={!!node.bold}
        onClick={() => updateNode(doc, nodeId, { bold: !node.bold }, LOCAL_ORIGIN)}
        className={`h-7 w-7 rounded-md text-sm font-bold ${node.bold ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2'}`}
        title="Negrito (Ctrl+B)"
      >
        B
      </button>
    </div>
  );
}

function ShortcutHint({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const rows: Array<[string, string]> = canEdit
    ? [
        ['Tab', 'novo filho'],
        ['Enter', 'novo irmão'],
        ['F2 ou digitar', 'editar texto'],
        ['Delete', 'apagar ramo'],
        ['Espaço', 'recolher/abrir'],
        ['Setas', 'navegar'],
        ['Ctrl+Z / Ctrl+Y', 'desfazer/refazer'],
        ['Ctrl+B', 'negrito'],
        ['Arrastar', 'mover nó'],
      ]
    : [['Setas', 'navegar']];
  return (
    <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2">
      {open && (
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-xl border border-line bg-surface p-3 text-xs shadow-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-sm hover:text-ink"
      >
        {open ? 'Fechar atalhos' : 'Atalhos'}
      </button>
    </div>
  );
}
