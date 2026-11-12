import { describe, expect, it } from 'vitest';
import { stableData, stableItem } from './stableData';

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

describe('stableItem — nós e ligações estáveis no arrasto', () => {
  it('mantém o objeto quando posição e medida têm o mesmo conteúdo', () => {
    const cache = new Map<string, Record<string, unknown>>();
    const data = { text: 'A' };
    const first = stableItem(cache, 'a', { id: 'a', position: { x: 1, y: 2 }, origin: [0, 0.5], data });
    const again = stableItem(cache, 'a', { id: 'a', position: { x: 1, y: 2 }, origin: [0, 0.5], data });
    expect(again).toBe(first);
  });

  it('troca o objeto só do nó que se moveu', () => {
    const cache = new Map<string, Record<string, unknown>>();
    const a1 = stableItem(cache, 'a', { id: 'a', position: { x: 0, y: 0 } });
    const b1 = stableItem(cache, 'b', { id: 'b', position: { x: 0, y: 50 } });
    const a2 = stableItem(cache, 'a', { id: 'a', position: { x: 4, y: 2 } });
    const b2 = stableItem(cache, 'b', { id: 'b', position: { x: 0, y: 50 } });
    expect(a2).not.toBe(a1);
    expect(b2).toBe(b1);
  });

  it('troca o objeto quando um campo aparece ou some', () => {
    const cache = new Map<string, Record<string, unknown>>();
    const a1 = stableItem(cache, 'a', { id: 'a' });
    const a2 = stableItem(cache, 'a', { id: 'a', className: 'search-hit' });
    expect(a2).not.toBe(a1);
  });

  it('troca o objeto quando o data muda de conteúdo', () => {
    const cache = new Map<string, Record<string, unknown>>();
    const a1 = stableItem(cache, 'a', { id: 'a', data: { text: 'A' } });
    const a2 = stableItem(cache, 'a', { id: 'a', data: { text: 'B' } });
    expect(a2).not.toBe(a1);
  });
});
