import { type MindMapNode, NODE_SHAPES, type NodeShape, normalizeLink } from '@diagram/shared';
import { NodeToolbar, Position } from '@xyflow/react';
import { type ReactNode, useState } from 'react';
import {
  IconArrowDown,
  IconArrowUp,
  IconChild,
  IconCollapse,
  IconExpand,
  IconExternal,
  IconLink,
  IconNote,
  IconShape,
  IconSibling,
  IconTidy,
  IconTrash,
} from './icons';

// Barra flutuante do nó selecionado (SPEC-002 §5.1). Uma só para o mapa inteiro.

export const BRANCH_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5c7cfa'];

/** Preenchimentos do bloco (SPEC-006 §5.4): claros para quadro claro, escuros para quadro escuro. */
export const FILL_COLORS = [
  '#ffffff',
  '#fff3bf',
  '#ffe3e3',
  '#d3f9d8',
  '#d0ebff',
  '#f3d9fa',
  '#495057',
  '#1b2230',
];

const SHAPE_LABEL: Record<NodeShape, string> = {
  rounded: 'Arredondado',
  capsule: 'Cápsula',
  rect: 'Retângulo',
  ellipse: 'Elipse',
  hexagon: 'Hexágono',
  underline: 'Sublinhado',
};

export interface NodeActions {
  createChild: (id: string) => void;
  createSibling: (id: string) => void;
  removeNode: (id: string) => void;
  toggleCollapse: (id: string) => void;
  toggleBold: (id: string) => void;
  setColor: (id: string, color: string) => void;
  /** Preenchimento do bloco; `''` volta ao fundo do quadro (SPEC-006 §5.4). */
  setFill: (id: string, fill: string) => void;
  setShape: (id: string, shape: NodeShape | '') => void;
  /** Troca a ordem com o irmão de cima/de baixo (SPEC-006 §5.2). */
  reorder: (id: string, direction: 'up' | 'down') => void;
  /** Volta o ramo ao layout automático (SPEC-006 §5.3). */
  tidy: (id: string) => void;
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
  /** Quantos irmãos há (com o próprio): com 1, não há o que reordenar. */
  siblingCount: number;
  /** Algum bloco do ramo foi movido à mão — só então "Organizar este ramo" faz algo. */
  branchMoved: boolean;
  actions: NodeActions;
}

type Popover = 'color' | 'link' | 'shape' | null;

export function NodeActionBar({ node, canEdit, hasChildren, siblingCount, branchMoved, actions }: Props) {
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
              <BarButton label="Cores" pressed={popover === 'color'} onClick={() => toggle('color')}>
                <span
                  className="h-4 w-4 rounded-full border border-line"
                  style={{
                    background:
                      node.fill ?? node.color ?? 'conic-gradient(#e8590c, #1c7ed6, #2f9e44, #ae3ec9, #e8590c)',
                    borderColor: node.color,
                  }}
                />
              </BarButton>
              <BarButton label="Formato do bloco" pressed={popover === 'shape'} onClick={() => toggle('shape')}>
                <IconShape />
              </BarButton>
              <BarButton label="Negrito" shortcut="Ctrl+B" pressed={!!node.bold} onClick={run(actions.toggleBold)}>
                <span className="w-4 text-sm font-bold">B</span>
              </BarButton>
            </>
          )}
          {canEdit && !isRoot && siblingCount > 1 && (
            <>
              <BarButton label="Mover para cima" shortcut="Ctrl+↑" onClick={() => actions.reorder(node.id, 'up')}>
                <IconArrowUp />
              </BarButton>
              <BarButton label="Mover para baixo" shortcut="Ctrl+↓" onClick={() => actions.reorder(node.id, 'down')}>
                <IconArrowDown />
              </BarButton>
            </>
          )}
          {canEdit && branchMoved && (
            <BarButton label="Organizar este ramo" onClick={run(actions.tidy)}>
              <IconTidy />
            </BarButton>
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
            node={node}
            onPickOutline={(color) => actions.setColor(node.id, color)}
            onPickFill={(fill) => actions.setFill(node.id, fill)}
          />
        )}
        {popover === 'shape' && canEdit && (
          <ShapePicker
            current={node.shape ?? 'rounded'}
            onPick={(shape) => {
              actions.setShape(node.id, shape);
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

/** Contorno (cor do ramo) e preenchimento do bloco, no mesmo popover (SPEC-006 §5.4). */
function ColorPicker({
  node,
  onPickOutline,
  onPickFill,
}: {
  node: MindMapNode;
  onPickOutline: (color: string) => void;
  onPickFill: (fill: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2 shadow-md">
      <Swatches
        label="Contorno"
        colors={BRANCH_COLORS}
        current={node.color}
        autoTitle="Voltar à cor do ramo"
        onPick={onPickOutline}
      />
      <Swatches
        label="Preenchimento"
        colors={FILL_COLORS}
        current={node.fill}
        autoTitle="Voltar ao fundo do quadro"
        onPick={onPickFill}
      />
    </div>
  );
}

function Swatches({
  label,
  colors,
  current,
  autoTitle,
  onPick,
}: {
  label: string;
  colors: string[];
  current: string | undefined;
  autoTitle: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <span className="w-24 text-xs text-muted">{label}</span>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`${label} ${color}`}
          aria-pressed={current === color}
          onClick={() => onPick(color)}
          className={`h-5 w-5 rounded-full border border-line transition ${current === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'hover:scale-110'}`}
          style={{ background: color }}
        />
      ))}
      <button
        type="button"
        onClick={() => onPick('')}
        className="rounded-md px-1.5 text-xs text-muted hover:bg-surface-2 hover:text-ink"
        title={autoTitle}
      >
        Auto
      </button>
    </div>
  );
}

/** Miniatura de cada formato (SPEC-006 §5.4). */
function ShapePicker({ current, onPick }: { current: NodeShape; onPick: (shape: NodeShape) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-md" role="group" aria-label="Formato do bloco">
      {NODE_SHAPES.map((shape) => (
        <button
          key={shape}
          type="button"
          title={SHAPE_LABEL[shape]}
          aria-label={SHAPE_LABEL[shape]}
          aria-pressed={current === shape}
          onClick={() => onPick(shape)}
          className={`flex h-9 w-11 items-center justify-center rounded-lg transition ${
            current === shape ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
          }`}
        >
          <ShapeThumb shape={shape} />
        </button>
      ))}
    </div>
  );
}

function ShapeThumb({ shape }: { shape: NodeShape }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  return (
    <svg width={28} height={18} viewBox="0 0 40 24" aria-hidden>
      {shape === 'rounded' && <rect x="2" y="3" width="36" height="18" rx="6" {...common} />}
      {shape === 'rect' && <rect x="2" y="3" width="36" height="18" rx="1" {...common} />}
      {shape === 'capsule' && <rect x="2" y="3" width="36" height="18" rx="9" {...common} />}
      {shape === 'ellipse' && <ellipse cx="20" cy="12" rx="18" ry="9" {...common} />}
      {shape === 'hexagon' && <polygon points="9,3 31,3 38,12 31,21 9,21 2,12" {...common} />}
      {shape === 'underline' && <path d="M4 18h32" {...common} />}
    </svg>
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
