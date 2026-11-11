import type { DocumentList, DocumentSummary } from '@diagram/shared';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '../features/auth/session';
import { api } from '../lib/api';
import { type Command, rankCommands } from './commands';
import { IconDocs, IconFlow, IconKey, IconMindMap, IconSearch, IconUsers } from './icons';
import { usePresence } from './usePresence';

// SPEC-009 §5.10 — paleta de comandos (Ctrl+K / ⌘K) em qualquer tela logada.
//
// Cada página registra os próprios comandos (`useCommands`), e quem mostra só
// o que o papel permite é quem registra (o menu em grade já filtra por papel —
// teste da SPEC-008). A autorização de verdade continua no servidor.
// Documentos vêm da busca que já existe (GET /documents?q=), filtrada por acesso.

type Source = () => Command[];

interface Registry {
  register: (key: string, source: Source) => () => void;
  open: () => void;
}

const RegistryContext = createContext<Registry | null>(null);

/** Registra comandos enquanto o componente estiver montado. `build` roda ao abrir. */
export function useCommands(key: string, build: () => Command[]) {
  const registry = useContext(RegistryContext);
  const ref = useRef(build);
  ref.current = build;
  useEffect(() => registry?.register(key, () => ref.current()), [registry, key]);
}

export function useOpenCommandPalette(): () => void {
  return useContext(RegistryContext)?.open ?? (() => {});
}

const MAX_DOCS = 8;

export function CommandProvider({ children }: { children: ReactNode }) {
  const sources = useRef(new Map<string, Source>());
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const registry = useMemo<Registry>(
    () => ({
      register: (key, source) => {
        sources.current.set(key, source);
        return () => {
          if (sources.current.get(key) === source) sources.current.delete(key);
        };
      },
      open: () => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
      },
    }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) setOpen(false);
        else registry.open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, registry]);

  const close = useCallback(() => {
    setOpen(false);
    // Esc devolve o foco para onde estava (SPEC-009 §5.10).
    const back = opener.current;
    requestAnimationFrame(() => {
      if (back?.isConnected && (document.activeElement === document.body || !document.activeElement)) {
        back.focus({ preventScroll: true });
      }
    });
  }, []);

  return (
    <RegistryContext.Provider value={registry}>
      {children}
      <Palette open={open} onClose={close} collect={() => [...sources.current.values()].flatMap((s) => s())} />
    </RegistryContext.Provider>
  );
}

