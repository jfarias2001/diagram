import { type MindMapNode, NODE_SHAPES, type NodeShape, normalizeLink, readableInk } from '@diagram/shared';
import { NodeToolbar, Position, useStore } from '@xyflow/react';
import { type ReactNode, useState } from 'react';
import { ColorPicker } from '../../components/ColorPicker';
import {
  IconArrowDown,
  IconArrowUp,
  IconBranch,
  IconChild,
  IconCollapse,
  IconExpand,
  IconExternal,
  IconInk,
  IconLink,
  IconNote,
  IconScissors,
  IconShape,
  IconSibling,
  IconTidy,
  IconTrash,
} from './icons';

// Barra flutuante do nó selecionado (SPEC-002 §5.1). Uma só para o mapa inteiro.

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
  /** Preenchimento do bloco; `''` volta ao fundo do tema (SPEC-007 §5.6). */
  setFill: (id: string, fill: string) => void;
  /** Cor do texto; `''` volta à cor sugerida (SPEC-007 §5.6). */
  setInk: (id: string, ink: string) => void;
  setShape: (id: string, shape: NodeShape | '') => void;
  /** Troca a ordem com o irmão de cima/de baixo (SPEC-006 §5.2). */
  reorder: (id: string, direction: 'up' | 'down') => void;
  /** Volta o ramo ao layout automático (SPEC-006 §5.3). */
  tidy: (id: string) => void;
  /** Retorna false se o link foi recusado. */
  setLink: (id: string, link: string) => boolean;
  openNote: (id: string) => void;
  /** Corta a ligação com o pai e entra no modo religar (SPEC-007 §5.2). */
  cutEdge: (id: string) => void;
  /** Liga/desliga "arrastar leva o ramo junto" (SPEC-007 §5.1). */
  toggleBranchDrag: () => void;
  branchDrag: boolean;
  /** Devolve o foco ao mapa, para os atalhos continuarem valendo. */
  focusCanvas: () => void;
}

interface Props {
  node: MindMapNode;
  canEdit: boolean;
  /** Cores do tema do documento, oferecidas no seletor. */
  palette: readonly string[];
  /** Formato padrão do tema, quando o bloco não escolheu um. */
  defaultShape: NodeShape;
  hasChildren: boolean;
  /** Quantos irmãos há (com o próprio): com 1, não há o que reordenar. */
  siblingCount: number;
  /** Algum bloco do ramo foi movido à mão — só então "Organizar este ramo" faz algo. */
  branchMoved: boolean;
  actions: NodeActions;
}

type Popover = 'color' | 'link' | 'shape' | null;

