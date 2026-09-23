import {
  addNode,
  branchIds,
  childrenIndex,
  clearOffsets,
  deleteBranch,
  findRoot,
  isInBranch,
  type MindMapNode,
  moveSibling,
  type NodeRecord,
  type NodeSide,
  readableInk,
  reparentNode,
  resolveSides,
  setNodeOffsets,
  updateNode,
} from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  Background,
  BackgroundVariant,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { BoardTheme } from './boardTheme';
import { CanvasControls, FIT_VIEW_OPTIONS } from './CanvasControls';
import { type MindEdgeData, MindEdge, type MindFlowEdge } from './MindEdge';
import { offsetsForSoloMove, type PositionedNode, resolvePositions } from './layout';
import { type MindFlowNode, MindNode, type MindNodeData, PENDING_ENTER } from './MindNode';
import { type NodeActions, NodeActionBar } from './NodeActionBar';
import { stableData } from './stableData';
import { edgeWidthForDepth } from './taper';
import { LOCAL_ORIGIN } from './useMindMap';

const NO_PEERS: Array<{ name: string; color: string }> = [];
const nodeTypes = { mind: MindNode };
const edgeTypes = { mind: MindEdge };

interface Props {
  doc: Y.Doc;
  nodes: NodeRecord;
  /** Sem provider (modo versão, SPEC-005 §5.2): sem presença e sem awareness. */
  provider: HocuspocusProvider | null;
  canEdit: boolean;
  undo: Y.UndoManager | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Abre o painel de nota do tópico (SPEC-002 §5.5). */
  onOpenNote: (id: string) => void;
  /** Guarda uma versão antes de uma operação grande (SPEC-005 §5.3). */
  onCheckpoint?: (name: string) => void;
  /** Tema do documento (SPEC-007 §5.4). */
  board: BoardTheme;
}

type PeerSelection = Map<string, Array<{ name: string; color: string }>>;

/** Seleções dos colegas, pelo awareness do Yjs. */
function usePeerSelections(provider: HocuspocusProvider | null): PeerSelection {
  const [peers, setPeers] = useState<PeerSelection>(new Map());
  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) return;
    const update = () => {
      const next: PeerSelection = new Map();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const selected = state.selected;
        const user = state.user as { name?: string; color?: string } | undefined;
        if (typeof selected !== 'string' || !user?.name) return;
        const list = next.get(selected) ?? [];
        list.push({ name: user.name, color: user.color ?? '#5c7cfa' });
        next.set(selected, list);
      });
      setPeers(next);
    };
    awareness.on('change', update);
    update();
    return () => awareness.off('change', update);
  }, [provider]);
  return peers;
}

