import {
  addEdge as addEdgeOp,
  addShape,
  buildClip,
  type DiagramSnapshot,
  deleteElements,
  type HandleSide,
  moveShapes,
  pasteClip,
  reconnectEdge,
  type Shape,
  SHAPE_DEFAULT_SIZE,
  type ShapeKind,
  readableInk,
  updateEdges,
  updateShapes,
} from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionMode,
  type FinalConnectionState,
  MarkerType,
  type EdgeChange,
  type NodeChange,
  ReactFlow,
  useReactFlow,
  ViewportPortal,
} from '@xyflow/react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { type BoardTheme, mix } from '../editor/boardTheme';
import { FIT_VIEW_OPTIONS } from '../editor/CanvasControls';
import { stableData } from '../editor/stableData';
import { LOCAL_ORIGIN } from '../editor/useMindMap';
import { alignmentSnap, boundingBox, type Guide } from './alignment';
import { autoLayout, GRID } from './autoLayout';
import { parsePasted, serializeClip } from './clipboard';
import { DiagramControls } from './DiagramControls';
import { type DiagramFlowEdge, FlowEdge, type FlowEdgeData } from './FlowEdge';
import { QuickShapeMenu } from './QuickShapeMenu';
import { EdgeSelectionBar, ShapeSelectionBar } from './SelectionBar';
import { type ShapeFlowNode, ShapeNode, type ShapeNodeData } from './ShapeNode';
import { ShapePalette } from './ShapePalette';


const nodeTypes = { shape: ShapeNode };
const edgeTypes = { flow: FlowEdge };
const NO_PEERS: Array<{ name: string; color: string }> = [];
const SNAP_THRESHOLD_PX = 6;
const PASTE_OFFSET = 24;
const ARROW_SIZE = { width: 18, height: 18 };

type Editing = { kind: 'shape' | 'edge'; id: string; draft: string | null } | null;
type Draft = Record<string, { x: number; y: number; w?: number; h?: number }>;

interface Props {
  doc: Y.Doc;
  diagram: DiagramSnapshot;
  /** Sem provider (modo versão, SPEC-005 §5.2): sem presença e sem awareness. */
  provider: HocuspocusProvider | null;
  canEdit: boolean;
  undo: Y.UndoManager | null;
  /** Guarda uma versão antes de uma operação grande (SPEC-005 §5.3). */
  onCheckpoint?: (name: string) => void;
  /** Tema do documento (SPEC-007 §5.4). */
  board: BoardTheme;
}

const newId = () => crypto.randomUUID();
const snapToGridValue = (v: number) => Math.round(v / GRID) * GRID;

