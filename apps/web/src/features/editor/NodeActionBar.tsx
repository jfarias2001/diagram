import { type MindMapNode, NODE_SHAPES, type NodeShape, normalizeLink, readableInk } from '@diagram/shared';
import { NodeToolbar, Position, useStore } from '@xyflow/react';
import { type ReactNode, useState } from 'react';
import { type ActionGroup, ActionMenu } from '../../components/ActionMenu';
import { ColorPicker } from '../../components/ColorPicker';
import {
  IconArrowDown,
  IconArrowUp,
  IconBold,
  IconBranch,
  IconChild,
  IconCollapse,
  IconExpand,
  IconExternal,
  IconGridMenu,
  IconInk,
  IconLink,
  IconNote,
  IconPaint,
  IconScissors,
  IconShape,
  IconSibling,
  IconTidy,
  IconTrash,
} from '../../components/icons';

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
  /** Lado do bloco no mapa: a barra abre para fora, longe dos irmãos (SPEC-008 §5.4). */
  side: 'left' | 'right' | 'root';
  actions: NodeActions;
}

type Popover = 'color' | 'link' | 'shape' | 'menu' | null;

/** O que cada ação do menu em grade precisa saber (SPEC-008 §5.4). */
export interface MenuContext {
  node: MindMapNode;
  canEdit: boolean;
  isRoot: boolean;
  hasChildren: boolean;
  siblingCount: number;
  branchMoved: boolean;
  actions: NodeActions;
  /** Troca o conteúdo do popover (cores, formato, link) sem fechar tudo. */
  openPopover: (p: 'color' | 'link' | 'shape' | 'menu') => void;
  /** Fecha o menu e devolve o foco ao quadro. */
  close: () => void;
}

/**
 * Grupos do menu do bloco. Função pura: dá para testar o que cada papel vê sem
 * montar DOM nenhum (SPEC-008 §7).
 */
export function mindMenuGroups(ctx: MenuContext): ActionGroup[] {
  const { node, canEdit, isRoot, hasChildren, siblingCount, branchMoved, actions } = ctx;
  const run = (fn: (id: string) => void) => () => {
    ctx.close();
    fn(node.id);
  };

  // Leitor e comentador só enxergam o que é leitura (PRD-008 §7).
  if (!canEdit) {
    const items: ActionGroup['items'] = [];
    if (node.note) {
      items.push({ id: 'note', label: 'Ver nota', icon: IconNote, onSelect: run(actions.openNote) });
    }
    if (node.link) {
      const link = node.link;
      items.push({
        id: 'link',
        label: 'Abrir link',
        icon: IconExternal,
        onSelect: () => {
          ctx.close();
          window.open(link, '_blank', 'noopener,noreferrer');
        },
      });
    }
    return items.length > 0 ? [{ title: 'Conteúdo', items }] : [];
  }

  return [
    {
      title: 'Criar',
      items: [
        { id: 'child', label: 'Novo filho', shortcut: 'Tab', icon: IconChild, onSelect: run(actions.createChild) },
        ...(isRoot
          ? []
          : [
              {
                id: 'sibling',
                label: 'Novo irmão',
                shortcut: 'Enter',
                icon: IconSibling,
                onSelect: run(actions.createSibling),
              },
              {
                id: 'cut',
                label: 'Religar',
                shortcut: 'Ctrl+X',
                icon: IconScissors,
                onSelect: run(actions.cutEdge),
              },
            ]),
      ],
    },
    {
      title: 'Aparência',
      items: [
        { id: 'colors', label: 'Cores', icon: IconPaint, onSelect: () => ctx.openPopover('color') },
        { id: 'shape', label: 'Formato', icon: IconShape, onSelect: () => ctx.openPopover('shape') },
        {
          id: 'bold',
          label: 'Negrito',
          shortcut: 'Ctrl+B',
          icon: IconBold,
          pressed: !!node.bold,
          onSelect: run(actions.toggleBold),
        },
      ],
    },
    {
      title: 'Organizar',
      items: [
        ...(isRoot || siblingCount <= 1
          ? []
          : [
              {
                id: 'up',
                label: 'Subir',
                shortcut: 'Ctrl+↑',
                icon: IconArrowUp,
                onSelect: () => {
                  ctx.close();
                  actions.reorder(node.id, 'up');
                },
              },
              {
                id: 'down',
                label: 'Descer',
                shortcut: 'Ctrl+↓',
                icon: IconArrowDown,
                onSelect: () => {
                  ctx.close();
                  actions.reorder(node.id, 'down');
                },
              },
            ]),
        ...(branchMoved
          ? [{ id: 'tidy', label: 'Organizar ramo', icon: IconTidy, onSelect: run(actions.tidy) }]
          : []),
        ...(hasChildren
          ? [
              {
                id: 'collapse',
                label: node.collapsed ? 'Expandir' : 'Recolher',
                shortcut: 'Espaço',
                icon: node.collapsed ? IconExpand : IconCollapse,
                onSelect: run(actions.toggleCollapse),
              },
              {
                id: 'branch-drag',
                label: 'Levar o ramo',
                icon: IconBranch,
                pressed: actions.branchDrag,
                onSelect: () => {
                  ctx.close();
                  actions.toggleBranchDrag();
                },
              },
            ]
          : []),
      ],
    },
    {
      title: 'Conteúdo',
      items: [
        {
          id: 'note',
          label: node.note ? 'Ver nota' : 'Nota',
          icon: IconNote,
          pressed: !!node.note,
          onSelect: run(actions.openNote),
        },
        {
          id: 'link',
          label: node.link ? 'Editar link' : 'Link',
          icon: IconLink,
          pressed: !!node.link,
          onSelect: () => ctx.openPopover('link'),
        },
      ],
    },
    ...(isRoot
      ? []
      : [
          {
            title: 'Perigo',
            items: [
              {
                id: 'delete',
                label: 'Apagar',
                shortcut: 'Delete',
                icon: IconTrash,
                danger: true,
                onSelect: run(actions.removeNode),
              },
            ],
          },
        ]),
  ];
}

