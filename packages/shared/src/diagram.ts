import * as Y from 'yjs';
import { z } from 'zod';

// Fluxograma no Y.Doc (SPEC-003 §2.2): dois mapas planos, `shapes` e `edges`.
// Toda escrita passa por aqui; toda leitura é defensiva.

export const SHAPE_KINDS = [
  'process',
  'terminator',
  'decision',
  'io',
  'document',
  'database',
  'subprocess',
  'text',
  'note',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const HANDLES = ['top', 'right', 'bottom', 'left'] as const;
export type HandleSide = (typeof HANDLES)[number];

export const EDGE_LINES = ['straight', 'orthogonal', 'curved'] as const;
export type EdgeLine = (typeof EDGE_LINES)[number];

export const EDGE_ARROWS = ['end', 'none', 'both'] as const;
export type EdgeArrow = (typeof EDGE_ARROWS)[number];

export const SHAPE_TEXT_MAX = 2_000;
export const EDGE_LABEL_MAX = 200;
export const SHAPE_MIN_SIZE = 24;
export const SHAPE_MAX_SIZE = 2_000;
export const COORD_MAX = 1_000_000;
export const CLIP_MAX_SHAPES = 500;
export const CLIP_MAX_EDGES = 1_000;

export const SHAPE_DEFAULT_SIZE: Record<ShapeKind, { w: number; h: number }> = {
  process: { w: 160, h: 72 },
  terminator: { w: 160, h: 56 },
  decision: { w: 150, h: 100 },
  io: { w: 170, h: 72 },
  document: { w: 160, h: 84 },
  database: { w: 120, h: 96 },
  subprocess: { w: 170, h: 72 },
  text: { w: 160, h: 40 },
  note: { w: 180, h: 130 },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const idSchema = z.string().min(1).max(64);
const coord = z.number().finite().min(-COORD_MAX).max(COORD_MAX);
const size = z.number().finite().min(SHAPE_MIN_SIZE).max(SHAPE_MAX_SIZE);
const color = z.string().regex(HEX);

export const shapeSchema = z.object({
  id: idSchema,
  kind: z.enum(SHAPE_KINDS),
  x: coord,
  y: coord,
  w: size,
  h: size,
  text: z.string().max(SHAPE_TEXT_MAX),
  fill: color.optional(),
  stroke: color.optional(),
  bold: z.boolean().optional(),
  z: z.number().finite(),
});
export type Shape = z.infer<typeof shapeSchema>;

export const edgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  sourceHandle: z.enum(HANDLES),
  targetHandle: z.enum(HANDLES),
  label: z.string().max(EDGE_LABEL_MAX).optional(),
  line: z.enum(EDGE_LINES),
  dashed: z.boolean().optional(),
  arrow: z.enum(EDGE_ARROWS),
  color: color.optional(),
});
export type FlowEdgeRecord = z.infer<typeof edgeSchema>;

/** Conteúdo da área de transferência (SPEC-003 §5.7) — entrada externa, sempre validada. */
export const diagramClipSchema = z.object({
  paglamp: z.literal('diagram-clip'),
  v: z.literal(1),
  shapes: z.array(shapeSchema).max(CLIP_MAX_SHAPES),
  edges: z.array(edgeSchema).max(CLIP_MAX_EDGES),
});
export type DiagramClip = z.infer<typeof diagramClipSchema>;

export interface DiagramSnapshot {
  shapes: Record<string, Shape>;
  edges: Record<string, FlowEdgeRecord>;
}

type YEl = Y.Map<unknown>;

export function shapesMap(doc: Y.Doc): Y.Map<YEl> {
  return doc.getMap<YEl>('shapes');
}