export function DiagramCanvas({ doc, diagram, provider, canEdit, undo, onCheckpoint, board }: Props) {
  const theme = board.theme;
  // Padrões do tema para quem não escolheu cor (SPEC-007 §5.3).
  const defaults = useMemo(
    () => ({
      fill: theme.surface,
      stroke: mix(theme.ink, theme.canvas, 0.35),
      ink: theme.ink,
    }),
    [theme],
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getZoom } = useReactFlow();
  const [selection, setSelection] = useState<{ shapes: string[]; edges: string[] }>({ shapes: [], edges: [] });
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [guides, setGuides] = useState<Guide[]>([]);
  const [grid, setGrid] = useState(true);
  const [altHeld, setAltHeld] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [quickMenu, setQuickMenu] = useState<{
    at: { x: number; y: number };
    flow: { x: number; y: number };
    from: { id: string; handle: HandleSide };
  } | null>(null);
  const pasteCount = useRef(0);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const newStep = useCallback(() => undo?.stopCapturing(), [undo]);
  const focusCanvas = useCallback(() => wrapperRef.current?.focus({ preventScroll: true }), []);
  const snapping = grid && !altHeld;

  // Alt solta o encaixe e as guias enquanto está pressionado (SPEC-003 §5.2).
  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => e.key === 'Alt' && setAltHeld(true);
    const up = (e: globalThis.KeyboardEvent) => e.key === 'Alt' && setAltHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Presença: publica a primeira forma selecionada (SPEC-003 §4).
  useEffect(() => {
    provider?.setAwarenessField('selected', selection.shapes[0] ?? null);
  }, [provider, selection.shapes]);

  const peers = usePeerSelections(provider);

  // Seleção some junto com o que foi apagado (por mim ou por um colega).
  useEffect(() => {
    setSelection((cur) => {
      const shapes = cur.shapes.filter((id) => diagram.shapes[id]);
      const edges = cur.edges.filter((id) => diagram.edges[id]);
      return shapes.length === cur.shapes.length && edges.length === cur.edges.length ? cur : { shapes, edges };
    });
    setEditing((cur) => {
      if (!cur) return cur;
      const alive = cur.kind === 'shape' ? diagram.shapes[cur.id] : diagram.edges[cur.id];
      return alive ? cur : null;
    });
  }, [diagram]);

  // ---------- ações ----------
  const commitShapeText = useCallback(
    (id: string, text: string | null) => {
      if (text !== null && canEdit) {
        newStep();
        updateShapes(doc, [id], { text }, LOCAL_ORIGIN);
      }
      setEditing(null);
      requestAnimationFrame(focusCanvas);
    },
    [doc, canEdit, newStep, focusCanvas],
  );

  const commitEdgeLabel = useCallback(
    (id: string, label: string | null) => {
      if (label !== null && canEdit) {
        newStep();
        updateEdges(doc, [id], { label }, LOCAL_ORIGIN);
      }
      setEditing(null);
      requestAnimationFrame(focusCanvas);
    },
    [doc, canEdit, newStep, focusCanvas],
  );

  const editEdgeLabel = useCallback((id: string) => setEditing({ kind: 'edge', id, draft: null }), []);

  const createShape = useCallback(
    (kind: ShapeKind, at: { x: number; y: number }, connectFrom?: { id: string; handle: HandleSide }, text?: string) => {
      if (!canEdit) return;
      const id = newId();
      const size = SHAPE_DEFAULT_SIZE[kind];
      const x = snapping ? snapToGridValue(at.x - size.w / 2) : at.x - size.w / 2;
      const y = snapping ? snapToGridValue(at.y - size.h / 2) : at.y - size.h / 2;
      newStep();
      doc.transact(() => {
        addShape(doc, { id, kind, x, y, text }, LOCAL_ORIGIN);
        if (connectFrom) {
          addEdgeOp(
            doc,
            { id: newId(), source: connectFrom.id, target: id, sourceHandle: connectFrom.handle, targetHandle: opposite(connectFrom.handle) },
            LOCAL_ORIGIN,
          );
        }
      }, LOCAL_ORIGIN);
      setSelection({ shapes: [id], edges: [] });
      if (text === undefined) setEditing({ kind: 'shape', id, draft: '' });
    },
    [doc, canEdit, snapping, newStep],
  );

  /** Clique na paleta: no centro da tela, ou abaixo da forma selecionada, já ligada. */
  const addFromPalette = useCallback(
    (kind: ShapeKind) => {
      const selected = selection.shapes.length === 1 ? diagram.shapes[selection.shapes[0]!] : undefined;
      if (selected) {
        const size = SHAPE_DEFAULT_SIZE[kind];
        createShape(
          kind,
          { x: selected.x + selected.w / 2, y: selected.y + selected.h + 64 + size.h / 2 },
          { id: selected.id, handle: 'bottom' },
        );
        return;
      }
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 0, y: 0 };
      createShape(kind, center);
    },
    [selection.shapes, diagram.shapes, createShape, screenToFlowPosition],
  );

  const removeSelection = useCallback(() => {
    if (!canEdit || (selection.shapes.length === 0 && selection.edges.length === 0)) return;
    newStep();
    deleteElements(doc, selection.shapes, selection.edges, LOCAL_ORIGIN);
    setSelection({ shapes: [], edges: [] });
  }, [doc, canEdit, selection, newStep]);

  const pasteAt = useCallback(
    (text: string) => {
      if (!canEdit) return;
      const parsed = parsePasted(text);
      const at = pointer.current
        ? screenToFlowPosition(pointer.current)
        : { x: 0, y: 0 };
      if (parsed.kind === 'text') {
        createShape('process', at, undefined, parsed.text);
        return;
      }
      if (parsed.kind !== 'clip' || parsed.clip.shapes.length === 0) return;
      const origin = boundingBox(parsed.clip.shapes.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })));
      pasteCount.current += 1;
      const offset = pointer.current
        ? { x: at.x - origin.x - origin.w / 2, y: at.y - origin.y - origin.h / 2 }
        : { x: PASTE_OFFSET * pasteCount.current, y: PASTE_OFFSET * pasteCount.current };
      newStep();
      const created = pasteClip(doc, parsed.clip, offset, newId, LOCAL_ORIGIN);
      setSelection({ shapes: created, edges: [] });
    },
    [doc, canEdit, createShape, screenToFlowPosition, newStep],
  );

  const copySelection = useCallback(
    (e: ClipboardEvent, cut: boolean) => {
      if (selection.shapes.length === 0) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', serializeClip(buildClip(diagram, selection.shapes)));
      pasteCount.current = 0;
      if (cut && canEdit) removeSelection();
    },
    [diagram, selection.shapes, canEdit, removeSelection],
  );

  // Eventos nativos de copiar/colar: não pedem permissão, ao contrário da API de clipboard.
  useEffect(() => {
    const active = () => !!wrapperRef.current && wrapperRef.current.contains(document.activeElement);
    const onCopy = (e: ClipboardEvent) => active() && copySelection(e, false);
    const onCut = (e: ClipboardEvent) => active() && copySelection(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (!active() || editing) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      pasteAt(text);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [copySelection, pasteAt, editing]);

  const duplicateSelection = useCallback(() => {
    if (!canEdit || selection.shapes.length === 0) return;
    const clip = buildClip(diagram, selection.shapes);
    newStep();
    const created = pasteClip(doc, clip, { x: PASTE_OFFSET, y: PASTE_OFFSET }, newId, LOCAL_ORIGIN);
    setSelection({ shapes: created, edges: [] });
  }, [doc, canEdit, diagram, selection.shapes, newStep]);

  const organize = useCallback(async () => {
    if (!canEdit) return;
    setOrganizing(true);
    try {
      const positions = await autoLayout(diagram);
      if (positions.length > 0) {
        // Versão de segurança antes de mexer na posição de tudo (PRD-005 §5.2).
        onCheckpoint?.('Antes de organizar o fluxograma');
        newStep();
        moveShapes(doc, positions, LOCAL_ORIGIN); // uma transação = um Ctrl+Z
      }
    } catch {
      window.alert('Não foi possível organizar agora.');
    } finally {
      setOrganizing(false);
      focusCanvas();
    }
  }, [doc, canEdit, diagram, newStep, focusCanvas, onCheckpoint]);

  // ---------- nós e conectores do React Flow ----------
  const dataCache = useRef(new Map<string, ShapeNodeData>());
  const edgeDataCache = useRef(new Map<string, FlowEdgeData>());

  const nodes = useMemo(() => {
    const selected = new Set(selection.shapes);
    const list: ShapeFlowNode[] = [];
    for (const shape of Object.values(diagram.shapes)) {
      const d = draft[shape.id];
      const w = d?.w ?? shape.w;
      const h = d?.h ?? shape.h;
      list.push({
        id: shape.id,
        type: 'shape',
        position: { x: d?.x ?? shape.x, y: d?.y ?? shape.y },
        width: w,
        height: h,
        measured: { width: w, height: h },
        selected: selected.has(shape.id),
        draggable: canEdit && editing?.id !== shape.id,
        zIndex: Math.round(shape.z),
        data: stableData(dataCache.current, shape.id, {
          kind: shape.kind,
          text: shape.text,
          fill: shape.fill ?? defaults.fill,
          stroke: shape.stroke ?? defaults.stroke,
          ink: shape.ink ?? (shape.fill ? readableInk(shape.fill) : defaults.ink),
          bold: shape.bold ?? false,
          editing: editing?.kind === 'shape' && editing.id === shape.id,
          draft: editing?.kind === 'shape' && editing.id === shape.id ? editing.draft : null,
          canEdit,
          peers: peers.get(shape.id) ?? NO_PEERS,
          onCommit: commitShapeText,
        }),
      });
    }
    return list;
  }, [diagram.shapes, draft, selection.shapes, canEdit, editing, peers, commitShapeText, defaults]);

  const edges = useMemo(() => {
    const selected = new Set(selection.edges);
    return Object.values(diagram.edges).map<DiagramFlowEdge>((edge) => {
      const color = edge.color ?? defaults.stroke;
      const marker = { type: MarkerType.ArrowClosed, color, ...ARROW_SIZE };
      return {
        id: edge.id,
        type: 'flow',
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        selected: selected.has(edge.id),
        reconnectable: canEdit,
        markerEnd: edge.arrow === 'none' ? undefined : marker,
        markerStart: edge.arrow === 'both' ? marker : undefined,
        data: stableData(edgeDataCache.current, edge.id, {
          line: edge.line,
          dashed: !!edge.dashed,
          arrow: edge.arrow,
          color,
          label: edge.label ?? '',
          editing: editing?.kind === 'edge' && editing.id === edge.id,
          canEdit,
          onCommitLabel: commitEdgeLabel,
          onEditLabel: editEdgeLabel,
        }),
      };
    });
  }, [diagram.edges, selection.edges, canEdit, editing, commitEdgeLabel, editEdgeLabel, defaults]);

  // ---------- arrastar, redimensionar, conectar ----------
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const flushDraft = useCallback(() => {
    const current = draftRef.current;
    const positions = Object.entries(current).map(([id, p]) => ({ id, ...p }));
    if (positions.length > 0 && canEdit) {
      newStep();
      moveShapes(doc, positions, LOCAL_ORIGIN);
    }
    setDraft({});
    setGuides([]);
  }, [doc, canEdit, newStep]);

  const onNodesChange = useCallback(
    (changes: NodeChange<ShapeFlowNode>[]) => {
      const selectChanges = changes.filter((c) => c.type === 'select');
      if (selectChanges.length > 0) {
        setSelection((cur) => {
          const next = new Set(cur.shapes);
          for (const c of selectChanges) {
            if (c.selected) next.add(c.id);
            else next.delete(c.id);
          }
          // Selecionar uma forma tira a seleção do conector.
          const edges = selectChanges.some((c) => c.selected) ? [] : cur.edges;
          return { shapes: [...next], edges };
        });
      }
      // NodeResizer: guarda o tamanho durante e grava ao terminar.
      for (const change of changes) {
        if (change.type !== 'dimensions' || !change.dimensions) continue;
        if (change.resizing) {
          setDraft((cur) => ({
            ...cur,
            [change.id]: {
              x: cur[change.id]?.x ?? diagram.shapes[change.id]?.x ?? 0,
              y: cur[change.id]?.y ?? diagram.shapes[change.id]?.y ?? 0,
              w: change.dimensions!.width,
              h: change.dimensions!.height,
            },
          }));
        }
      }
      const positionChanges = changes.filter((c) => c.type === 'position');
      if (positionChanges.some((c) => !c.dragging && c.position)) {
        // Fim do redimensionar (o NodeResizer também move o canto).
        setDraft((cur) => {
          const next = { ...cur };
          for (const c of positionChanges) if (c.position) next[c.id] = { ...next[c.id], ...c.position };
          return next;
        });
      }
      if (changes.some((c) => c.type === 'dimensions' && c.resizing === false)) flushDraft();
    },
    [diagram.shapes, flushDraft],
  );

  const onEdgesChange = useCallback((changes: EdgeChange<DiagramFlowEdge>[]) => {
    const selectChanges = changes.filter((c) => c.type === 'select');
    if (selectChanges.length === 0) return;
    setSelection((cur) => {
      const next = new Set(cur.edges);
      for (const c of selectChanges) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return { ...cur, edges: [...next] };
    });
  }, []);

  const onNodeDrag = useCallback(
    (_: unknown, __: unknown, dragged: ShapeFlowNode[]) => {
      if (!canEdit || dragged.length === 0) return;
      const boxes = dragged.map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 }));
      const moving = boundingBox(boxes);
      const movingIds = new Set(dragged.map((n) => n.id));
      let dx = 0;
      let dy = 0;
      if (snapping) {
        const others = Object.values(diagram.shapes)
          .filter((s) => !movingIds.has(s.id))
          .map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }));
        const snap = alignmentSnap(moving, others, SNAP_THRESHOLD_PX / Math.max(getZoom(), 0.1));
        dx = snap.dx;
        dy = snap.dy;
        setGuides(snap.guides);
      } else {
        setGuides([]);
      }
      setDraft((cur) => {
        const next = { ...cur };
        for (const n of dragged) {
          next[n.id] = { ...next[n.id], x: n.position.x + dx, y: n.position.y + dy };
        }
        return next;
      });
    },
    [canEdit, snapping, diagram.shapes, getZoom],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      newStep();
      addEdgeOp(
        doc,
        {
          id: newId(),
          source: connection.source,
          target: connection.target,
          sourceHandle: (connection.sourceHandle as HandleSide) ?? 'bottom',
          targetHandle: (connection.targetHandle as HandleSide) ?? 'top',
        },
        LOCAL_ORIGIN,
      );
    },
    [doc, canEdit, newStep],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (!canEdit || state.isValid || !state.fromNode) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      setQuickMenu({
        at: { x: point.clientX - (rect?.x ?? 0) + 8, y: point.clientY - (rect?.y ?? 0) + 8 },
        flow: screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        from: { id: state.fromNode.id, handle: (state.fromHandle?.id as HandleSide) ?? 'bottom' },
      });
    },
    [canEdit, screenToFlowPosition],
  );

  const dropShape = useCallback(
    (kind: ShapeKind, at: { x: number; y: number }) => createShape(kind, screenToFlowPosition(at)),
    [createShape, screenToFlowPosition],
  );

  // ---------- atalhos ----------
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== wrapperRef.current && (e.target as HTMLElement).closest('button, a, input, textarea, form')) return;
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    const shape = selection.shapes.length === 1 ? diagram.shapes[selection.shapes[0]!] : undefined;

    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) undo?.redo();
      else undo?.undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      undo?.redo();
      return;
    }
    if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      setSelection({ shapes: Object.keys(diagram.shapes), edges: [] });
      return;
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      duplicateSelection();
      return;
    }
    if (e.key === 'Escape') {
      setSelection({ shapes: [], edges: [] });
      return;
    }
    if (!canEdit || mod) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelection();
    } else if (e.key.startsWith('Arrow') && selection.shapes.length > 0) {
      e.preventDefault();
      const step = (e.shiftKey ? 4 : 1) * 8;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      newStep();
      moveShapes(
        doc,
        selection.shapes.flatMap((id) => {
          const s = diagram.shapes[id];
          return s ? [{ id, x: s.x + dx, y: s.y + dy }] : [];
        }),
        LOCAL_ORIGIN,
      );
    } else if (shape && (e.key === 'F2' || e.key === 'Enter')) {
      e.preventDefault();
      setEditing({ kind: 'shape', id: shape.id, draft: null });
    } else if (shape && e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      setEditing({ kind: 'shape', id: shape.id, draft: e.key });
    } else if (selection.edges.length === 1 && (e.key === 'F2' || e.key === 'Enter')) {
      e.preventDefault();
      editEdgeLabel(selection.edges[0]!);
    }
  };

  const selectedShapes = selection.shapes.flatMap((id) => (diagram.shapes[id] ? [diagram.shapes[id] as Shape] : []));
  const selectedEdge = selection.edges.length === 1 ? diagram.edges[selection.edges[0]!] : undefined;
  const showShapeBar = canEdit && selectedShapes.length > 0 && !editing && Object.keys(draft).length === 0;

  return (
    <div className="flex h-full w-full">
      {canEdit && <ShapePalette onPick={addFromPalette} onDropShape={dropShape} />}
      <div
        ref={wrapperRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerLeave={() => {
          pointer.current = null;
        }}
        className="relative h-full flex-1 outline-none"
        aria-label="Fluxograma. Use Tab para a paleta de formas."
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={28}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          edgesReconnectable={canEdit}
          elementsSelectable
          selectionOnDrag
          panOnDrag={[1]}
          panActivationKeyCode="Space"
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          snapToGrid={snapping}
          snapGrid={[GRID, GRID]}
          onlyRenderVisibleElements
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={flushDraft}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onReconnect={(oldEdge, connection) => {
            if (!canEdit) return;
            newStep();
            reconnectEdge(
              doc,
              oldEdge.id,
              {
                source: connection.source,
                target: connection.target,
                sourceHandle: (connection.sourceHandle as HandleSide) ?? 'bottom',
                targetHandle: (connection.targetHandle as HandleSide) ?? 'top',
              },
              LOCAL_ORIGIN,
            );
          }}
          onNodeClick={(e, n) => {
            // Ver SPEC-002 §5.8: o segundo clique de um duplo clique vem com detail >= 2.
            if (canEdit && e.detail >= 2) {
              setEditing({ kind: 'shape', id: n.id, draft: null });
              return;
            }
            focusCanvas();
          }}
          onNodeDoubleClick={(_, n) => canEdit && setEditing({ kind: 'shape', id: n.id, draft: null })}
          onEdgeClick={(_, edge) => {
            setSelection({ shapes: [], edges: [edge.id] });
            focusCanvas();
          }}
          onEdgeDoubleClick={(_, edge) => canEdit && editEdgeLabel(edge.id)}
          onPaneClick={() => {
            setSelection({ shapes: [], edges: [] });
            setQuickMenu(null);
            focusCanvas();
          }}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="var(--grid)" />
          <DiagramControls
            undo={undo}
            canEdit={canEdit}
            snapToGrid={grid}
            onToggleGrid={() => setGrid((g) => !g)}
            onOrganize={organize}
            organizing={organizing}
            onAfter={focusCanvas}
          />
          {showShapeBar && (
            <ShapeSelectionBar
              shapes={selectedShapes}
              palette={theme.branches}
              defaults={defaults}
              actions={{
                setFill: (fill) => {
                  newStep();
                  updateShapes(doc, selection.shapes, { fill }, LOCAL_ORIGIN);
                },
                setStroke: (stroke) => {
                  newStep();
                  updateShapes(doc, selection.shapes, { stroke }, LOCAL_ORIGIN);
                },
                setInk: (ink) => {
                  newStep();
                  updateShapes(doc, selection.shapes, { ink }, LOCAL_ORIGIN);
                },
                toggleBold: () => {
                  newStep();
                  updateShapes(doc, selection.shapes, { bold: !selectedShapes.every((s) => s.bold) }, LOCAL_ORIGIN);
                },
                duplicate: duplicateSelection,
                remove: removeSelection,
              }}
            />
          )}
          <Guides guides={guides} />
        </ReactFlow>

        {canEdit && selectedEdge && !editing && (
          <EdgeSelectionBar
            edge={selectedEdge}
            palette={theme.branches}
            defaultColor={defaults.stroke}
            actions={{
              setLine: (line) => {
                newStep();
                updateEdges(doc, [selectedEdge.id], { line }, LOCAL_ORIGIN);
              },
              setArrow: (arrow) => {
                newStep();
                updateEdges(doc, [selectedEdge.id], { arrow }, LOCAL_ORIGIN);
              },
              toggleDashed: () => {
                newStep();
                updateEdges(doc, [selectedEdge.id], { dashed: !selectedEdge.dashed }, LOCAL_ORIGIN);
              },
              setColor: (color) => {
                newStep();
                updateEdges(doc, [selectedEdge.id], { color }, LOCAL_ORIGIN);
              },
              editLabel: () => editEdgeLabel(selectedEdge.id),
              remove: removeSelection,
            }}
          />
        )}

        {quickMenu && (
          <QuickShapeMenu
            at={quickMenu.at}
            onClose={() => setQuickMenu(null)}
            onPick={(kind) => {
              setQuickMenu(null);
              createShape(kind, quickMenu.flow, quickMenu.from);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Guides({ guides }: { guides: Guide[] }) {
  if (guides.length === 0) return null;
  return (
    <ViewportPortal>
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.pos}-${i}`}
          className="export-hidden pointer-events-none absolute bg-brand"
          style={
            g.axis === 'v'
              ? { left: g.pos, top: g.from, width: 1, height: g.to - g.from }
              : { left: g.from, top: g.pos, height: 1, width: g.to - g.from }
          }
        />
      ))}
    </ViewportPortal>
  );
}

function opposite(handle: HandleSide): HandleSide {
  return handle === 'top' ? 'bottom' : handle === 'bottom' ? 'top' : handle === 'left' ? 'right' : 'left';
}

type PeerSelection = Map<string, Array<{ name: string; color: string }>>;

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
