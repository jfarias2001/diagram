import { type Edge, type Node, ReactFlow, type ReactFlowProps } from '@xyflow/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DUR, easeOutCubic } from '../../../lib/motion';
import { registerSettler } from '../../export/renderAll';
import { lerpPoint, MAX_ANIMATED, planTransition, type Point } from './planTransition';

// SPEC-009 §5.6.2 — o quadro que flui.
//
// Recebe os nós no lugar FINAL (como sempre) e desenha, a cada frame, os que
// mudaram de lugar no meio do caminho. O resto mantém a mesma referência de
// objeto, então o React Flow nem os toca. As ligações seguem sozinhas: o
// React Flow calcula a ponta de cada aresta pela posição do nó.
//
// Fica num componente próprio para que, a cada frame, só ELE re-renderize —
// nunca o MindMapCanvas inteiro.

interface Track {
  from: Point;
  to: Point;
  start: number;
}

interface Ghost<N extends Node, E extends Edge> {
  from: Point;
  to: Point;
  start: number;
  pos: Point;
  node: N;
  edges: E[];
}

export const GHOST_PREFIX = 'ghost:';

type AnimatedProps<N extends Node, E extends Edge> = ReactFlowProps<N, E> & {
  /** Desligado: posição direta (arrasto, modo versão, "reduzir movimento"). */
  animate: boolean;
  /**
   * Mapa mental: o pai de um nó é a origem da ligação que chega nele — nó novo
   * sai do pai, ramo recolhido volta para ele. Fluxograma: sem hierarquia.
   */
  hierarchy: boolean;
  minDistance?: number;
  onAnimatingChange?: (animating: boolean) => void;
};

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