export function NodeActionBar({
  node,
  canEdit,
  palette,
  defaultShape,
  hasChildren,
  siblingCount,
  branchMoved,
  side,
  actions,
}: Props) {
  const [popover, setPopover] = useState<Popover>(null);
  const isRoot = node.parentId === null;
  // Altura do que está aberto: o menu em grade é bem mais alto que um seletor.
  const panelHeight = popover === 'menu' ? 420 : popover ? 330 : 0;
  // Posição do bloco na tela, para o que abrir nunca ficar atrás do cabeçalho
  // nem sair pela borda de baixo (SPEC-007 §5.7, SPEC-008 §5.4).
  const top = useStore((state) => {
    const item = state.nodeLookup.get(node.id);
    if (!item) return 0;
    return item.internals.positionAbsolute.y * state.transform[2] + state.transform[1];
  });
  const viewHeight = useStore((state) => state.height);
  // Fora da raiz, a barra sai pelo lado de FORA do mapa: acima do bloco ela
  // cobriria o irmão de cima, que fica a poucos pixels (PRD-008 §1).
  const sideways = !isRoot && side !== 'root';
  const low = top < panelHeight + 110;
  const place = sideways
    ? side === 'left'
      ? Position.Left
      : Position.Right
    : low
      ? Position.Bottom
      : Position.Top;
  // De lado, o painel desce a partir da barra (ou sobe, se estiver no rodapé) e
  // cresce para FORA, nunca por cima do bloco; acima/abaixo do bloco, ele abre
  // sempre para o lado oposto ao bloco.
  const vertical = low ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]';
  const popoverSide = sideways
    ? `${top + panelHeight < viewHeight ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'} ${
        side === 'left' ? 'right-0' : 'left-0'
      }`
    : `left-1/2 -translate-x-1/2 ${vertical}`;
  const toggle = (p: Exclude<Popover, null>) => setPopover((cur) => (cur === p ? null : p));
  const close = () => {
    setPopover(null);
    actions.focusCanvas();
  };

  const groups = mindMenuGroups({
    node,
    canEdit,
    isRoot,
    hasChildren,
    siblingCount,
    branchMoved,
    actions,
    openPopover: setPopover,
    close,
  });

  // Leitor sem nota e sem link: nada a mostrar.
  if (!canEdit && groups.length === 0) return null;

  return (
    // De lado, a barra começa depois do "+" do bloco (que fica a 26 px da
    // borda): senão ela cobriria o botão de criar filho.
    <NodeToolbar nodeId={node.id} isVisible position={place} offset={sideways ? 38 : 12}>
      {/* O popover sai do fluxo: a barra fica sempre à mesma distância do bloco,
          por mais alto que o menu ou o seletor de cor seja. */}
      <div
        className="export-hidden relative flex flex-col items-center"
        onKeyDown={(e) => {
          // Atalhos do mapa não disparam de dentro da barra (CLAUDE.md §7).
          e.stopPropagation();
          if (e.key === 'Escape') close();
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
              <BarButton label="Cores" pressed={popover === 'color'} onClick={() => toggle('color')}>
                <span
                  className="h-4 w-4 rounded-full border border-line"
                  style={{
                    background:
                      node.fill ?? node.color ?? `conic-gradient(${palette.slice(0, 4).join(',')},${palette[0]})`,
                    borderColor: node.color,
                  }}
                />
              </BarButton>
              <Divider />
            </>
          )}
          <BarButton label="Mais ações" pressed={popover === 'menu'} onClick={() => toggle('menu')}>
            <IconGridMenu />
          </BarButton>
        </div>

        {popover && (
          <div className={`absolute z-10 ${popoverSide}`}>
            {popover === 'menu' && <ActionMenu groups={groups} label="Ações do tópico" onClose={close} />}
            {popover === 'color' && canEdit && (
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
            {popover === 'shape' && canEdit && (
              <ShapePicker
                current={node.shape ?? defaultShape}
                onPick={(shape) => {
                  actions.setShape(node.id, shape);
                  close();
                }}
              />
            )}
            {popover === 'link' && canEdit && (
              <LinkEditor
                key={node.id}
                current={node.link ?? ''}
                onSave={(link) => actions.setLink(node.id, link)}
                onClose={close}
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
        className="nodrag h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
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
