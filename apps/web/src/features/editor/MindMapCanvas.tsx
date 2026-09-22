import {
  addNode,
  childrenIndex,
  deleteBranch,
  findRoot,
  isInBranch,
  type MindMapNode,
  moveNode,
  type NodeRecord,
  updateNode,
} from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  type NodeChange,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { CanvasControls, FIT_VIEW_OPTIONS } from './CanvasControls';
import { layoutMindMap, type PositionedNode } from './layout';
import { type MindFlowNode, MindNode, type MindNodeData, PENDING_ENTER } from './MindNode';
import { BRANCH_COLORS, type NodeActions, NodeActionBar } from './NodeActionBar';
import { stableData } from './stableData';
import { LOCAL_ORIGIN } from './useMindMap';

const ROOT_COLOR = '#667085';
const NO_PEERS: Array<{ name: string; color: string }> = [];
const nodeTypes = { mind: MindNode };

interface Props {
  doc: Y.Doc;
  nodes: NodeRecord;
  provider: HocuspocusProvider;
  canEdit: boolean;
  undo: Y.UndoManager | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Abre o painel de nota do tópico (SPEC-002 §5.5). */
  onOpenNote: (id: string) => void;
}

type PeerSelection = Map<string, Array<{ name: string; color: string }>>;

