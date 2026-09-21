import { addNode, createMindMapDoc, readNodes, updateNode } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import { layoutMindMap } from './layout';

// SPEC-001 §7 — orçamento de desempenho: 1.000+ nós sem travar a digitação.
// Cada tecla digitada num nó dispara readNodes + layout; os dois juntos
// precisam caber folgados num frame (16 ms), mesmo em máquina de CI.

function bigMap(total: number) {
  const doc = createMindMapDoc('Mapa grande');
  const ids = ['root'];
  for (let i = 0; i < total; i++) {
    const parent = ids[Math.floor(i / 6)] ?? 'root'; // ~6 filhos por nó
    const id = `n${i}`;
    addNode(doc, { id, parentId: parent, text: `Tópico ${i} com algum texto` });
    ids.push(id);
  }
  return doc;
}

describe('desempenho com 1.000 nós', () => {
  it('ler + fazer o layout de 1.000 nós leva menos de 50 ms', () => {
    const doc = bigMap(1000);
    // aquecimento (JIT)
    layoutMindMap(readNodes(doc));

    const runs: number[] = [];
    for (let i = 0; i < 10; i++) {
      updateNode(doc, 'n500', { text: `edição ${i}` });
      const start = performance.now();
      const positioned = layoutMindMap(readNodes(doc));
      runs.push(performance.now() - start);
      expect(positioned).toHaveLength(1001);
    }
    runs.sort((a, b) => a - b);
    const median = runs[Math.floor(runs.length / 2)]!;
    expect(median).toBeLessThan(50);
  });
});
