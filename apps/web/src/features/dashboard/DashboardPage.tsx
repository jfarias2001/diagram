import type { DocumentList, DocumentSummary, DocumentType } from '@diagram/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, ErrorText, Field, Input, Modal, relativeTime, Spinner } from '../../components/ui';
import { api } from '../../lib/api';

type Scope = 'mine' | 'shared' | 'trash';

// SPEC-003 §5.1: o painel lista os dois tipos de documento.
const TABS: Array<{ scope: Scope; label: string }> = [
  { scope: 'mine', label: 'Meus documentos' },
  { scope: 'shared', label: 'Compartilhados comigo' },
  { scope: 'trash', label: 'Lixeira' },
];

const TYPE_FILTERS: Array<{ value: DocumentType | null; param: string | null; label: string }> = [
  { value: null, param: null, label: 'Todos' },
  { value: 'MINDMAP', param: 'mapas', label: 'Mapas mentais' },
  { value: 'DIAGRAM', param: 'fluxogramas', label: 'Fluxogramas' },
];

export const TYPE_LABEL: Record<DocumentType, string> = { MINDMAP: 'Mapa mental', DIAGRAM: 'Fluxograma' };

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
  const typeFilter = TYPE_FILTERS.find((t) => t.param === params.get('tipo')) ?? TYPE_FILTERS[0]!;
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);
  const [creating, setCreating] = useState<DocumentType | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['documents', scope, q, typeFilter.value],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ scope });
      if (q) sp.set('q', q);
      if (typeFilter.value) sp.set('type', typeFilter.value);
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
        <h1 className="font-display text-2xl font-semibold tracking-tight">Documentos</h1>
        <NewMenu onPick={setCreating} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div role="tablist" className="-mb-px flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.scope}
              role="tab"
              type="button"
              aria-selected={scope === t.scope}
              onClick={() => setParam('aba', t.scope === 'mine' ? null : t.scope)}
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
          placeholder="Buscar por título ou texto"
          aria-label="Buscar documentos"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 max-w-72"
        />
      </div>

      <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-pressed={typeFilter === t}
            onClick={() => setParam('tipo', t.param)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              typeFilter === t ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ErrorText error={list.error ?? action.error} />

      {list.isPending ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState scope={scope} searching={!!q || !!typeFilter.value} onCreate={() => setCreating('MINDMAP')} />
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

      <CreateDialog type={creating} onClose={() => setCreating(null)} />
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onDone={invalidate} />
    </div>
  );
}

function EmptyState({ scope, searching, onCreate }: { scope: Scope; searching: boolean; onCreate: () => void }) {
  const text = searching
    ? 'Nenhum documento encontrado com essa busca.'
    : scope === 'mine'
      ? 'Você ainda não criou nenhum documento.'
      : scope === 'shared'
        ? 'Quando alguém compartilhar um documento com você, ele aparece aqui.'
        : 'A lixeira está vazia. Documentos apagados ficam aqui por 30 dias.';
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <p className="text-sm text-muted">{text}</p>
      {scope === 'mine' && !searching && (
        <Button variant="primary" onClick={onCreate}>
          Criar o primeiro mapa mental
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
          <p className="flex items-center gap-2 font-medium">
            <TypeIcon type={doc.type} />
            {doc.title}
          </p>
          <p className="mt-1 text-xs text-muted">Na lixeira desde {relativeTime(doc.trashedAt ?? doc.updatedAt)}</p>
        </div>
      ) : (
        <Link to={`/m/${doc.id}`} className="flex-1 rounded-t-xl p-4">
          <p className="flex items-center gap-2 font-medium">
            <TypeIcon type={doc.type} />
            <span className="group-hover:underline">{doc.title}</span>
          </p>
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

function NewMenu({ onPick }: { onPick: (type: DocumentType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const pick = (type: DocumentType) => {
    setOpen(false);
    onPick(type);
  };
  return (
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <Button variant="primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + Novo
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-2 flex w-60 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
          {(['MINDMAP', 'DIAGRAM'] as const).map((type) => (
            <button
              key={type}
              role="menuitem"
              type="button"
              autoFocus={type === 'MINDMAP'}
              onClick={() => pick(type)}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
            >
              <TypeIcon type={type} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{TYPE_LABEL[type]}</span>
                <span className="block text-xs text-muted">
                  {type === 'MINDMAP' ? 'Ideias em árvore, a partir de um tópico central' : 'Processos com formas, decisões e setas'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TypeIcon({ type, className = '' }: { type: DocumentType; className?: string }) {
  return (
    <svg
      role="img"
      aria-label={TYPE_LABEL[type]}
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-muted ${className}`}
    >
      {type === 'MINDMAP' ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="5" r="2" />
          <circle cx="20" cy="5" r="2" />
          <circle cx="4" cy="19" r="2" />
          <circle cx="20" cy="19" r="2" />
          <path d="M9.5 10.5 5.6 6.4M14.5 10.5l3.9-4.1M9.5 13.5l-3.9 4.1M14.5 13.5l3.9 4.1" />
        </>
      ) : (
        <>
          <rect x="7" y="2" width="10" height="5" rx="1.5" />
          <path d="M12 7v3M12 10l4 3.5-4 3.5-4-3.5z" />
          <path d="M12 17v2" />
          <rect x="7" y="19" width="10" height="3" rx="1" />
        </>
      )}
    </svg>
  );
}

function CreateDialog({ type, onClose }: { type: DocumentType | null; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    if (type) setTitle('');
  }, [type]);
  const create = useMutation({
    mutationFn: () => api<DocumentSummary>('/documents', { method: 'POST', json: { title: title.trim(), type } }),
    onSuccess: (doc) => navigate(`/m/${doc.id}`),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate();
  };
  const isDiagram = type === 'DIAGRAM';
  return (
    <Modal open={!!type} onClose={onClose} title={isDiagram ? 'Novo fluxograma' : 'Novo mapa mental'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Título"
          hint={isDiagram ? 'O nome do fluxograma. Dá para mudar depois.' : 'Vira o tópico central do mapa. Dá para mudar depois.'}
        >
          {(id) => <Input id={id} autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" busy={create.isPending} disabled={!title.trim()}>
            {isDiagram ? 'Criar fluxograma' : 'Criar mapa'}
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
    <Modal open={!!doc} onClose={onClose} title="Renomear documento">
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
