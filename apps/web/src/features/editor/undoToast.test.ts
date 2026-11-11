import { describe, expect, it } from 'vitest';
import { canUndoFromToast } from './undoToast';

// SPEC-009 §5.6.5 / §7 — o Desfazer do aviso nunca desfaz outra ação.

describe('canUndoFromToast', () => {
  const del = { name: 'exclusão' };
  const other = { name: 'outra edição' };

  it('topo da pilha é a exclusão: pode desfazer', () => {
    expect(canUndoFromToast([other, del], del)).toBe(true);
  });

  it('a pessoa fez outra coisa depois: não pode', () => {
    expect(canUndoFromToast([del, other], del)).toBe(false);
  });

  it('pilha vazia ou exclusão já desfeita: não pode', () => {
    expect(canUndoFromToast([], del)).toBe(false);
    expect(canUndoFromToast([other], del)).toBe(false);
  });

  it('sem item: não pode', () => {
    expect(canUndoFromToast([del], undefined)).toBe(false);
  });
});
