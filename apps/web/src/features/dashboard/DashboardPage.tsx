import type { DocumentList, DocumentSummary } from '@diagram/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, ErrorText, Field, Input, Modal, relativeTime, Spinner } from '../../components/ui';
import { api } from '../../lib/api';

type Scope = 'mine' | 'shared' | 'trash';

const TABS: Array<{ scope: Scope; label: string }> = [
  { scope: 'mine', label: 'Meus mapas' },
  { scope: 'shared', label: 'Compartilhados comigo' },
  { scope: 'trash', label: 'Lixeira' },
];

const ROLE_LABEL: Record<DocumentSummary['myRole'], string> = {
  OWNER: 'Dono',
  EDITOR: 'Editor',
  COMMENTER: 'Comentador',
  VIEWER: 'Leitor',
};

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const scope = (TABS.find((t) => t.scope === params.get('aba'))?.scope ?? 'mine') as Scope;
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ['documents', scope, q],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ scope });
      if (q) sp.set('q', q);
      if (pageParam) sp.set('cursor', pageParam);
      return api<DocumentList>(`/documents?${sp}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['documents'] });
  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method: 'POST' | 'DELETE' }) =>
      api(path, { method, ...(method === 'POST' ? { json: {} } : {}) }),
    onSuccess: invalidate,
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Mapas</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Novo mapa
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div role="tablist" className="-mb-px flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.scope}
              role="tab"
              type="button"
              aria-selected={scope === t.scope}
              onClick={() => setParams(t.scope === 'mine' ? {} : { aba: t.scope })}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                scope === t.scope ? 'border-filament text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          type="search"
          placeholder="Buscar por título ou texto dos nós"
          aria-label="Buscar mapas"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 max-w-72"
        />
      </div>

      <ErrorText error={list.error ?? action.error} />

      {list.isPending ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState scope={scope} searching={!!q} onCreate={() => setCreating(true)} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              scope={scope}
              onRename={() => setRenaming(doc)}
              onAction={(path, method) => action.mutate({ path, method })}
              onOpen={() => navigate(`/m/${doc.id}`)}
            />
          ))}
        </ul>
      )}

      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button onClick={() => list.fetchNextPage()} busy={list.isFetchingNextPage}>
            Carregar mais
          </Button>
        </div>
      )}

      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onDone={invalidate} />
    </div>
  );
}

function EmptyState({ scope, searching, onCreate }: { scope: Scope; searching: boolean; onCreate: () => void }) {
  const text = searching
    ? 'Nenhum mapa encontrado com essa busca.'
    : scope === 'mine'
      ? 'Você ainda não criou nenhum mapa.'
      : scope === 'shared'
        ? 'Quando alguém compartilhar um mapa com você, ele aparece aqui.'
        : 'A lixeira está vazia. Mapas apagados ficam aqui por 30 dias.';
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="text-sm text-muted">{text}</p>
      {scope === 'mine' && !searching && (
        <Button variant="primary" onClick={onCreate}>
          Criar o primeiro mapa
        </Button>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  scope,
  onRename,
  onAction,
  onOpen,
}: {
  doc: DocumentSummary;
  scope: Scope;
  onRename: () => void;
  onAction: (path: string, method: 'POST' | 'DELETE') => void;
  onOpen: () => void;
}) {
  const canEdit = doc.myRole === 'OWNER' || doc.myRole === 'EDITOR';
  const inTrash = scope === 'trash';

  return (
    <li className="group flex flex-col rounded-xl border border-line bg-surface transition hover:border-muted/40 hover:shadow-sm">
      {inTrash ? (
        <div className="flex-1 p-4">
          <p className="font-medium">{doc.title}</p>
          <p className="mt-1 text-xs text-muted">Na lixeira desde {relativeTime(doc.trashedAt ?? doc.updatedAt)}</p>
        </div>
      ) : (
        <Link to={`/m/${doc.id}`} className="flex-1 rounded-t-xl p-4">
          <p className="font-medium group-hover:underline">{doc.title}</p>
          <p className="mt-1 text-xs text-muted">
            {scope === 'shared' ? `${doc.owner.name} · ${ROLE_LABEL[doc.myRole]} · ` : ''}
            editado {relativeTime(doc.updatedAt)}
          </p>
        </Link>
      )}
      <div className="flex flex-wrap gap-1 border-t border-line px-2 py-1.5 text-xs">
        {inTrash ? (
          <>
            <CardAction onClick={() => onAction(`/documents/${doc.id}/restore`, 'POST')}>Restaurar</CardAction>
            <CardAction
              danger
              onClick={() => {
                if (window.confirm(`Apagar "${doc.title}" de vez? Não dá para desfazer.`)) {
                  onAction(`/documents/${doc.id}`, 'DELETE');
                }
              }}
            >
              Apagar de vez
            </CardAction>
          </>
        ) : (
          <>
            <CardAction onClick={onOpen}>Abrir</CardAction>
            {canEdit && <CardAction onClick={onRename}>Renomear</CardAction>}
            <CardAction onClick={() => onAction(`/documents/${doc.id}/duplicate`, 'POST')}>Duplicar</CardAction>
            {doc.myRole === 'OWNER' && (
              <CardAction danger onClick={() => onAction(`/documents/${doc.id}/trash`, 'POST')}>
                Mover para a lixeira
              </CardAction>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function CardAction({ children, onClick, danger }: { children: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 font-medium hover:bg-surface-2 ${danger ? 'text-danger' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => api<DocumentSummary>('/documents', { method: 'POST', json: { title: title.trim(), type: 'MINDMAP' } }),
    onSuccess: (doc) => navigate(`/m/${doc.id}`),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title="Novo mapa mental">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Título" hint="Vira o tópico central do mapa. Dá para mudar depois.">
          {(id) => <Input id={id} autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" busy={create.isPending} disabled={!title.trim()}>
            Criar mapa
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ doc, onClose, onDone }: { doc: DocumentSummary | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  useEffect(() => setTitle(doc?.title ?? ''), [doc]);
  const rename = useMutation({
    mutationFn: () => api(`/documents/${doc!.id}`, { method: 'PATCH', json: { title: title.trim() } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal open={!!doc} onClose={onClose} title="Renomear mapa">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) rename.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Título">
          {(id) => <Input id={id} autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <ErrorText error={rename.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" busy={rename.isPending} disabled={!title.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
