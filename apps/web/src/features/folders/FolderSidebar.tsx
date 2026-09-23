import type { FolderKind, FolderNode, FolderTree } from '@diagram/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconFolderPlus,
  IconMore,
} from '../../components/icons';
import { Button, Spinner } from '../../components/ui';
import { api } from '../../lib/api';

// Lateral de pastas do painel (SPEC-004 §5.1), agora desenhada dentro da
// lateral escura do shell (SPEC-008 §5.3) — daí os tokens `nav-*`.

export const SEM_PASTA = 'none';

export function useFolders() {
  return useQuery({ queryKey: ['folders'], queryFn: () => api<FolderTree>('/folders') });
}

/** Acha uma pasta na árvore, com o caminho até ela (para o "Comercial › 2026"). */
export function findFolderPath(tree: FolderTree | undefined, id: string | null): FolderNode[] {
  if (!tree || !id) return [];
  const walk = (nodes: FolderNode[], path: FolderNode[]): FolderNode[] => {
    for (const node of nodes) {
      const next = [...path, node];
      if (node.id === id) return next;
      const found = walk(node.children, next);
      if (found.length > 0) return found;
    }
    return [];
  };
  return walk([...tree.personal, ...tree.shared], []);
}

export function FolderSidebar({
  tree,
  loading,
  selectedId,
  onSelect,
  onCreate,
  onManage,
  onDropDocument,
}: {
  tree: FolderTree | undefined;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: FolderKind, parentId: string | null) => void;
  onManage: (folder: FolderNode) => void;
  /** Cartão de documento solto em cima de uma pasta. */
  onDropDocument: (documentId: string, folder: FolderNode) => void;
}) {
  return (
    <nav aria-label="Pastas" className="flex flex-col gap-1 text-sm">
      <SidebarItem label="Todas as pastas" active={selectedId === null} onClick={() => onSelect(null)} />
      <SidebarItem label="Sem pasta" active={selectedId === SEM_PASTA} onClick={() => onSelect(SEM_PASTA)} />

      {loading ? (
        <div className="flex justify-center py-4 text-nav-muted">
          <Spinner />
        </div>
      ) : (
        <>
          <Section
            title="Minhas pastas"
            nodes={tree?.personal ?? []}
            kind="PERSONAL"
            selectedId={selectedId}
            onSelect={onSelect}
            onCreate={onCreate}
            onManage={onManage}
            onDropDocument={onDropDocument}
          />
          <Section
            title="Pastas compartilhadas"
            nodes={tree?.shared ?? []}
            kind="SHARED"
            selectedId={selectedId}
            onSelect={onSelect}
            onCreate={onCreate}
            onManage={onManage}
            onDropDocument={onDropDocument}
          />
        </>
      )}
    </nav>
  );
}

function Section({
  title,
  nodes,
  kind,
  selectedId,
  onSelect,
  onCreate,
  onManage,
  onDropDocument,
}: {
  title: string;
  nodes: FolderNode[];
  kind: FolderKind;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: FolderKind, parentId: string | null) => void;
  onManage: (folder: FolderNode) => void;
  onDropDocument: (documentId: string, folder: FolderNode) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 px-3 pb-1">
        <h2 className="text-[11px] font-semibold tracking-wider text-nav-muted uppercase">{title}</h2>
        <button
          type="button"
          onClick={() => onCreate(kind, null)}
          aria-label={`Criar pasta em ${title}`}
          title={`Criar pasta em ${title}`}
          className="rounded-md p-1 text-nav-muted hover:bg-white/10 hover:text-nav-ink"
        >
          <IconFolderPlus size={15} />
        </button>
      </div>
      {nodes.length === 0 ? (
        <p className="px-3 py-1 text-xs text-nav-muted">
          {kind === 'PERSONAL' ? 'Nenhuma pasta sua ainda.' : 'Nenhuma pasta compartilhada com você.'}
        </p>
      ) : (
        <ul>
          {nodes.map((node) => (
            <FolderRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
              onManage={onManage}
              onDropDocument={onDropDocument}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FolderRow({
  node,
  depth,
  selectedId,
  onSelect,
  onCreate,
  onManage,
  onDropDocument,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: FolderKind, parentId: string | null) => void;
  onManage: (folder: FolderNode) => void;
  onDropDocument: (documentId: string, folder: FolderNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const documentId = e.dataTransfer.getData('text/x-paglamp-document');
          if (documentId) onDropDocument(documentId, node);
        }}
        className={`group flex items-center gap-1 rounded-lg pr-1 ${over ? 'ring-2 ring-brand' : ''}`}
        style={{ paddingLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Recolher ${node.name}` : `Expandir ${node.name}`}
            aria-expanded={open}
            className="flex w-4 shrink-0 justify-center text-nav-muted hover:text-nav-ink"
          >
            {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-current={selectedId === node.id}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
            selectedId === node.id
              ? 'bg-white/12 font-medium text-nav-ink'
              : 'text-nav-muted hover:bg-white/8 hover:text-nav-ink'
          }`}
        >
          <IconFolder size={15} className="shrink-0" />
          <span className="truncate">{node.name}</span>
          {node.documentCount > 0 && (
            <span className="ml-auto shrink-0 text-xs text-nav-muted">{node.documentCount}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onManage(node)}
          aria-label={`Opções da pasta ${node.name}`}
          title="Opções da pasta"
          className="shrink-0 rounded-md p-1 text-nav-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-nav-ink focus:opacity-100"
        >
          <IconMore size={15} />
        </button>
      </div>
      {open && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
              onManage={onManage}
              onDropDocument={onDropDocument}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SidebarItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition ${
        active ? 'bg-white/12 font-medium text-nav-ink' : 'text-nav-muted hover:bg-white/8 hover:text-nav-ink'
      }`}
    >
      {label}
    </button>
  );
}

/** Caminho da pasta aberta, com atalho de volta (SPEC-004 §5.1). */
export function FolderBreadcrumb({
  path,
  onSelect,
  onNewFolder,
}: {
  path: FolderNode[];
  onSelect: (id: string | null) => void;
  onNewFolder: () => void;
}) {
  const current = path.at(-1);
  if (!current) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button type="button" onClick={() => onSelect(null)} className="text-muted hover:text-ink hover:underline">
        Todos os documentos
      </button>
      {path.map((node, i) => (
        <span key={node.id} className="flex items-center gap-2">
          <span aria-hidden className="text-muted">
            ›
          </span>
          {i === path.length - 1 ? (
            <span className="font-medium">{node.name}</span>
          ) : (
            <button type="button" onClick={() => onSelect(node.id)} className="text-muted hover:text-ink hover:underline">
              {node.name}
            </button>
          )}
        </span>
      ))}
      {current.depth + 1 < 3 && (current.kind === 'PERSONAL' || current.myRole === 'OWNER' || current.myRole === 'EDITOR') && (
        <Button className="ml-2 !h-7 !px-2 text-xs" onClick={onNewFolder}>
          + Subpasta
        </Button>
      )}
    </div>
  );
}
