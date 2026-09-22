import type { DocumentSummary } from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useReactFlow } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Button, colorFor } from '../../components/ui';
import { api } from '../../lib/api';
import { useMe } from '../auth/session';
import { exportCanvasPng } from './exportPng';
import { IconTheme } from './icons';
import { ShareDialog } from './ShareDialog';
import type { CollabState, SaveStatus } from './useCollab';

// Barra superior comum aos dois editores (SPEC-003 §5.1): título, status,
// presença, exportar e compartilhar.

export function EditorHeader({
  meta,
  state,
  provider,
  appearanceOpen,
  onToggleAppearance,
  historyOpen,
  onToggleHistory,
}: {
  meta: DocumentSummary;
  state: CollabState;
  provider: HocuspocusProvider;
  /** Painel de aparência (SPEC-007 §5.3): tema, fonte e fundo do documento. */
  appearanceOpen: boolean;
  onToggleAppearance: () => void;
  /** Painel de histórico (SPEC-005 §5.1), quando o editor o oferece. */
  historyOpen?: boolean;
  onToggleHistory?: () => void;
}) {
  const me = useMe().data;
  const canEdit = !state.readOnly;
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (me) provider.setAwarenessField('user', { id: me.id, name: me.name, color: colorFor(me.id) });
  }, [provider, me]);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link
          to="/"
          className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Voltar para os documentos"
        >
          ← Documentos
        </Link>
        <TitleField meta={meta} canEdit={canEdit} />
        <StatusPill status={state.status} readOnly={state.readOnly} />
        <div className="ml-auto flex items-center gap-2">
          <Presence provider={provider} />
          {onToggleHistory && (
            <Button aria-pressed={historyOpen} onClick={onToggleHistory}>
              Histórico
            </Button>
          )}
          <Button aria-pressed={appearanceOpen} onClick={onToggleAppearance} title="Tema, fonte e fundo do documento">
            <IconTheme />
            Aparência
          </Button>
          <ExportButton title={meta.title} />
          <Button variant="primary" onClick={() => setSharing(true)}>
            Compartilhar
          </Button>
        </div>
      </header>
      {me && (
        <ShareDialog documentId={meta.id} myRole={meta.myRole} myId={me.id} open={sharing} onClose={() => setSharing(false)} />
      )}
    </>
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
      aria-label="Título do documento"
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
          await exportCanvasPng(getNodes(), title);
        } finally {
          setBusy(false);
        }
      }}
    >
      Exportar PNG
    </Button>
  );
}

