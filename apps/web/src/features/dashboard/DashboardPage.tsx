import {
  DOC_THEMES,
  type DocumentList,
  type DocumentSummary,
  type DocumentType,
  type FolderKind,
  type FolderNode,
  type FolderTree,
  type ThemeId,
} from '@diagram/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { navButtonClass, SidebarSection, useSidebarSlot } from '../../components/AppShell';
import {
  IconDocs,
  IconFlow,
  IconGridView,
  IconListView,
  IconMindMap,
  IconMore,
  IconSearch,
  IconShared,
  IconTrashDoc,
} from '../../components/icons';
import { Button, ErrorText, Field, Input, Modal, relativeTime, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import {
  FolderDialog,
  type FolderDialogState,
  FolderMembersDialog,
  FolderMenuDialog,
} from '../folders/FolderDialogs';
import { FolderBreadcrumb, findFolderPath, FolderSidebar, SEM_PASTA, useFolders } from '../folders/FolderSidebar';

type Scope = 'mine' | 'shared' | 'trash';

// SPEC-003 §5.1: o painel lista os dois tipos de documento.
// SPEC-008 §5.3: os escopos saíram das abas e viraram itens da lateral escura.
const TABS: Array<{ scope: Scope; label: string; icon: typeof IconDocs }> = [
  { scope: 'mine', label: 'Meus documentos', icon: IconDocs },
  { scope: 'shared', label: 'Compartilhados comigo', icon: IconShared },
  { scope: 'trash', label: 'Lixeira', icon: IconTrashDoc },
];

/** Modo de exibição da lista, lembrado no navegador (SPEC-008 §5.3). */
type View = 'grid' | 'list';
const VIEW_KEY = 'paglamp.view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid'; // navegador com storage bloqueado não quebra o painel
  }
}