export function AnimatedReactFlow<N extends Node, E extends Edge>({
  nodes = [],
  edges = [],
  animate,
  hierarchy,
  minDistance = 2,
  onAnimatingChange,
  ...rest
}: AnimatedProps<N, E>) {
  const shown = useRef(new Map<string, Point>());
  const tracks = useRef(new Map<string, Track>());
  const born = useRef(new Map<string, number>()); // id → até quando marca "nasceu"
  const ghosts = useRef(new Map<string, Ghost<N, E>>());
  const lastNodes = useRef(new Map<string, N>());
  const lastEdgesByTarget = useRef(new Map<string, E[]>());
  const lastParent = useRef(new Map<string, string>());
  const initialized = useRef(false);
  const frame = useRef<number | null>(null);
  const waiters = useRef<Array<() => void>>([]);
  const animating = useRef(false);
  const notify = useRef(onAnimatingChange);
  notify.current = onAnimatingChange;
  const [tick, setTick] = useState(0);

  const busy = () => tracks.current.size > 0 || ghosts.current.size > 0 || born.current.size > 0;

  const setAnimating = (value: boolean) => {
    if (animating.current === value) return;
    animating.current = value;
    notify.current?.(value);
    if (!value) {
      const pending = waiters.current;
      waiters.current = [];
      pending.forEach((resolve) => resolve());
    }
  };

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const step = () => {
    const now = performance.now();
    for (const [id, track] of tracks.current) {
      const t = (now - track.start) / DUR.base;
      if (t >= 1) {
        shown.current.set(id, track.to);
        tracks.current.delete(id);
      } else shown.current.set(id, lerpPoint(track.from, track.to, easeOutCubic(t)));
    }
    for (const [id, ghost] of ghosts.current) {
      const t = (now - ghost.start) / DUR.fast;
      if (t >= 1) ghosts.current.delete(id);
      else ghost.pos = lerpPoint(ghost.from, ghost.to, easeOutCubic(t));
    }
    for (const [id, until] of born.current) if (now >= until && !tracks.current.has(id)) born.current.delete(id);
    setTick((n) => n + 1);
    if (busy()) frame.current = requestAnimationFrame(step);
    else {
      frame.current = null;
      setAnimating(false);
    }
  };

  // Antes de pintar: o primeiro frame já sai da posição antiga (sem piscar no destino).
  useLayoutEffect(() => {
    const next = new Map<string, Point>(nodes.map((n) => [n.id, n.position]));
    const parentNow = new Map<string, string>();
    if (hierarchy) for (const e of edges) parentNow.set(e.target, e.source);
    const parentOf = (id: string) => parentNow.get(id) ?? lastParent.current.get(id) ?? null;

    const remember = () => {
      lastNodes.current = new Map(nodes.map((n) => [n.id, n]));
      const byTarget = new Map<string, E[]>();
      for (const e of edges) byTarget.set(e.target, [...(byTarget.get(e.target) ?? []), e]);
      lastEdgesByTarget.current = byTarget;
      lastParent.current = parentNow;
    };

    if (!initialized.current || !animate) {
      initialized.current = true;
      stop();
      shown.current = next;
      tracks.current.clear();
      ghosts.current.clear();
      born.current.clear();
      remember();
      setAnimating(false);
      return;
    }

    const plan = planTransition({
      shown: shown.current,
      next,
      parentOf,
      maxAnimated: MAX_ANIMATED,
      minDistance,
    });
    if (!plan.animate) {
      stop();
      shown.current = next;
      tracks.current.clear();
      ghosts.current.clear();
      born.current.clear();
      remember();
      setTick((n) => n + 1);
      setAnimating(false);
      return;
    }

    const now = performance.now();
    // Quem já vai para o mesmo destino continua no ritmo dele.
    for (const [id, track] of plan.tracks) {
      const current = tracks.current.get(id);
      if (current && same(current.to, track.to)) continue;
      tracks.current.set(id, { ...track, start: now });
    }
    for (const [id, track] of tracks.current) {
      const target = next.get(id);
      if (!target) tracks.current.delete(id);
      else if (!same(track.to, target) && !plan.tracks.has(id)) {
        tracks.current.delete(id);
        shown.current.set(id, target);
      }
    }
    for (const id of plan.born) born.current.set(id, now + DUR.fast);
    for (const ghost of plan.ghosts) {
      const node = lastNodes.current.get(ghost.id);
      if (!node) continue;
      ghosts.current.set(ghost.id, {
        ...ghost,
        start: now,
        pos: ghost.from,
        node,
        edges: lastEdgesByTarget.current.get(ghost.id) ?? [],
      });
    }
    for (const id of next.keys()) ghosts.current.delete(id); // reapareceu
    // Quem não anda fica no destino; quem saiu da tela sai do mapa de posições.
    for (const [id, point] of next) if (!tracks.current.has(id)) shown.current.set(id, point);
    for (const id of [...shown.current.keys()]) if (!next.has(id)) shown.current.delete(id);
    remember();

    if (busy()) {
      setAnimating(true);
      if (frame.current === null) frame.current = requestAnimationFrame(step);
    }
    setTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- planeja só quando os alvos mudam
  }, [nodes, edges, animate]);

  useEffect(() => stop, []);

  // A exportação espera o quadro assentar antes da foto (SPEC-009 §5.8).
  useEffect(
    () =>
      registerSettler(() =>
        animating.current ? new Promise<void>((resolve) => waiters.current.push(resolve)) : Promise.resolve(),
      ),
    [],
  );

  const out = useMemo(() => {
    if (!busy()) return { nodes, edges };
    const outNodes: N[] = nodes.map((n) => {
      const moving = tracks.current.has(n.id);
      const isBorn = born.current.has(n.id);
      if (!moving && !isBorn) return n;
      return {
        ...n,
        position: moving ? (shown.current.get(n.id) ?? n.position) : n.position,
        className: [n.className, isBorn ? 'node-born' : ''].filter(Boolean).join(' '),
      };
    });
    const outEdges: E[] = [...edges];
    const now = performance.now();
    for (const [id, ghost] of ghosts.current) {
      const fade = 1 - easeOutCubic((now - ghost.start) / DUR.fast);
      outNodes.push({
        ...ghost.node,
        id: GHOST_PREFIX + id,
        position: ghost.pos,
        selected: false,
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
        className: 'node-ghost',
        style: { ...ghost.node.style, opacity: fade },
      });
      for (const e of ghost.edges) {
        outEdges.push({
          ...e,
          id: GHOST_PREFIX + e.id,
          source: ghosts.current.has(e.source) ? GHOST_PREFIX + e.source : e.source,
          target: GHOST_PREFIX + id,
          selected: false,
          selectable: false,
          focusable: false,
          style: { ...e.style, opacity: fade },
        });
      }
    }
    return { nodes: outNodes, edges: outEdges };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` avança o frame
  }, [nodes, edges, tick]);

  return <ReactFlow<N, E> {...rest} nodes={out.nodes} edges={out.edges} />;
}
