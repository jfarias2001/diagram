import { describe, expect, it } from 'vitest';
import { alignmentSnap, boundingBox } from './alignment';

describe('guias de alinhamento (SPEC-003 §5.6)', () => {
  const other = { x: 100, y: 100, w: 160, h: 72 };

  it('encaixa a borda esquerda quando está a menos do limite', () => {
    const snap = alignmentSnap({ x: 104, y: 300, w: 160, h: 72 }, [other], 6);
    expect(snap.dx).toBe(-4);
    expect(snap.dy).toBe(0);
    expect(snap.guides).toEqual([{ axis: 'v', pos: 100, from: 100, to: 372 }]);
  });

  it('encaixa pelo centro, nos dois eixos', () => {
    const snap = alignmentSnap({ x: 400, y: 131, w: 100, h: 16 }, [other], 6); // centro y = 139 → 136
    expect(snap.dy).toBe(-3);
    expect(snap.guides.map((g) => g.axis)).toEqual(['h']);
  });

  it('não encaixa acima do limite', () => {
    const snap = alignmentSnap({ x: 110, y: 400, w: 50, h: 50 }, [other], 6);
    expect(snap).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('com várias formas, a referência é a caixa que envolve a seleção', () => {
    const box = boundingBox([
      { x: 102, y: 300, w: 40, h: 40 },
      { x: 200, y: 360, w: 40, h: 40 },
    ]);
    expect(box).toEqual({ x: 102, y: 300, w: 138, h: 100 });
    expect(alignmentSnap(box, [other], 6).dx).toBe(-2);
  });
});
