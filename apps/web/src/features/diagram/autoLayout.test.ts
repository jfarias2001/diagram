import { addEdge, addShape, createDiagramDoc, readDiagram } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import { autoLayout } from './autoLayout';

describe('Organizar (SPEC-003 §5.4)', () => {
  it('põe o fluxo de cima para baixo, sem sobreposição', async () => {
    const doc = createDiagramDoc();
    // Tudo empilhado no mesmo ponto: bagunça total.
    addShape(doc, { id: 'a', kind: 'terminator', x: 0, y: 0 });
    addShape(doc, { id: 'b', kind: 'decision', x: 0, y: 0 });
    addShape(doc, { id: 'c', kind: 'process', x: 0, y: 0 });
    addShape(doc, { id: 'd', kind: 'process', x: 0, y: 0 });
    addEdge(doc, { id: 'e1', source: 'a', target: 'b' });
    addEdge(doc, { id: 'e2', source: 'b', target: 'c' });
    addEdge(doc, { id: 'e3', source: 'b', target: 'd' });
    const snap = readDiagram(doc);

    const result = new Map((await autoLayout(snap)).map((p) => [p.id, p]));
    expect(result.size).toBe(4);
    expect(result.get('a')!.y).toBeLessThan(result.get('b')!.y);
    expect(result.get('b')!.y).toBeLessThan(result.get('c')!.y);
    expect(result.get('c')!.y).toBe(result.get('d')!.y); // mesma camada

    const boxes = [...result.entries()].map(([id, p]) => ({ ...p, w: snap.shapes[id]!.w, h: snap.shapes[id]!.h }));
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
    for (const p of result.values()) {
      expect(p.x % 16).toBe(0);
      expect(p.y % 16).toBe(0);
    }
  });
});