export function edgesMap(doc: Y.Doc): Y.Map<YEl> {
  return doc.getMap<YEl>('edges');
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

function readShape(id: string, y: YEl): Shape | null {
  const kind = y.get('kind');
  if (typeof kind !== 'string' || !(SHAPE_KINDS as readonly string[]).includes(kind)) return null;
  const x = num(y.get('x'));
  const yy = num(y.get('y'));
  const w = num(y.get('w'));
  const h = num(y.get('h'));
  if (x === null || yy === null || w === null || h === null) return null;
  if (Math.abs(x) > COORD_MAX || Math.abs(yy) > COORD_MAX) return null;
  if (w < SHAPE_MIN_SIZE || w > SHAPE_MAX_SIZE || h < SHAPE_MIN_SIZE || h > SHAPE_MAX_SIZE) return null;
  const text = y.get('text');
  const shape: Shape = {
    id,
    kind: kind as ShapeKind,
    x,
    y: yy,
    w,
    h,
    text: typeof text === 'string' ? text.slice(0, SHAPE_TEXT_MAX) : '',
    z: num(y.get('z')) ?? 0,
  };
  const fill = y.get('fill');
  if (typeof fill === 'string' && HEX.test(fill)) shape.fill = fill;
  const stroke = y.get('stroke');
  if (typeof stroke === 'string' && HEX.test(stroke)) shape.stroke = stroke;
  if (y.get('bold') === true) shape.bold = true;
  return shape;
}

function readEdge(id: string, y: YEl): FlowEdgeRecord | null {
  const source = y.get('source');
  const target = y.get('target');
  if (typeof source !== 'string' || typeof target !== 'string' || source === target) return null;
  const edge: FlowEdgeRecord = {
    id,
    source,
    target,
    sourceHandle: pick(y.get('sourceHandle'), HANDLES, 'bottom'),
    targetHandle: pick(y.get('targetHandle'), HANDLES, 'top'),
    line: pick(y.get('line'), EDGE_LINES, 'orthogonal'),
    arrow: pick(y.get('arrow'), EDGE_ARROWS, 'end'),
  };
  const label = y.get('label');
  if (typeof label === 'string' && label) edge.label = label.slice(0, EDGE_LABEL_MAX);
  if (y.get('dashed') === true) edge.dashed = true;
  const c = y.get('color');
  if (typeof c === 'string' && HEX.test(c)) edge.color = c;
  return edge;
}

/** Snapshot imutável. Formas malformadas e conectores soltos não aparecem. */
export function readDiagram(doc: Y.Doc): DiagramSnapshot {
  const shapes: Record<string, Shape> = {};
  shapesMap(doc).forEach((y, id) => {
    if (!(y instanceof Y.Map)) return;
    const shape = readShape(id, y);
    if (shape) shapes[id] = shape;
  });
  const edges: Record<string, FlowEdgeRecord> = {};
  edgesMap(doc).forEach((y, id) => {
    if (!(y instanceof Y.Map)) return;
    const edge = readEdge(id, y);
    if (edge && shapes[edge.source] && shapes[edge.target]) edges[id] = edge;
  });
  return { shapes, edges };
}

export function createDiagramDoc(): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    const meta = doc.getMap('meta');
    meta.set('version', 1);
    meta.set('kind', 'DIAGRAM');
    shapesMap(doc);
    edgesMap(doc);
  });
  return doc;
}

function writeShape(map: Y.Map<YEl>, shape: Shape) {
  const y = new Y.Map<unknown>();
  y.set('kind', shape.kind);
  y.set('x', clamp(shape.x, -COORD_MAX, COORD_MAX));
  y.set('y', clamp(shape.y, -COORD_MAX, COORD_MAX));
  y.set('w', clamp(shape.w, SHAPE_MIN_SIZE, SHAPE_MAX_SIZE));
  y.set('h', clamp(shape.h, SHAPE_MIN_SIZE, SHAPE_MAX_SIZE));
  y.set('text', shape.text.slice(0, SHAPE_TEXT_MAX));
  y.set('z', shape.z);
  if (shape.fill && HEX.test(shape.fill)) y.set('fill', shape.fill);
  if (shape.stroke && HEX.test(shape.stroke)) y.set('stroke', shape.stroke);
  if (shape.bold) y.set('bold', true);
  map.set(shape.id, y);
}

function writeEdge(map: Y.Map<YEl>, edge: FlowEdgeRecord) {
  const y = new Y.Map<unknown>();
  y.set('source', edge.source);
  y.set('target', edge.target);
  y.set('sourceHandle', edge.sourceHandle);
  y.set('targetHandle', edge.targetHandle);
  y.set('line', edge.line);
  y.set('arrow', edge.arrow);
  if (edge.label) y.set('label', edge.label.slice(0, EDGE_LABEL_MAX));
  if (edge.dashed) y.set('dashed', true);
  if (edge.color && HEX.test(edge.color)) y.set('color', edge.color);
  map.set(edge.id, y);
}

const maxZ = (snap: DiagramSnapshot) => Object.values(snap.shapes).reduce((m, s) => Math.max(m, s.z), 0);

// ---------- operações (sempre dentro de uma transação com `origin`) ----------

export interface AddShapeInput {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  text?: string;
  w?: number;
  h?: number;
}

