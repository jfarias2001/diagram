import { afterEach, describe, expect, it, vi } from 'vitest';
import { DUR, easeOutCubic, motionMs, prefersReducedMotion } from './motion';

// SPEC-009 §5.1 — as durações em JS seguem a preferência do sistema.

function stubReduced(matches: boolean) {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches, addEventListener() {}, removeEventListener() {} }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('motionMs', () => {
  it('devolve a duração quando o movimento está liberado', () => {
    stubReduced(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(motionMs(DUR.base)).toBe(240);
  });

  it('zera com "reduzir movimento"', () => {
    stubReduced(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(motionMs(DUR.slow)).toBe(0);
  });
});

describe('easeOutCubic', () => {
  it('começa em 0, termina em 1 e não passa dos extremos', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('é crescente e anda mais no começo (desacelera)', () => {
    let last = 0;
    for (let i = 1; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThan(last);
      last = v;
    }
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