function writeView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // sem storage: a escolha vale só nesta aba
  }
}

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
  const [view, setView] = useState<View>(readView);
  const slot = useSidebarSlot();

  // Pastas (SPEC-004 §5.1). A pasta aberta fica na URL, para o link valer.
  const folderId = params.get('pasta');
  const folders = useFolders();
  const path = findFolderPath(folders.data, folderId === SEM_PASTA ? null : folderId);
  const currentFolder = path.at(-1) ?? null;
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const [folderMenu, setFolderMenu] = useState<FolderNode | null>(null);
  const [folderMembers, setFolderMembers] = useState<FolderNode | null>(null);
  const [movingDoc, setMovingDoc] = useState<DocumentSummary | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['documents', scope, q, typeFilter.value, folderId],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ scope });
      if (q) sp.set('q', q);
      if (typeFilter.value) sp.set('type', typeFilter.value);
      if (folderId) sp.set('folder', folderId);
      if (pageParam) sp.set('cursor', pageParam);
      return api<DocumentList>(`/documents?${sp}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['folders'] });
  };
  const action = useMutation({
    mutationFn: ({ path, method }: { path: string; method: 'POST' | 'DELETE' }) =>
      api(path, { method, ...(method === 'POST' ? { json: {} } : {}) }),
    onSuccess: invalidate,
  });

  /** Move um documento para uma pasta (ou para fora, com `null`). */
  const move = useMutation({
    mutationFn: ({ documentId, folder }: { documentId: string; folder: FolderNode | null; kind?: FolderKind }) => {
      const kind = folder?.kind ?? 'PERSONAL';
      const route = kind === 'SHARED' ? 'shared-folder' : 'personal-folder';
      return api(`/documents/${documentId}/${route}`, { method: 'PUT', json: { folderId: folder?.id ?? null } });
    },
    onSuccess: invalidate,
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  const sidebar = (
    <>
      <nav aria-label="Seções" className="flex flex-col gap-0.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t.scope}
            type="button"
            aria-current={scope === t.scope}
            onClick={() => setParam('aba', t.scope === 'mine' ? null : t.scope)}
            className={navButtonClass(scope === t.scope)}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </nav>
      <SidebarSection title="Pastas">
        <FolderSidebar
          tree={folders.data}
          loading={folders.isPending}
          selectedId={folderId}
          onSelect={(id) => setParam('pasta', id)}
          onCreate={(kind, parentId) => setFolderDialog({ mode: 'create', kind, parentId })}
          onManage={setFolderMenu}
          onDropDocument={(documentId, folder) => move.mutate({ documentId, folder })}
        />
      </SidebarSection>
    </>
  );

  const currentTab = TABS.find((t) => t.scope === scope) ?? TABS[0]!;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      {/* A navegação do painel mora na lateral escura do shell (SPEC-008 §5.3). */}
      {slot && createPortal(sidebar, slot)}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {scope === 'mine' ? 'Documentos' : currentTab.label}
        </h1>
        <NewMenu onPick={setCreating} />
      </div>

      {currentFolder && (
        <FolderBreadcrumb
          path={path}
          onSelect={(id) => setParam('pasta', id)}
          onNewFolder={() =>
            setFolderDialog({ mode: 'create', kind: currentFolder.kind, parentId: currentFolder.id })
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={typeFilter === t}
              onClick={() => setParam('tipo', t.param)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                typeFilter === t
                  ? 'border-transparent bg-brand text-on-brand'
                  : 'border-line bg-surface text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto">
          <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            placeholder="Buscar por título ou texto"
            aria-label="Buscar documentos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9"
          />
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
          {([
            ['grid', 'Ver em cartões', IconGridView],
            ['list', 'Ver em lista', IconListView],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                writeView(value);
              }}
              className={`rounded-md p-1.5 transition ${
                view === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </div>

      <ErrorText error={list.error ?? action.error} />

      {list.isPending ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState scope={scope} searching={!!q || !!typeFilter.value} onCreate={() => setCreating('MINDMAP')} />
      ) : (
        <ul
          className={
            view === 'grid'
              ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
              : 'flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface'
          }
        >
          {items.map((doc) => (
            <DocumentItem
              key={doc.id}
              doc={doc}
              view={view}
              scope={scope}
              searching={!!q}
              onRename={() => setRenaming(doc)}
              onMove={() => setMovingDoc(doc)}
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

      <CreateDialog
        type={creating}
        folder={currentFolder}
        onClose={() => setCreating(null)}
        onCreated={invalidate}
      />
      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} onDone={invalidate} />
      <FolderDialog state={folderDialog} onClose={() => setFolderDialog(null)} />
      <FolderMenuDialog
        folder={folderMenu}
        onClose={() => setFolderMenu(null)}
        onRename={() => {
          setFolderDialog({ mode: 'rename', kind: folderMenu!.kind, parentId: folderMenu!.parentId, folder: folderMenu! });
          setFolderMenu(null);
        }}
        onMembers={() => {
          setFolderMembers(folderMenu);
          setFolderMenu(null);
        }}
        onDeleted={() => {
          if (folderId === folderMenu?.id) setParam('pasta', null);
        }}
      />
      <FolderMembersDialog folder={folderMembers} onClose={() => setFolderMembers(null)} />
      <MoveDialog
        doc={movingDoc}
        tree={folders.data}
        onClose={() => setMovingDoc(null)}
        onMove={(folder) => {
          move.mutate({ documentId: movingDoc!.id, folder });
          setMovingDoc(null);
        }}
      />
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

/** Capa do cartão: cores do tema do documento (SPEC-008 §5.3) — lista fechada. */
export function coverStyle(theme: ThemeId | null | undefined) {
  const doc = (theme && DOC_THEMES[theme]) || DOC_THEMES.paglamp;
  const from = doc.rootColor;
  const to = doc.branches[0] ?? doc.rootColor;
  return { background: `linear-gradient(135deg, ${from}, ${to})` };
}

function DocumentItem({
  doc,
  view,
  scope,
  searching,
  onRename,
  onMove,
  onAction,
  onOpen,
}: {
  doc: DocumentSummary;
  view: View;
  scope: Scope;
  /** Na busca, mostra em que pasta o resultado está (SPEC-004 §5.1). */
  searching: boolean;
  onRename: () => void;
  onMove: () => void;
  onAction: (path: string, method: 'POST' | 'DELETE') => void;
  onOpen: () => void;
}) {
  const canEdit = doc.myRole === 'OWNER' || doc.myRole === 'EDITOR';
  const inTrash = scope === 'trash';
  const Icon = doc.type === 'MINDMAP' ? IconMindMap : IconFlow;

  const actions: Array<{ label: string; run: () => void; danger?: boolean }> = inTrash
    ? [
        { label: 'Restaurar', run: () => onAction(`/documents/${doc.id}/restore`, 'POST') },
        {
          label: 'Apagar de vez',
          danger: true,
          run: () => {
            if (window.confirm(`Apagar "${doc.title}" de vez? Não dá para desfazer.`)) {
              onAction(`/documents/${doc.id}`, 'DELETE');
            }
          },
        },
      ]
    : [
        { label: 'Abrir', run: onOpen },
        ...(canEdit ? [{ label: 'Renomear', run: onRename }] : []),
        { label: 'Mover para…', run: onMove },
        { label: 'Duplicar', run: () => onAction(`/documents/${doc.id}/duplicate`, 'POST') },
        ...(doc.myRole === 'OWNER'
          ? [
              {
                label: 'Mover para a lixeira',
                danger: true,
                run: () => onAction(`/documents/${doc.id}/trash`, 'POST'),
              },
            ]
          : []),
      ];

  const meta = inTrash
    ? `Na lixeira desde ${relativeTime(doc.trashedAt ?? doc.updatedAt)}`
    : `${scope === 'shared' ? `${doc.owner.name} · ${ROLE_LABEL[doc.myRole]} · ` : ''}editado ${relativeTime(doc.updatedAt)}`;

  const dragProps = {
    draggable: !inTrash,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/x-paglamp-document', doc.id);
      e.dataTransfer.effectAllowed = 'move';
    },
  };

  if (view === 'list') {
    return (
      <li {...dragProps} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
          style={coverStyle(doc.theme)}
          aria-hidden
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          {inTrash ? (
            <span className="block truncate font-medium">{doc.title}</span>
          ) : (
            <Link to={`/m/${doc.id}`} className="block truncate font-medium hover:underline">
              {doc.title}
            </Link>
          )}
          <span className="block truncate text-xs text-muted">
            {meta}
            {searching && doc.folder ? ` · em ${doc.folder.name}` : ''}
          </span>
        </span>
        <span className="hidden shrink-0 text-xs text-muted sm:block">{TYPE_LABEL[doc.type]}</span>
        <CardMenu title={doc.title} actions={actions} />
      </li>
    );
  }

  return (
    <li
      {...dragProps}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:border-brand/40 hover:shadow-md"
    >
      <div className="relative flex h-24 items-center justify-center text-white/90" style={coverStyle(doc.theme)}>
        <Icon size={34} />
        <span className="absolute top-2 left-2 rounded-md bg-black/25 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
          {TYPE_LABEL[doc.type]}
        </span>
      </div>
      <div className="flex flex-1 items-start gap-2 p-3.5">
        <span className="min-w-0 flex-1">
          {inTrash ? (
            <span className="block truncate font-medium">{doc.title}</span>
          ) : (
            <Link to={`/m/${doc.id}`} className="block truncate font-medium hover:underline">
              {doc.title}
            </Link>
          )}
          <span className="mt-1 block truncate text-xs text-muted">{meta}</span>
          {searching && doc.folder && <span className="block truncate text-xs text-muted">em {doc.folder.name}</span>}
        </span>
        <CardMenu title={doc.title} actions={actions} />
      </div>
    </li>
  );
}

/** Menu "⋯" do documento: as mesmas ações de antes, agora sem poluir o cartão. */
function CardMenu({ title, actions }: { title: string; actions: Array<{ label: string; run: () => void; danger?: boolean }> }) {
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

  return (
    <div ref={ref} className="relative shrink-0" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <button
        type="button"
        aria-label={`Ações de ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
      >
        <IconMore size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 flex w-48 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                a.run();
              }}
              className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 ${a.danger ? 'text-danger' : ''}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
        + Criar
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
  const Icon = type === 'MINDMAP' ? IconMindMap : IconFlow;
  return (
    <span role="img" aria-label={TYPE_LABEL[type]} className={`shrink-0 text-muted ${className}`}>
      <Icon size={18} />
    </span>
  );
}

function CreateDialog({
  type,
  folder,
  onClose,
  onCreated,
}: {
  type: DocumentType | null;
  /** Pasta aberta: o documento novo já nasce nela (PRD-004 §5.6). */
  folder: FolderNode | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    if (type) setTitle('');
  }, [type]);
  const create = useMutation({
    mutationFn: async () => {
      const doc = await api<DocumentSummary>('/documents', { method: 'POST', json: { title: title.trim(), type } });
      if (folder) {
        const route = folder.kind === 'SHARED' ? 'shared-folder' : 'personal-folder';
        // Se guardar na pasta falhar, o documento já existe: ele fica em "sem pasta".
        await api(`/documents/${doc.id}/${route}`, { method: 'PUT', json: { folderId: folder.id } }).catch(() => {});
      }
      return doc;
    },
    onSuccess: (doc) => {
      onCreated();
      navigate(`/m/${doc.id}`);
    },
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

/** "Mover para…" (SPEC-004 §5.1). Compartilhadas só aparecem para o dono do documento. */
function MoveDialog({
  doc,
  tree,
  onClose,
  onMove,
}: {
  doc: DocumentSummary | null;
  tree: FolderTree | undefined;
  onClose: () => void;
  onMove: (folder: FolderNode | null) => void;
}) {
  const isOwner = doc?.myRole === 'OWNER';
  const flatten = (nodes: FolderNode[], depth = 0): Array<{ node: FolderNode; depth: number }> =>
    nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);

  const personal = flatten(tree?.personal ?? []);
  const shared = flatten(tree?.shared ?? []).filter(
    ({ node }) => node.myRole === 'OWNER' || node.myRole === 'EDITOR',
  );

  return (
    <Modal open={!!doc} onClose={onClose} title={`Mover "${doc?.title ?? ''}"`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Minhas pastas</p>
          <Button onClick={() => onMove(null)}>Sem pasta</Button>
          {personal.map(({ node, depth }) => (
            <Button key={node.id} className="justify-start" onClick={() => onMove(node)}>
              <span style={{ paddingLeft: depth * 12 }}>{node.name}</span>
            </Button>
          ))}
          {personal.length === 0 && <p className="text-sm text-muted">Você ainda não criou pastas.</p>}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Pastas compartilhadas</p>
          {isOwner ? (
            shared.length > 0 ? (
              shared.map(({ node, depth }) => (
                <Button key={node.id} className="justify-start" onClick={() => onMove(node)}>
                  <span style={{ paddingLeft: depth * 12 }}>{node.name}</span>
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted">Você não participa de nenhuma pasta compartilhada como editor.</p>
            )
          ) : (
            <p className="text-sm text-muted">
              Só o dono do documento pode colocá-lo numa pasta compartilhada.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  );
}