export function addShape(doc: Y.Doc, input: AddShapeInput, origin?: unknown): boolean {
  if (shapesMap(doc).has(input.id)) return false;
  const size = SHAPE_DEFAULT_SIZE[input.kind];
  const z = maxZ(readDiagram(doc)) + 1;
  doc.transact(() => {
    writeShape(shapesMap(doc), {
      id: input.id,
      kind: input.kind,
      x: input.x,
      y: input.y,
      w: input.w ?? size.w,
      h: input.h ?? size.h,
      text: input.text ?? '',
      z,
      ...(input.kind === 'note' ? { fill: '#fff3bf' } : {}),
    });
  }, origin);
  return true;
}

export type ShapePatch = Partial<Pick<Shape, 'text' | 'fill' | 'stroke' | 'bold'>>;

/** `fill: ''` / `stroke: ''` voltam ao padrão. Cores que não são hex são ignoradas. */
export function updateShapes(doc: Y.Doc, ids: string[], patch: ShapePatch, origin?: unknown): boolean {
  const map = shapesMap(doc);
  const targets = ids.map((id) => map.get(id)).filter((y): y is YEl => y instanceof Y.Map);
  if (targets.length === 0) return false;
  doc.transact(() => {
    for (const y of targets) {
      if (patch.text !== undefined) y.set('text', patch.text.slice(0, SHAPE_TEXT_MAX));
      for (const key of ['fill', 'stroke'] as const) {
        const value = patch[key];
        if (value === undefined) continue;
        if (value === '') y.delete(key);
        else if (HEX.test(value)) y.set(key, value);
      }
      if (patch.bold !== undefined) {
        if (patch.bold) y.set('bold', true);
        else y.delete('bold');
      }
    }
  }, origin);
  return true;
}

