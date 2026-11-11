import { describe, expect, it, vi } from 'vitest';
import { computeSelections, createPresenceStore } from './presence';

// SPEC-009 §5.7 — seleção de colega re-renderiza só os blocos afetados.

const ana = { name: 'Ana Souza', color: '#e8590c' };
const bia = { name: 'Bia Lima', color: '#1c7ed6' };

describe('computeSelections', () => {
  it('ignora a própria conexão, quem não selecionou e estado malformado', () => {
    const states: Array<[number, Record<string, unknown>]> = [
      [1, { selected: 'n1', user: { name: 'Eu', color: '#000000' } }],
      [2, { selected: 'n1', user: ana }],
      [3, { selected: null, user: bia }],
      [4, { selected: 'n2', user: { name: 42 } }],
      [5, { selected: 'n2', user: { name: 'Sem cor' } }],
    ];
    const map = computeSelections(states, 1);
    expect(map.get('n1')).toEqual([ana]);
    expect(map.get('n2')).toEqual([{ name: 'Sem cor', color: '#5c7cfa' }]);
    expect(map.size).toBe(2);
  });
});

describe('createPresenceStore', () => {
  it('avisa só os blocos cuja lista mudou', () => {
    const store = createPresenceStore();
    const n1 = vi.fn();
    const n2 = vi.fn();
    const n3 = vi.fn();
    store.subscribe('n1', n1);
    store.subscribe('n2', n2);
    store.subscribe('n3', n3);

    store.update(new Map([['n1', [ana]]]));
    expect(n1).toHaveBeenCalledTimes(1);

    // Ana troca de n1 para n2: exatamente esses dois re-renderizam.
    const changed = store.update(new Map([['n2', [ana]]]));
    expect(changed.sort()).toEqual(['n1', 'n2']);
    expect(n1).toHaveBeenCalledTimes(2);
    expect(n2).toHaveBeenCalledTimes(1);
    expect(n3).not.toHaveBeenCalled();
  });

  it('lista igual mantém a mesma referência (nada re-renderiza)', () => {
    const store = createPresenceStore();
    store.update(new Map([['n1', [ana, bia]]]));
    const before = store.get('n1');
    const changed = store.update(new Map([['n1', [{ ...ana }, { ...bia }]]]));
    expect(changed).toEqual([]);
    expect(store.get('n1')).toBe(before);
  });

  it('bloco sem colega devolve sempre a mesma lista vazia', () => {
    const store = createPresenceStore();
    expect(store.get('x')).toBe(store.get('y'));
    expect(store.get('x')).toEqual([]);
  });

  it('cancelar a assinatura para de avisar', () => {
    const store = createPresenceStore();
    const listener = vi.fn();
    const off = store.subscribe('n1', listener);
    off();
    store.update(new Map([['n1', [ana]]]));
    expect(listener).not.toHaveBeenCalled();
  });
});