function Palette({ open, onClose, collect }: { open: boolean; onClose: () => void; collect: () => Command[] }) {
  const { mounted, state, onTransitionEnd } = usePresence(open);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [commands, setCommands] = useState<Command[]>([]);
  const listId = useId();
  const navigate = useNavigate();
  const me = useMe().data;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mounted && !dialog.open) dialog.showModal();
    if (!mounted && dialog.open) dialog.close();
  }, [mounted]);

  // Ao abrir: comandos frescos (seleção atual, papel atual) e campo limpo.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setCommands(collect());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [open]);

  const global: Command[] = useMemo(
    () => [
      { id: 'go-docs', label: 'Ir para os documentos', group: 'Ir para', icon: IconDocs, run: () => navigate('/') },
      {
        id: 'go-password',
        label: 'Trocar minha senha',
        group: 'Ir para',
        icon: IconKey,
        run: () => navigate('/trocar-senha'),
      },
      // Só exibição: a página e a API de usuários exigem ADMIN no servidor.
      ...(me?.role === 'ADMIN'
        ? [{ id: 'go-users', label: 'Usuários', group: 'Ir para', icon: IconUsers, run: () => navigate('/admin/usuarios') }]
        : []),
    ],
    [navigate, me?.role],
  );

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);
  const searching = open && debounced.length >= 2;
  const mine = useQuery({
    queryKey: ['palette', 'mine', debounced],
    queryFn: () => api<DocumentList>(`/documents?${new URLSearchParams({ scope: 'mine', q: debounced })}`),
    enabled: searching,
    staleTime: 10_000,
  });
  const shared = useQuery({
    queryKey: ['palette', 'shared', debounced],
    queryFn: () => api<DocumentList>(`/documents?${new URLSearchParams({ scope: 'shared', q: debounced })}`),
    enabled: searching,
    staleTime: 10_000,
  });

  const docCommands: Command[] = useMemo(() => {
    if (!searching) return [];
    // O mesmo documento pode vir nas duas buscas (pasta compartilhada): um só.
    const byId = new Map<string, DocumentSummary>();
    for (const doc of [...(mine.data?.items ?? []), ...(shared.data?.items ?? [])]) if (!byId.has(doc.id)) byId.set(doc.id, doc);
    const docs = [...byId.values()].slice(0, MAX_DOCS);
    return docs.map((doc) => ({
      id: `doc:${doc.id}`,
      label: doc.title || 'Sem título',
      group: 'Documentos',
      keywords: doc.folder?.name,
      shortcut: doc.folder?.name,
      icon: doc.type === 'MINDMAP' ? IconMindMap : IconFlow,
      run: () => navigate(`/m/${doc.id}`, { viewTransition: true }),
    }));
  }, [searching, mine.data, shared.data, navigate]);

  const results = useMemo(() => {
    // Documentos já vêm filtrados (e ordenados) pelo servidor; entram depois das ações.
    return [...rankCommands([...commands, ...global], query), ...docCommands];
  }, [commands, global, query, docCommands]);

  useEffect(() => setActive(0), [query, docCommands.length]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    // Depois de fechar: o comando pode abrir um diálogo que quer o foco.
    requestAnimationFrame(() => command.run());
  };

  // Agrupa mantendo a ordem de relevância (a primeira ocorrência define o grupo).
  const groups: Array<{ title: string; items: Array<{ command: Command; index: number }> }> = [];
  results.forEach((command, index) => {
    let group = groups.find((g) => g.title === command.group);
    if (!group) groups.push((group = { title: command.group, items: [] }));
    group.items.push({ command, index });
  });

  return (
    <dialog
      ref={dialogRef}
      aria-label="Paleta de comandos"
      data-motion="pop"
      data-state={state}
      onTransitionEnd={onTransitionEnd}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // clique no fundo
      }}
      style={{ '--origin': 'top center' } as CSSProperties}
      className="mx-auto mt-[18vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-modal border border-line bg-surface p-0 text-ink shadow-modal"
    >
      {mounted && (
        <div className="flex max-h-[60vh] flex-col">
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <IconSearch size={18} />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              aria-label="Buscar ação ou documento"
              placeholder="Buscar ação ou documento…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(results.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  run(results[active]);
                }
              }}
              className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-2xs text-muted">Esc</kbd>
          </div>
          <div id={listId} role="listbox" aria-label="Resultados" className="overflow-y-auto p-1.5">
            {results.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">
                {searching && (mine.isFetching || shared.isFetching) ? 'Procurando…' : 'Nada encontrado.'}
              </p>
            )}
            {groups.map((group) => (
              <div key={group.title} role="group" aria-label={group.title} className="mb-1 last:mb-0">
                <p className="px-2.5 pt-2 pb-1 text-2xs font-semibold tracking-wider text-muted uppercase">{group.title}</p>
                {group.items.map(({ command, index }) => {
                  const Icon = command.icon;
                  return (
                    <div
                      key={command.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      onPointerMove={() => setActive(index)}
                      onClick={() => run(command)}
                      className={`flex cursor-pointer items-center gap-3 rounded-control px-2.5 py-2 text-sm ${
                        index === active ? 'bg-brand-soft text-ink' : 'text-ink'
                      }`}
                    >
                      <span className="flex w-5 shrink-0 justify-center text-muted">{Icon && <Icon size={17} />}</span>
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.shortcut && (
                        <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 font-sans text-2xs text-muted">
                          {command.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
