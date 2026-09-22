import { addEdge, addShape, createDiagramDoc, readDiagram } from '@diagram/shared';
import { describe, expect, it } from 'vitest';

// SPEC-003 §5.5 — orçamento de desempenho: 500 formas e 600 conectores.
// Cada alteração dispara readDiagram + montagem dos nós/conectores do React Flow;
// os dois juntos precisam caber num frame com folga.

function bigFlow(shapes: number) {
  const doc = createDiagramDoc();
  for (let i = 0; i < shapes; i++) {
    addShape(doc, {
      id: `s${i}`,
      kind: i % 5 === 0 ? 'decision' : 'process',
      x: (i % 20) * 240,
      y: Math.floor(i / 20) * 160,
      text: `Etapa ${i} do processo`,
    });
    if (i > 0) addEdge(doc, { id: `e${i}`, source: `s${i - 1}`, target: `s${i}`, label: i % 5 === 0 ? 'Sim' : '' });
    if (i > 20) addEdge(doc, { id: `x${i}`, source: `s${i - 20}`, target: `s${i}` });
  }
  return doc;
}

/** Mesma montagem que o DiagramCanvas faz no useMemo. */
function buildFlow(snap: ReturnType<typeof readDiagram>) {
  const nodes = Object.values(snap.shapes).map((s) => ({
    id: s.id,
    type: 'shape',
    position: { x: s.x, y: s.y },
    width: s.w,
    height: s.h,
    measured: { width: s.w, height: s.h },
    data: { kind: s.kind, text: s.text, fill: s.fill ?? '#fff', stroke: s.stroke ?? '#475467', bold: !!s.bold },
  }));
  const edges = Object.values(snap.edges).map((e) => ({
    id: e.id,
    type: 'flow',
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    data: { line: e.line, label: e.label ?? '' },
  }));
  return { nodes, edges };
}

describe('desempenho do fluxograma', () => {
  it('ler + montar 500 formas e 900+ conectores leva menos de 50 ms', () => {
    const doc = bigFlow(500);
    const snapshot = readDiagram(doc);
    expect(Object.keys(snapshot.shapes)).toHaveLength(500);
    expect(Object.keys(snapshot.edges).length).toBeGreaterThan(600);
    buildFlow(snapshot); // aquecimento (JIT)

    const runs: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      const flow = buildFlow(readDiagram(doc));
      runs.push(performance.now() - start);
      expect(flow.nodes).toHaveLength(500);
    }
    runs.sort((a, b) => a - b);
    expect(runs[Math.floor(runs.length / 2)]!).toBeLessThan(50);
  });
});