export function MindMapCanvas({
  doc,
  nodes,
  provider,
  canEdit,
  undo,
  selectedId,
  onSelect,
  onOpenNote,
  onCheckpoint,
  board,
}: Props) {
  const theme = board.theme;
  const [editing, setEditing] = useState<{ id: string; draft: string | null } | null>(null);
  // Arrasto: posição local, bloco sob o ponteiro e se o ramo vai junto (§5.1).
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; target: string | null; branch: boolean } | null>(
    null,
  );
  // "Mover com o ramo" fixo na barra, para quem não usa Shift (toque).
  const [branchDrag, setBranchDrag] = useState(false);
  // Ligação selecionada e bloco esperando um novo pai (SPEC-007 §5.2).
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [rewire, setRewire] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef('');
  const takePending = useCallback(() => {
    const text = pendingRef.current;
    pendingRef.current = '';
    return text;
  }, []);
  const { getIntersectingNodes } = useReactFlow();
  const peers = usePeerSelections(provider);

  // Seleção publicada para os colegas.
  useEffect(() => {
    provider?.setAwarenessField('selected', selectedId);
  }, [provider, selectedId]);

  // Se o nó selecionado sumir (apagado por alguém), limpa a seleção.
  useEffect(() => {
    if (selectedId && !nodes[selectedId]) onSelect(findRoot(nodes)?.id ?? null);
    if (editing && !nodes[editing.id]) setEditing(null);
    if (rewire && !nodes[rewire]) setRewire(null);
  }, [nodes, selectedId, editing, rewire, onSelect]);

  const focusCanvas = useCallback(() => wrapperRef.current?.focus({ preventScroll: true }), []);

  const commitText = useCallback(
    (id: string, text: string | null) => {
      if (text !== null && canEdit) updateNode(doc, id, { text: text.trim() }, LOCAL_ORIGIN);
      setEditing(null);
      requestAnimationFrame(() => wrapperRef.current?.focus({ preventScroll: true }));
    },
    [doc, canEdit],
  );

  const index = useMemo(() => childrenIndex(nodes), [nodes]);
  const rootId = useMemo(() => findRoot(nodes)?.id ?? null, [nodes]);
  /** Lado de cada ramo de 1º nível (SPEC-008 §2.2) — quem já tem, manda. */
  const branchSides = useMemo(
    () => resolveSides(rootId ? (index.get(rootId) ?? []) : []),
    [index, rootId],
  );
  // Layout automático + deslocamentos manuais (SPEC-006 §2.2), com a folga da
  // fonte em uso (SPEC-007 §5.4).
  const positions = useMemo(
    () => resolvePositions(nodes, board.font.widthFactor),
    [nodes, board.font.widthFactor],
  );
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  /** Cor e profundidade de cada nó, a partir da paleta do tema. */
  const painted = useMemo(() => {
    const out = new Map<string, { color: string; depth: number }>();
    const root = findRoot(nodes);
    if (!root) return out;
    out.set(root.id, { color: root.color ?? theme.rootColor, depth: 0 });
    (index.get(root.id) ?? []).forEach((branch, i) => {
      const inherited = branch.color ?? theme.branches[i % theme.branches.length] ?? theme.rootColor;
      // Cor explícita num nó vale para ele e seus descendentes. Sem recursão:
      // um ramo muito profundo não pode estourar a pilha.
      const stack: Array<{ node: MindMapNode; color: string; depth: number }> = [
        { node: branch, color: inherited, depth: 1 },
      ];
      while (stack.length > 0) {
        const { node, color, depth } = stack.pop() as { node: MindMapNode; color: string; depth: number };
        const own = node.color ?? color;
        out.set(node.id, { color: own, depth });
        for (const child of index.get(node.id) ?? []) stack.push({ node: child, color: own, depth: depth + 1 });
      }
    });
    return out;
  }, [nodes, index, theme]);

  // Callbacks estáveis para o data dos nós; leem as ações atuais pelo ref (SPEC-002 §5.4).
  const actionsRef = useRef<NodeActions | null>(null);
  const onAddChild = useCallback((id: string) => actionsRef.current?.createChild(id), []);
  const onOpenNoteStable = useCallback((id: string) => actionsRef.current?.openNote(id), []);
  const onCutEdge = useCallback((childId: string) => actionsRef.current?.cutEdge(childId), []);
  const dataCache = useRef(new Map<string, MindNodeData>());
  const edgeCache = useRef(new Map<string, MindEdgeData>());
  // Tamanho medido de cada nó. Sem ele, cada objeto de nó novo chega ao React Flow
  // "não medido" e o nó fica escondido até ser medido de novo — um clique nesse
  // intervalo atravessa o nó e todos os nós são re-medidos a cada mudança.
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const onNodesChange = useCallback((changes: NodeChange<MindFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) measured.current.set(change.id, change.dimensions);
    }
  }, []);

  // Durante o arrasto, só o bloco arrastado se move (SPEC-007 §5.1) — com
  // Shift (ou "Mover com o ramo" ligado), o ramo inteiro acompanha.
  const dragId = drag?.id ?? null;
  const dragBranch = useMemo(
    () => (dragId && drag?.branch ? new Set(branchIds(nodes, dragId)) : null),
    [dragId, drag?.branch, nodes],
  );
  const dragDelta = useMemo(() => {
    if (!drag) return null;
    const origin = posById.get(drag.id);
    return origin ? { x: drag.x - origin.x, y: drag.y - origin.y } : null;
  }, [drag, posById]);

  /** Blocos que não podem receber o bloco solto (ele mesmo e seus descendentes). */
  const rewireBlocked = useMemo(() => (rewire ? new Set(branchIds(nodes, rewire)) : null), [rewire, nodes]);

  const flow = useMemo(() => {
    const flowNodes: MindFlowNode[] = [];
    const flowEdges: MindFlowEdge[] = [];
    for (const pos of positions) {
      const node = nodes[pos.id];
      if (!node) continue;
      const paint = painted.get(node.id);
      const color = paint?.color ?? theme.rootColor;
      const depth = paint?.depth ?? 0;
      const isDragging = drag?.id === node.id;
      const moving = dragDelta && (isDragging || dragBranch?.has(node.id));
      // Tema com ramos preenchidos: a raiz e o 1º nível nascem pintados
      // (como na referência do MindMeister).
      const themeFill = theme.filledBranches && depth <= 1 ? color : null;
      const fill = node.fill ?? themeFill;
      flowNodes.push({
        id: node.id,
        type: 'mind',
        position: moving ? { x: pos.x + dragDelta.x, y: pos.y + dragDelta.y } : { x: pos.x, y: pos.y },
        origin: [pos.side === 'left' ? 1 : pos.side === 'root' ? 0.5 : 0, 0.5],
        selected: node.id === selectedId,
        // A raiz também arrasta (SPEC-006 §5.1): arrastá-la move o mapa inteiro.
        draggable: canEdit && editing?.id !== node.id && !rewire,
        zIndex: isDragging ? 10 : 0,
        measured: measured.current.get(node.id),
        data: stableData(dataCache.current, node.id, {
          text: node.text,
          side: pos.side,
          color,
          shape: node.shape ?? theme.shape,
          fill,
          ink: node.ink ?? (fill ? readableInk(fill) : null),
          dropTarget: drag?.target === node.id,
          // No modo religar, o que não pode receber fica apagado (§5.2).
          blocked: !!rewireBlocked?.has(node.id),
          picking: !!rewire && !rewireBlocked?.has(node.id),
          bold: node.bold ?? false,
          hasHiddenChildren: !!node.collapsed && (index.get(node.id)?.length ?? 0) > 0,
          editing: editing?.id === node.id,
          draft: editing?.id === node.id ? editing.draft : null,
          peers: peers.get(node.id) ?? NO_PEERS,
          canEdit,
          hasNote: !!node.note,
          link: node.link ?? null,
          onCommit: commitText,
          takePending,
          onAddChild,
          onOpenNote: onOpenNoteStable,
        }),
      });
      // A ligação continua desenhada enquanto se arrasta (SPEC-007 §5.1): ela
      // estica junto com o bloco, em vez de sumir.
      if (node.parentId) {
        const left = pos.side === 'left';
        flowEdges.push({
          id: `${node.parentId}->${node.id}`,
          source: node.parentId,
          target: node.id,
          sourceHandle: left ? 's-l' : 's-r',
          targetHandle: left ? 't-r' : 't-l',
          type: 'mind',
          selected: selectedEdge === `${node.parentId}->${node.id}`,
          zIndex: 0,
          data: stableData(edgeCache.current, `${node.parentId}->${node.id}`, {
            color,
            width: edgeWidthForDepth(theme.edge.width, depth),
            taper: theme.edge.taper,
            canCut: canEdit && !rewire,
            onCut: onCutEdge,
          }),
        });
      }
    }
    // Nós que sumiram saem do cache.
    if (dataCache.current.size > flowNodes.length) {
      const alive = new Set(flowNodes.map((n) => n.id));
      for (const id of dataCache.current.keys()) {
        if (alive.has(id)) continue;
        dataCache.current.delete(id);
        measured.current.delete(id);
      }
    }
    if (edgeCache.current.size > flowEdges.length) {
      const alive = new Set(flowEdges.map((e) => e.id));
      for (const id of edgeCache.current.keys()) if (!alive.has(id)) edgeCache.current.delete(id);
    }
    return { flowNodes, flowEdges };
  }, [
    positions,
    nodes,
    painted,
    theme,
    drag,
    dragBranch,
    dragDelta,
    rewire,
    rewireBlocked,
    selectedEdge,
    selectedId,
    canEdit,
    editing,
    index,
    peers,
    commitText,
    takePending,
    onAddChild,
    onOpenNoteStable,
    onCutEdge,
  ]);

  // ---------- navegação por setas ----------
  const visibleChildren = (id: string) => (nodes[id]?.collapsed ? [] : (index.get(id) ?? []));
  const byY = (list: PositionedNode[]) => [...list].sort((a, b) => a.y - b.y);

  const neighbor = (id: string, key: string): string | undefined => {
    const node = nodes[id];
    const pos = posById.get(id);
    if (!node || !pos) return undefined;
    const kids = byY(visibleChildren(id).map((c) => posById.get(c.id)).filter((p): p is PositionedNode => !!p));
    const outward = (side: 'left' | 'right') => kids.find((k) => k.side === side)?.id;

    if (key === 'ArrowRight') {
      if (pos.side === 'root') return outward('right');
      return pos.side === 'right' ? kids[0]?.id : (node.parentId ?? undefined);
    }
    if (key === 'ArrowLeft') {
      if (pos.side === 'root') return outward('left');
      return pos.side === 'left' ? kids[0]?.id : (node.parentId ?? undefined);
    }
    if (!node.parentId) return undefined;
    const siblings = byY(
      (index.get(node.parentId) ?? [])
        .map((s) => posById.get(s.id))
        .filter((p): p is PositionedNode => !!p && p.side === pos.side),
    );
    const at = siblings.findIndex((s) => s.id === id);
    return siblings[key === 'ArrowUp' ? at - 1 : at + 1]?.id;
  };

  // ---------- ações: as mesmas para teclado, barra flutuante e "+" (SPEC-002 §5.1) ----------
  // Cada ação discreta é um passo próprio do desfazer, mesmo com cliques rápidos
  // (o UndoManager junta alterações a menos de 400 ms). O texto de um nó recém-criado
  // continua no mesmo passo da criação.
  const newStep = () => undo?.stopCapturing();

  const createNode = (parentId: string, afterId?: string, side?: NodeSide) => {
    const id = crypto.randomUUID();
    pendingRef.current = '';
    newStep();
    if (addNode(doc, { id, parentId, afterId, side }, LOCAL_ORIGIN)) {
      onSelect(id);
      setEditing({ id, draft: '' });
      focusCanvas(); // guarda as teclas até o campo do nó novo ganhar foco
    }
  };

  /** Religa o bloco solto em `parentId`, se for um destino válido (§5.2). */
  const finishRewire = (parentId: string) => {
    const child = rewire;
    setRewire(null);
    setSelectedEdge(null);
    if (!child || !canEdit) return;
    if (child === parentId || isInBranch(nodes, child, parentId)) return; // ciclo
    newStep();
    if (reparentNode(doc, child, parentId, LOCAL_ORIGIN)) onSelect(child);
    focusCanvas();
  };

  const actions: NodeActions = {
    createChild: (id) => {
      if (canEdit && nodes[id]) createNode(id);
    },
    createSibling: (id) => {
      const node = nodes[id];
      if (!canEdit || !node) return;
      // SPEC-008 §5.5: o irmão nasce do MESMO lado, logo abaixo — nunca do
      // outro lado da raiz, como acontecia antes.
      if (node.parentId) createNode(node.parentId, node.id, branchSides.get(node.id));
      else createNode(node.id); // na raiz, irmão vira filho
    },
    removeNode: (id) => {
      const node = nodes[id];
      if (!canEdit || !node?.parentId) return;
      const siblings = index.get(node.parentId) ?? [];
      const at = siblings.findIndex((s) => s.id === node.id);
      newStep();
      deleteBranch(doc, node.id, LOCAL_ORIGIN);
      onSelect(siblings[at + 1]?.id ?? siblings[at - 1]?.id ?? node.parentId);
      focusCanvas();
    },
    toggleCollapse: (id) => {
      const node = nodes[id];
      if (canEdit && node && (index.get(id)?.length ?? 0) > 0) {
        newStep();
        updateNode(doc, id, { collapsed: !node.collapsed }, LOCAL_ORIGIN);
      }
    },
    toggleBold: (id) => {
      const node = nodes[id];
      if (!canEdit || !node) return;
      newStep();
      updateNode(doc, id, { bold: !node.bold }, LOCAL_ORIGIN);
    },
    setColor: (id, color) => {
      if (!canEdit) return;
      newStep();
      updateNode(doc, id, { color }, LOCAL_ORIGIN);
    },
    setFill: (id, fill) => {
      if (!canEdit) return;
      newStep();
      updateNode(doc, id, { fill }, LOCAL_ORIGIN);
    },
    setInk: (id, ink) => {
      if (!canEdit) return;
      newStep();
      updateNode(doc, id, { ink }, LOCAL_ORIGIN);
    },
    setShape: (id, shape) => {
      if (!canEdit) return;
      newStep();
      updateNode(doc, id, { shape }, LOCAL_ORIGIN);
    },
    reorder: (id, direction) => {
      if (!canEdit) return;
      newStep();
      moveSibling(doc, id, direction, LOCAL_ORIGIN);
    },
    // Volta o ramo (ou o mapa, a partir da raiz) ao layout automático — um Ctrl+Z desfaz.
    tidy: (id) => {
      if (!canEdit) return;
      const root = findRoot(nodes);
      onCheckpoint?.(id === root?.id ? 'Antes de organizar o mapa' : 'Antes de organizar um ramo');
      newStep();
      clearOffsets(doc, id, LOCAL_ORIGIN);
    },
    setLink: (id, link) => {
      if (!canEdit) return false;
      newStep();
      return updateNode(doc, id, { link }, LOCAL_ORIGIN);
    },
    openNote: (id) => {
      onSelect(id);
      onOpenNote(id);
    },
    cutEdge: (childId) => {
      if (!canEdit || !nodes[childId]?.parentId) return;
      onSelect(childId);
      setSelectedEdge(null);
      setRewire(childId);
      focusCanvas();
    },
    toggleBranchDrag: () => setBranchDrag((on) => !on),
    branchDrag,
    focusCanvas,
  };
  actionsRef.current = actions;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Teclas num botão, link ou campo (barra, controles) não viram atalho do mapa.
    if (e.target !== wrapperRef.current && (e.target as HTMLElement).closest('button, a, input, textarea, form')) return;
    if (editing) {
      // Campo de texto ainda sem foco: guarda o que foi digitado.
      if (e.target === wrapperRef.current && !e.ctrlKey && !e.metaKey && (e.key.length === 1 || e.key === 'Enter')) {
        e.preventDefault();
        pendingRef.current += e.key === 'Enter' ? PENDING_ENTER : e.key;
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;

    if (canEdit && mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) undo?.redo();
      else undo?.undo();
      return;
    }
    if (canEdit && mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      undo?.redo();
      return;
    }

    const id = selectedId ?? findRoot(nodes)?.id;
    if (!id) return;
    const node = nodes[id];
    if (!node) return;

    // Cortar e colar o ramo em outro pai (SPEC-007 §5.2). É um recorte interno:
    // nada é lido nem escrito na área de transferência do sistema.
    if (canEdit && mod && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      actions.cutEdge(node.id);
      return;
    }
    if (canEdit && mod && (e.key === 'v' || e.key === 'V') && rewire) {
      e.preventDefault();
      finishRewire(node.id);
      return;
    }

    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      // Ctrl+↑/↓ troca a ordem entre irmãos (SPEC-006 §5.2); as setas sozinhas navegam.
      if (canEdit && mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        actions.reorder(id, e.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }
      if (!selectedId) return onSelect(id);
      const next = neighbor(id, e.key);
      if (next) onSelect(next);
      return;
    }
    if (e.key === 'Escape') {
      // Cancelar o religar vem antes de limpar a seleção.
      if (rewire) return setRewire(null);
      if (selectedEdge) return setSelectedEdge(null);
      return onSelect(null);
    }
    if (!canEdit) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      actions.createChild(node.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      actions.createSibling(node.id); // na raiz, Enter cria filho
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && node.parentId) {
      e.preventDefault();
      actions.removeNode(node.id);
    } else if (e.key === 'F2') {
      e.preventDefault();
      setEditing({ id: node.id, draft: null });
    } else if (e.key === ' ') {
      e.preventDefault();
      actions.toggleCollapse(node.id);
    } else if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      actions.toggleBold(node.id);
    } else if (e.key.length === 1 && !mod && !e.altKey) {
      // Digitar com um nó selecionado começa a editar, substituindo o texto.
      e.preventDefault();
      setEditing({ id: node.id, draft: e.key });
    }
  };

  // ---------- arrastar: sobre um bloco = trocar de pai; no vazio = posicionar ----------
  /** Bloco sob o arrastado que pode receber a troca de pai (fora do próprio ramo). */
  const dropTargetOf = (dragged: Node): string | null => {
    if (nodes[dragged.id]?.parentId === null) return null; // a raiz não vira filha de ninguém
    return getIntersectingNodes(dragged).find((n) => !isInBranch(nodes, dragged.id, n.id))?.id ?? null;
  };

  const withBranch = (event: { shiftKey?: boolean }) => !!event.shiftKey || branchDrag;

  const onNodeDragStop = (event: { shiftKey?: boolean }, dragged: Node) => {
    const target = drag?.target ?? null;
    setDrag(null);
    const node = nodes[dragged.id];
    if (!node || !canEdit) return;

    if (target && node.parentId !== null) {
      // Troca de pai: o bloco volta à posição automática sob o novo pai, e tudo
      // numa transação só (SPEC-007 §5.2). Soltar na raiz define o lado pelo
      // ponto em que se soltou (SPEC-008 §5.5).
      newStep();
      const rootPos = rootId ? posById.get(rootId) : undefined;
      const side: NodeSide | undefined =
        target === rootId && rootPos ? (dragged.position.x < rootPos.x ? 'left' : 'right') : undefined;
      reparentNode(doc, dragged.id, target, LOCAL_ORIGIN, side);
      return;
    }
    const to = { x: dragged.position.x, y: dragged.position.y };
    newStep();
    if (withBranch(event) || node.parentId === null) {
      // Ramo inteiro (ou o mapa, pela raiz): basta deslocar este bloco.
      const parentPos = node.parentId ? posById.get(node.parentId) : { x: 0, y: 0 };
      if (!parentPos) return;
      setNodeOffsets(doc, [{ id: dragged.id, offset: { dx: to.x - parentPos.x, dy: to.y - parentPos.y } }], LOCAL_ORIGIN);
      return;
    }
    // Só este bloco: os filhos diretos recebem a compensação que os deixa parados.
    const childIds = (index.get(dragged.id) ?? []).map((child) => child.id);
    const entries = offsetsForSoloMove(posById, dragged.id, node.parentId, childIds, to);
    if (entries.length > 0) setNodeOffsets(doc, entries, LOCAL_ORIGIN);
  };

  const selectedNode = selectedId ? nodes[selectedId] : undefined;
  const hasManualPositions = useMemo(() => Object.values(nodes).some((n) => n.dx !== undefined), [nodes]);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`h-full w-full outline-none ${rewire ? 'cursor-crosshair' : ''}`}
      aria-label="Mapa mental. Use as setas para navegar."
    >
      <ReactFlow
        nodes={flow.flowNodes}
        edges={flow.flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        onNodeClick={(e, n) => {
          if (rewire) {
            finishRewire(n.id);
            return;
          }
          // `detail >= 2` é o segundo clique de um duplo clique, segundo o próprio
          // navegador. O evento `dblclick` sozinho não basta: quando o primeiro
          // clique troca a seleção, ele pode ir para o fundo (SPEC-002 §5.8).
          if (canEdit && e.detail >= 2) {
            onSelect(n.id);
            setEditing({ id: n.id, draft: null });
            return;
          }
          setSelectedEdge(null);
          onSelect(n.id);
          focusCanvas();
        }}
        onNodeDoubleClick={(_, n) => canEdit && !rewire && setEditing({ id: n.id, draft: null })}
        onEdgeClick={(_, edge) => {
          if (rewire) return;
          setSelectedEdge((current) => (current === edge.id ? null : edge.id));
          onSelect(null);
          focusCanvas();
        }}
        zoomOnDoubleClick={false}
        onNodeDragStart={(_, n) => {
          setSelectedEdge(null);
          onSelect(n.id);
        }}
        onNodeDrag={(e, n) =>
          setDrag({ id: n.id, x: n.position.x, y: n.position.y, target: dropTargetOf(n), branch: withBranch(e) })
        }
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onPaneClick={() => {
          setRewire(null);
          setSelectedEdge(null);
          onSelect(null);
          focusCanvas();
        }}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.15}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--grid)" />
        <CanvasControls
          undo={undo}
          canEdit={canEdit}
          onAfter={focusCanvas}
          onTidy={() => {
            const root = findRoot(nodes);
            if (root) actions.tidy(root.id);
          }}
          canTidy={hasManualPositions}
        />
        {rewire && (
          <Panel position="top-center" className="export-hidden !mt-3">
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-md"
            >
              <span>
                Escolha o novo tópico-pai de <strong>{nodes[rewire]?.text || 'sem título'}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setRewire(null);
                  focusCanvas();
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink"
              >
                Cancelar (Esc)
              </button>
            </div>
          </Panel>
        )}
        {selectedNode && !editing && !drag && !rewire && (
          <NodeActionBar
            key={selectedNode.id}
            node={selectedNode}
            canEdit={canEdit}
            palette={theme.branches}
            defaultShape={theme.shape}
            hasChildren={(index.get(selectedNode.id)?.length ?? 0) > 0}
            siblingCount={selectedNode.parentId ? (index.get(selectedNode.parentId)?.length ?? 0) : 0}
            branchMoved={branchIds(nodes, selectedNode.id).some((bid) => nodes[bid]?.dx !== undefined)}
            side={posById.get(selectedNode.id)?.side ?? 'root'}
            actions={actions}
          />
        )}
      </ReactFlow>
    </div>
  );
}