/** Seleções dos colegas, pelo awareness do Yjs. */
function usePeerSelections(provider: HocuspocusProvider): PeerSelection {
  const [peers, setPeers] = useState<PeerSelection>(new Map());
  useEffect(() => {
    const awareness = provider.awareness;
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

export function MindMapCanvas({ doc, nodes, provider, canEdit, undo, selectedId, onSelect, onOpenNote }: Props) {
  const [editing, setEditing] = useState<{ id: string; draft: string | null } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
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
    provider.setAwarenessField('selected', selectedId);
  }, [provider, selectedId]);

  // Se o nó selecionado sumir (apagado por alguém), limpa a seleção.
  useEffect(() => {
    if (selectedId && !nodes[selectedId]) onSelect(findRoot(nodes)?.id ?? null);
    if (editing && !nodes[editing.id]) setEditing(null);
  }, [nodes, selectedId, editing, onSelect]);

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
  const positions = useMemo(() => layoutMindMap(nodes), [nodes]);
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  const colorOf = useMemo(() => {
    const colors = new Map<string, string>();
    const root = findRoot(nodes);
    if (!root) return colors;
    colors.set(root.id, root.color ?? ROOT_COLOR);
    (index.get(root.id) ?? []).forEach((branch, i) => {
      const inherited = branch.color ?? BRANCH_COLORS[i % BRANCH_COLORS.length] ?? ROOT_COLOR;
      // Cor explícita num nó vale para ele e seus descendentes.
      const paint = (node: MindMapNode, color: string) => {
        const own = node.color ?? color;
        colors.set(node.id, own);
        for (const child of index.get(node.id) ?? []) paint(child, own);
      };
      paint(branch, inherited);
    });
    return colors;
  }, [nodes, index]);

  // Callbacks estáveis para o data dos nós; leem as ações atuais pelo ref (SPEC-002 §5.4).
  const actionsRef = useRef<NodeActions | null>(null);
  const onAddChild = useCallback((id: string) => actionsRef.current?.createChild(id), []);
  const onOpenNoteStable = useCallback((id: string) => actionsRef.current?.openNote(id), []);
  const dataCache = useRef(new Map<string, MindNodeData>());
  // Tamanho medido de cada nó. Sem ele, cada objeto de nó novo chega ao React Flow
  // "não medido" e o nó fica escondido até ser medido de novo — um clique nesse
  // intervalo atravessa o nó e todos os nós são re-medidos a cada mudança.
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const onNodesChange = useCallback((changes: NodeChange<MindFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) measured.current.set(change.id, change.dimensions);
    }
  }, []);

  const flow = useMemo(() => {
    const flowNodes: MindFlowNode[] = [];
    const flowEdges: Edge[] = [];
    for (const pos of positions) {
      const node = nodes[pos.id];
      if (!node) continue;
      const color = colorOf.get(node.id) ?? ROOT_COLOR;
      const isDragging = drag?.id === node.id;
      flowNodes.push({
        id: node.id,
        type: 'mind',
        position: isDragging ? { x: drag.x, y: drag.y } : { x: pos.x, y: pos.y },
        origin: [pos.side === 'left' ? 1 : pos.side === 'root' ? 0.5 : 0, 0.5],
        selected: node.id === selectedId,
        draggable: canEdit && node.parentId !== null && editing?.id !== node.id,
        zIndex: isDragging ? 10 : 0,
        measured: measured.current.get(node.id),
        data: stableData(dataCache.current, node.id, {
          text: node.text,
          side: pos.side,
          color,
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
      if (node.parentId && !isDragging) {
        const left = pos.side === 'left';
        flowEdges.push({
          id: `${node.parentId}->${node.id}`,
          source: node.parentId,
          target: node.id,
          sourceHandle: left ? 's-l' : 's-r',
          targetHandle: left ? 't-r' : 't-l',
          type: 'default',
          style: { stroke: color, strokeWidth: 2 },
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
    return { flowNodes, flowEdges };
  }, [
    positions,
    nodes,
    colorOf,
    drag,
    selectedId,
    canEdit,
    editing,
    index,
    peers,
    commitText,
    takePending,
    onAddChild,
    onOpenNoteStable,
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

  const createNode = (parentId: string, afterId?: string) => {
    const id = crypto.randomUUID();
    pendingRef.current = '';
    newStep();
    if (addNode(doc, { id, parentId, afterId }, LOCAL_ORIGIN)) {
      onSelect(id);
      setEditing({ id, draft: '' });
      focusCanvas(); // guarda as teclas até o campo do nó novo ganhar foco
    }
  };

  const actions: NodeActions = {
    createChild: (id) => {
      if (canEdit && nodes[id]) createNode(id);
    },
    createSibling: (id) => {
      const node = nodes[id];
      if (!canEdit || !node) return;
      if (node.parentId) createNode(node.parentId, node.id);
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
    setLink: (id, link) => {
      if (!canEdit) return false;
      newStep();
      return updateNode(doc, id, { link }, LOCAL_ORIGIN);
    },
    openNote: (id) => {
      onSelect(id);
      onOpenNote(id);
    },
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

    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (!selectedId) return onSelect(id);
      const next = neighbor(id, e.key);
      if (next) onSelect(next);
      return;
    }
    if (e.key === 'Escape') return onSelect(null);
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

  // ---------- arrastar: soltar sobre um nó = virar filho; entre irmãos = reordenar ----------
  const onNodeDragStop = (_: unknown, dragged: Node) => {
    setDrag(null);
    const node = nodes[dragged.id];
    if (!node?.parentId) return;

    const target = getIntersectingNodes(dragged).find((n) => !isInBranch(nodes, dragged.id, n.id));
    if (target) {
      newStep();
      moveNode(doc, dragged.id, target.id, undefined, LOCAL_ORIGIN);
      return;
    }
    const side = posById.get(dragged.id)?.side;
    const siblings = byY(
      (index.get(node.parentId) ?? [])
        .filter((s) => s.id !== dragged.id)
        .map((s) => posById.get(s.id))
        .filter((p): p is PositionedNode => !!p && p.side === side),
    );
    const before = siblings.filter((s) => s.y < dragged.position.y).at(-1);
    newStep();
    moveNode(doc, dragged.id, node.parentId, before?.id ?? null, LOCAL_ORIGIN);
  };

  const selectedNode = selectedId ? nodes[selectedId] : undefined;

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="h-full w-full outline-none"
      aria-label="Mapa mental. Use as setas para navegar."
    >
      <ReactFlow
        nodes={flow.flowNodes}
        edges={flow.flowEdges}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        onNodeClick={(e, n) => {
          // `detail >= 2` é o segundo clique de um duplo clique, segundo o próprio
          // navegador. O evento `dblclick` sozinho não basta: quando o primeiro
          // clique troca a seleção, ele pode ir para o fundo (SPEC-002 §5.8).
          if (canEdit && e.detail >= 2) {
            onSelect(n.id);
            setEditing({ id: n.id, draft: null });
            return;
          }
          onSelect(n.id);
          focusCanvas();
        }}
        onNodeDoubleClick={(_, n) => canEdit && setEditing({ id: n.id, draft: null })}
        zoomOnDoubleClick={false}
        onNodeDragStart={(_, n) => onSelect(n.id)}
        onNodeDrag={(_, n) => setDrag({ id: n.id, x: n.position.x, y: n.position.y })}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        onPaneClick={() => {
          onSelect(null);
          focusCanvas();
        }}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.15}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--grid)" />
        <CanvasControls undo={undo} canEdit={canEdit} onAfter={focusCanvas} />
        {selectedNode && !editing && !drag && (
          <NodeActionBar
            key={selectedNode.id}
            node={selectedNode}
            canEdit={canEdit}
            hasChildren={(index.get(selectedNode.id)?.length ?? 0) > 0}
            actions={actions}
          />
        )}
      </ReactFlow>
    </div>
  );
}