/** Grava várias posições (e tamanhos, se vierem) numa transação só. */
export function moveShapes(
  doc: Y.Doc,
  positions: Array<{ id: string; x: number; y: number; w?: number; h?: number }>,
  origin?: unknown,
): void {
  const map = shapesMap(doc);
  doc.transact(() => {
    for (const p of positions) {
      const y = map.get(p.id);
      if (!(y instanceof Y.Map) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      y.set('x', clamp(p.x, -COORD_MAX, COORD_MAX));
      y.set('y', clamp(p.y, -COORD_MAX, COORD_MAX));
      if (p.w !== undefined && Number.isFinite(p.w)) y.set('w', clamp(p.w, SHAPE_MIN_SIZE, SHAPE_MAX_SIZE));
      if (p.h !== undefined && Number.isFinite(p.h)) y.set('h', clamp(p.h, SHAPE_MIN_SIZE, SHAPE_MAX_SIZE));
    }
  }, origin);
}

/** Apaga formas e conectores; os conectores ligados às formas apagadas vão junto (CLAUDE.md §7). */
export function deleteElements(doc: Y.Doc, shapeIds: string[], edgeIds: string[], origin?: unknown): void {
  const removed = new Set(shapeIds);
  const edges = edgesMap(doc);
  const cascade: string[] = [];
  edges.forEach((y, id) => {
    if (!(y instanceof Y.Map)) return;
    if (removed.has(y.get('source') as string) || removed.has(y.get('target') as string)) cascade.push(id);
  });
  doc.transact(() => {
    for (const id of shapeIds) shapesMap(doc).delete(id);
    for (const id of new Set([...edgeIds, ...cascade])) edges.delete(id);
  }, origin);
}

export interface AddEdgeInput {
  id: string;
  source: string;
  target: string;
  sourceHandle?: HandleSide;
  targetHandle?: HandleSide;
  label?: string;
}

/** Recusa ponta inexistente e ligação de uma forma com ela mesma. */
export function addEdge(doc: Y.Doc, input: AddEdgeInput, origin?: unknown): boolean {
  const shapes = shapesMap(doc);
  if (input.source === input.target || !shapes.has(input.source) || !shapes.has(input.target)) return false;
  if (edgesMap(doc).has(input.id)) return false;
  doc.transact(() => {
    writeEdge(edgesMap(doc), {
      id: input.id,
      source: input.source,
      target: input.target,
      sourceHandle: input.sourceHandle ?? 'bottom',
      targetHandle: input.targetHandle ?? 'top',
      line: 'orthogonal',
      arrow: 'end',
      ...(input.label ? { label: input.label } : {}),
    });
  }, origin);
  return true;
}

export type EdgePatch = Partial<Pick<FlowEdgeRecord, 'label' | 'line' | 'dashed' | 'arrow' | 'color'>>;

export function updateEdges(doc: Y.Doc, ids: string[], patch: EdgePatch, origin?: unknown): boolean {
  const map = edgesMap(doc);
  const targets = ids.map((id) => map.get(id)).filter((y): y is YEl => y instanceof Y.Map);
  if (targets.length === 0) return false;
  doc.transact(() => {
    for (const y of targets) {
      if (patch.label !== undefined) {
        if (patch.label) y.set('label', patch.label.slice(0, EDGE_LABEL_MAX));
        else y.delete('label');
      }
      if (patch.line && (EDGE_LINES as readonly string[]).includes(patch.line)) y.set('line', patch.line);
      if (patch.arrow && (EDGE_ARROWS as readonly string[]).includes(patch.arrow)) y.set('arrow', patch.arrow);
      if (patch.dashed !== undefined) {
        if (patch.dashed) y.set('dashed', true);
        else y.delete('dashed');
      }
      if (patch.color !== undefined) {
        if (patch.color === '') y.delete('color');
        else if (HEX.test(patch.color)) y.set('color', patch.color);
      }
    }
  }, origin);
  return true;
}

/** Troca uma ou as duas pontas de um conector (arrastar a ponta). */
export function reconnectEdge(
  doc: Y.Doc,
  id: string,
  ends: { source: string; target: string; sourceHandle: HandleSide; targetHandle: HandleSide },
  origin?: unknown,
): boolean {
  const y = edgesMap(doc).get(id);
  const shapes = shapesMap(doc);
  if (!(y instanceof Y.Map) || ends.source === ends.target) return false;
  if (!shapes.has(ends.source) || !shapes.has(ends.target)) return false;
  doc.transact(() => {
    y.set('source', ends.source);
    y.set('target', ends.target);
    y.set('sourceHandle', ends.sourceHandle);
    y.set('targetHandle', ends.targetHandle);
  }, origin);
  return true;
}

/** Monta o clip das formas pedidas + conectores com as duas pontas dentro delas. */
export function buildClip(snap: DiagramSnapshot, shapeIds: Iterable<string>): DiagramClip {
  const ids = new Set(shapeIds);
  return {
    paglamp: 'diagram-clip',
    v: 1,
    shapes: [...ids].map((id) => snap.shapes[id]).filter((s): s is Shape => !!s),
    edges: Object.values(snap.edges).filter((e) => ids.has(e.source) && ids.has(e.target)),
  };
}

/**
 * Cola um clip já validado: ids sempre novos (o colado nunca é reaproveitado),
 * conectores remapeados, deslocamento aplicado. Retorna os ids das formas novas.
 */
export function pasteClip(
  doc: Y.Doc,
  clip: DiagramClip,
  offset: { x: number; y: number },
  newId: () => string,
  origin?: unknown,
): string[] {
  const idMap = new Map<string, string>();
  for (const s of clip.shapes) idMap.set(s.id, newId());
  let z = maxZ(readDiagram(doc));
  const sorted = [...clip.shapes].sort((a, b) => a.z - b.z);
  doc.transact(() => {
    for (const s of sorted) {
      writeShape(shapesMap(doc), { ...s, id: idMap.get(s.id)!, x: s.x + offset.x, y: s.y + offset.y, z: ++z });
    }
    for (const e of clip.edges) {
      const source = idMap.get(e.source);
      const target = idMap.get(e.target);
      if (!source || !target || source === target) continue;
      writeEdge(edgesMap(doc), { ...e, id: newId(), source, target });
    }
  }, origin);
  return [...idMap.values()];
}

/** Conectores soltos (ponta que não existe) — apagados pelo reparo. Determinístico. */
export function danglingEdges(doc: Y.Doc): string[] {
  const shapes = shapesMap(doc);
  const out: string[] = [];
  edgesMap(doc).forEach((y, id) => {
    if (!(y instanceof Y.Map)) return out.push(id);
    const s = y.get('source');
    const t = y.get('target');
    if (typeof s !== 'string' || typeof t !== 'string' || s === t || !shapes.has(s) || !shapes.has(t)) out.push(id);
  });
  return out.sort();
}

export function repairDiagram(doc: Y.Doc, origin?: unknown): number {
  const dangling = danglingEdges(doc);
  if (dangling.length === 0) return 0;
  doc.transact(() => {
    for (const id of dangling) edgesMap(doc).delete(id);
  }, origin);
  return dangling.length;
}

export function extractDiagramSearchText(snap: DiagramSnapshot, max = 10_000): string {
  const parts: string[] = [];
  let size = 0;
  const texts = [...Object.values(snap.shapes).map((s) => s.text), ...Object.values(snap.edges).map((e) => e.label ?? '')];
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    parts.push(text);
    size += text.length + 1;
    if (size >= max) break;
  }
  return parts.join(' ').slice(0, max);
}
