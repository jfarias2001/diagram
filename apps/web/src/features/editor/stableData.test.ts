import { describe, expect, it } from 'vitest';
import { stableData } from './stableData';

describe('stableData (SPEC-002 §5.4)', () => {
  it('mantém a mesma referência quando nada mudou', () => {
    const cache = new Map<string, Record<string, unknown>>();
    const peers: unknown[] = [];
    const onAdd = () => {};
    const first = stableData(cache, 'a', { text: 'A', peers, onAdd });
    const again = stableData(cache, 'a', { text: 'A', peers, onAdd });
    expect(again).toBe(first);
  });

  it('troca a referência só do nó que mudou', () => {
    const cache = new Map<string, Record<string, unknown>>();
    const a1 = stableData(cache, 'a', { text: 'A', selected: false });
    const b1 = stableData(cache, 'b', { text: 'B', selected: false });
    const a2 = stableData(cache, 'a', { text: 'A', selected: true });
    const b2 = stableData(cache, 'b', { text: 'B', selected: false });
    expect(a2).not.toBe(a1);
    expect(b2).toBe(b1);
  });
});
