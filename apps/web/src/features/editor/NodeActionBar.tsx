import { type MindMapNode, normalizeLink } from '@diagram/shared';
import { NodeToolbar, Position } from '@xyflow/react';
import { type ReactNode, useState } from 'react';
import {
  IconChild,
  IconCollapse,
  IconExpand,
  IconExternal,
  IconLink,
  IconNote,
  IconSibling,
  IconTrash,
} from './icons';

// Barra flutuante do nó selecionado (SPEC-002 §5.1). Uma só para o mapa inteiro.

export const BRANCH_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5c7cfa'];

export interface NodeActions {
  createChild: (id: string) => void;
  createSibling: (id: string) => void;
  removeNode: (id: string) => void;
  toggleCollapse: (id: string) => void;
  toggleBold: (id: string) => void;
  setColor: (id: string, color: string) => void;
  /** Retorna false se o link foi recusado. */
  setLink: (id: string, link: string) => boolean;
  openNote: (id: string) => void;
  /** Devolve o foco ao mapa, para os atalhos continuarem valendo. */
  focusCanvas: () => void;
}

interface Props {
  node: MindMapNode;
  canEdit: boolean;
  hasChildren: boolean;
  actions: NodeActions;
}

type Popover = 'color' | 'link' | null;

export function NodeActionBar({ node, canEdit, hasChildren, actions }: Props) {
  const [popover, setPopover] = useState<Popover>(null);
  const isRoot = node.parentId === null;
  const toggle = (p: Exclude<Popover, null>) => setPopover((cur) => (cur === p ? null : p));
  const run = (fn: (id: string) => void) => () => {
    fn(node.id);
    actions.focusCanvas();
  };

  // Leitor sem nota e sem link: nada a mostrar.
  if (!canEdit && !node.note && !node.link) return null;

  return (
    <NodeToolbar nodeId={node.id} isVisible position={Position.Top} offset={12}>
      <div
        className="export-hidden flex flex-col items-center gap-1.5"
        onKeyDown={(e) => {
          // Atalhos do mapa não disparam de dentro da barra (CLAUDE.md §7).
          e.stopPropagation();
          if (e.key === 'Escape') {
            setPopover(null);
            actions.focusCanvas();
          }
        }}
      >
        <div
          role="toolbar"
          aria-label="Ações do tópico"
          className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-md"
        >
          {canEdit && (
            <>
              <BarButton label="Adicionar filho" shortcut="Tab" onClick={() => actions.createChild(node.id)}>
                <IconChild />
                <span className="text-xs font-medium">Filho</span>
              </BarButton>
              {!isRoot && (
                <BarButton label="Adicionar irmão" shortcut="Enter" onClick={() => actions.createSibling(node.id)}>
                  <IconSibling />
                  <span className="text-xs font-medium">Irmão</span>
                </BarButton>
              )}
              <Divider />
              <BarButton label="Cor" pressed={popover === 'color'} onClick={() => toggle('color')}>
                <span className="h-4 w-4 rounded-full border border-line" style={{ background: node.color ?? 'conic-gradient(#e8590c, #1c7ed6, #2f9e44, #ae3ec9, #e8590c)' }} />
              </BarButton>
              <BarButton label="Negrito" shortcut="Ctrl+B" pressed={!!node.bold} onClick={run(actions.toggleBold)}>
                <span className="w-4 text-sm font-bold">B</span>
              </BarButton>
            </>
          )}
          {(canEdit || node.note) && (
            <BarButton label={node.note ? 'Ver nota' : 'Adicionar nota'} pressed={false} onClick={() => actions.openNote(node.id)}>
              <IconNote />
            </BarButton>
          )}
          {canEdit ? (
            <BarButton label={node.link ? 'Editar link' : 'Adicionar link'} pressed={popover === 'link'} onClick={() => toggle('link')}>
              <IconLink />
            </BarButton>
          ) : (
            node.link && (
              <a
                href={node.link}
                target="_blank"
                rel="noopener noreferrer"
                title={node.link}
                aria-label={`Abrir link: ${node.link}`}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-ink"
              >
                <IconExternal />
                <span className="text-xs font-medium">Abrir link</span>
              </a>
            )
          )}
          {canEdit && hasChildren && (
            <BarButton
              label={node.collapsed ? 'Expandir ramo' : 'Recolher ramo'}
              shortcut="Espaço"
              onClick={run(actions.toggleCollapse)}
            >
              {node.collapsed ? <IconExpand /> : <IconCollapse />}
            </BarButton>
          )}
          {canEdit && !isRoot && (
            <>
              <Divider />
              <BarButton label="Apagar tópico e seus filhos" shortcut="Delete" danger onClick={() => actions.removeNode(node.id)}>
                <IconTrash />
              </BarButton>
            </>
          )}
        </div>

        {popover === 'color' && canEdit && (
          <ColorPicker
            current={node.color}
            onPick={(color) => {
              actions.setColor(node.id, color);
              setPopover(null);
              actions.focusCanvas();
            }}
          />
        )}
        {popover === 'link' && canEdit && (
          <LinkEditor
            key={node.id}
            current={node.link ?? ''}
            onSave={(link) => actions.setLink(node.id, link)}
            onClose={() => {
              setPopover(null);
              actions.focusCanvas();
            }}
          />
        )}
      </div>
    </NodeToolbar>
  );
}

function BarButton({
  label,
  shortcut,
  pressed,
  danger,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={[
        'flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 transition',
        pressed ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
        danger ? 'hover:!text-danger' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;
}

function ColorPicker({ current, onPick }: { current: string | undefined; onPick: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5 shadow-md" role="group" aria-label="Cores">
      {BRANCH_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cor ${color}`}
          aria-pressed={current === color}
          onClick={() => onPick(color)}
          className={`h-5 w-5 rounded-full transition ${current === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'}`}
          style={{ background: color }}
        />
      ))}
      <button
        type="button"
        onClick={() => onPick('')}
        className="rounded-md px-1.5 text-xs text-muted hover:bg-surface-2 hover:text-ink"
        title="Voltar à cor do ramo"
      >
        Auto
      </button>
    </div>
  );
}

/** Editor de link (SPEC-002 §5.6). A validação de verdade é normalizeLink. */
function LinkEditor({
  current,
  onSave,
  onClose,
}: {
  current: string;
  onSave: (link: string) => boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const link = normalizeLink(value);
    if (!link || !onSave(link)) {
      setError('Link inválido. Use um endereço da web (https://…) ou de e-mail (mailto:…).');
      return;
    }
    onClose();
  };

  return (
    <form
      className="flex w-80 flex-col gap-2 rounded-xl border border-line bg-surface p-2 shadow-md"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        autoFocus
        aria-label="Endereço do link"
        placeholder="https://… ou mailto:…"
        value={value}
        maxLength={2048}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        aria-invalid={!!error}
        className="nodrag h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink placeholder:text-muted focus:border-filament focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button type="submit" className="h-8 rounded-lg bg-ink px-3 text-xs font-medium text-canvas hover:opacity-90">
          Salvar
        </button>
        {current && (
          <>
            <a
              href={current}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-ink"
            >
              <IconExternal size={13} /> Abrir
            </a>
            <button
              type="button"
              onClick={() => {
                onSave('');
                onClose();
              }}
              className="h-8 rounded-lg px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-danger"
            >
              Remover
            </button>
          </>
        )}
        <button type="button" onClick={onClose} className="ml-auto h-8 rounded-lg px-2.5 text-xs text-muted hover:bg-surface-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}