export function NodeActionBar({
  node,
  canEdit,
  palette,
  defaultShape,
  hasChildren,
  siblingCount,
  branchMoved,
  actions,
}: Props) {
  const [popover, setPopover] = useState<Popover>(null);
  const isRoot = node.parentId === null;
  // Sem espaço acima do bloco, a barra desce: senão ela (e o seletor aberto)
  // ficariam escondidos atrás do cabeçalho do editor.
  const needed = popover ? 340 : 110;
  const place = useStore((state) => {
    const item = state.nodeLookup.get(node.id);
    if (!item) return Position.Top;
    const top = item.internals.positionAbsolute.y * state.transform[2] + state.transform[1];
    return top < needed ? Position.Bottom : Position.Top;
  });
  // O seletor abre sempre do lado oposto ao bloco, para não cobrir o que se pinta.
  const popoverSide = place === Position.Bottom ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]';
  const toggle = (p: Exclude<Popover, null>) => setPopover((cur) => (cur === p ? null : p));
  const run = (fn: (id: string) => void) => () => {
    fn(node.id);
    actions.focusCanvas();
  };

  // Leitor sem nota e sem link: nada a mostrar.
  if (!canEdit && !node.note && !node.link) return null;

  return (
    <NodeToolbar nodeId={node.id} isVisible position={place} offset={12}>
      {/* O popover sai do fluxo: a barra fica sempre à mesma distância do bloco,
          por mais alto que o seletor de cor seja (senão ela some atrás do cabeçalho). */}
      <div
        className="export-hidden relative flex flex-col items-center"
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
          className="flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {canEdit && (
            <>
              <BarButton label="Adicionar filho" shortcut="Tab" onClick={() => actions.createChild(node.id)}>
                <IconChild />
              </BarButton>
              {!isRoot && (
                <BarButton label="Adicionar irmão" shortcut="Enter" onClick={() => actions.createSibling(node.id)}>
                  <IconSibling />
                </BarButton>
              )}
              <Divider />
              <BarButton label="Cores" pressed={popover === 'color'} onClick={() => toggle('color')}>
                <span
                  className="h-4 w-4 rounded-full border border-line"
                  style={{
                    background: node.fill ?? node.color ?? `conic-gradient(${palette.slice(0, 4).join(',')},${palette[0]})`,
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
          {canEdit && !isRoot && (
            <BarButton label="Cortar e religar em outro tópico-pai" shortcut="Ctrl+X" onClick={run(actions.cutEdge)}>
              <IconScissors />
            </BarButton>
          )}
          {canEdit && hasChildren && (
            <BarButton
              label={actions.branchDrag ? 'Arrastar move só este bloco' : 'Arrastar leva o ramo junto (ou segure Shift)'}
              pressed={actions.branchDrag}
              onClick={() => {
                actions.toggleBranchDrag();
                actions.focusCanvas();
              }}
            >
              <IconBranch />
            </BarButton>
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
                className="flex h-8 items-center justify-center rounded-lg px-2 text-muted hover:bg-surface-2 hover:text-ink"
              >
                <IconExternal />
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

        {popover && canEdit && (
          <div className={`absolute left-1/2 z-10 -translate-x-1/2 ${popoverSide}`}>
            {popover === 'color' && (
              <NodeColors
                node={node}
                palette={palette}
                onPick={{
                  color: (value) => actions.setColor(node.id, value),
                  fill: (value) => actions.setFill(node.id, value),
                  ink: (value) => actions.setInk(node.id, value),
                }}
              />
            )}
            {popover === 'shape' && (
              <ShapePicker
                current={node.shape ?? defaultShape}
                onPick={(shape) => {
                  actions.setShape(node.id, shape);
                  setPopover(null);
                  actions.focusCanvas();
                }}
              />
            )}
            {popover === 'link' && (
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

type ColorTarget = 'color' | 'fill' | 'ink';

const TARGET_LABEL: Record<ColorTarget, string> = {
  color: 'Contorno',
  fill: 'Preenchimento',
  ink: 'Texto',
};

/**
 * Contorno, preenchimento e cor do texto, cada um com o seletor livre
 * (SPEC-007 §5.6). O aviso de legibilidade compara o texto com o preenchimento
 * em uso — avisa, não impede (PRD §5.18).
 */
function NodeColors({
  node,
  palette,
  onPick,
}: {
  node: MindMapNode;
  palette: readonly string[];
  onPick: Record<ColorTarget, (value: string) => void>;
}) {
  const [target, setTarget] = useState<ColorTarget>('fill');
  const current = node[target];
  const inkBackground = node.fill ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5 shadow-lg">
      <div role="tablist" aria-label="O que pintar" className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
        {(['color', 'fill', 'ink'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={target === key}
            onClick={() => setTarget(key)}
            className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition ${
              target === key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {key === 'ink' && <IconInk size={12} />}
            {TARGET_LABEL[key]}
          </button>
        ))}
      </div>
      <ColorPicker
        key={target}
        label={TARGET_LABEL[target]}
        value={current}
        palette={target === 'ink' && inkBackground ? [readableInk(inkBackground), ...palette] : palette}
        onChange={onPick[target]}
        onAuto={() => onPick[target]('')}
        autoLabel={
          target === 'color' ? 'Voltar à cor do ramo' : target === 'fill' ? 'Voltar ao fundo do tema' : 'Voltar à cor sugerida'
        }
        contrastWith={target === 'ink' ? inkBackground : null}
      />
    </div>
  );
}

/** Miniatura de cada formato (SPEC-006 §5.4). */
function ShapePicker({ current, onPick }: { current: NodeShape; onPick: (shape: NodeShape) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-lg" role="group" aria-label="Formato do bloco">
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
      className="flex w-80 flex-col gap-2 rounded-xl border border-line bg-surface p-2 shadow-lg"
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
