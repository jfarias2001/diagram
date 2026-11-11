import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDelayedFlag, SKELETON_DELAY, SKELETON_MIN } from './Skeleton';

// SPEC-009 §5.5 / §7 — o esqueleto não pisca.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const changes: boolean[] = [];
  const flag = createDelayedFlag((shown) => changes.push(shown));
  return { flag, changes };
}

describe('createDelayedFlag', () => {
  it('carregamento rápido (< 200 ms) nunca mostra o esqueleto', () => {
    const { flag, changes } = setup();
    flag.set(true);
    vi.advanceTimersByTime(SKELETON_DELAY - 1);
    flag.set(false);
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([]);
  });

  it('carregamento lento mostra o esqueleto depois de 200 ms', () => {
    const { flag, changes } = setup();
    flag.set(true);
    vi.advanceTimersByTime(SKELETON_DELAY);
    expect(changes).toEqual([true]);
  });

  it('uma vez na tela, fica pelo menos 400 ms', () => {
    const { flag, changes } = setup();
    flag.set(true);
    vi.advanceTimersByTime(SKELETON_DELAY);
    vi.advanceTimersByTime(50);
    flag.set(false); // chegou logo depois de aparecer
    vi.advanceTimersByTime(SKELETON_MIN - 51);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  it('se já ficou o mínimo, some na hora', () => {
    const { flag, changes } = setup();
    flag.set(true);
    vi.advanceTimersByTime(SKELETON_DELAY + SKELETON_MIN + 100);
    flag.set(false);
    expect(changes).toEqual([true, false]);
  });

  it('dispose cancela o que estava agendado', () => {
    const { flag, changes } = setup();
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([]);
  });
});
