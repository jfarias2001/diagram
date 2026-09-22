import { addShape, buildClip, createDiagramDoc, readDiagram } from '@diagram/shared';
import { describe, expect, it } from 'vitest';
import { parsePasted, serializeClip } from './clipboard';

describe('colar no fluxograma (SPEC-003 §5.7)', () => {
  it('ida e volta de um clip', () => {
    const doc = createDiagramDoc();
    addShape(doc, { id: 'a', kind: 'process', x: 0, y: 0, text: 'Faturar' });
    const clip = buildClip(readDiagram(doc), ['a']);
    const pasted = parsePasted(serializeClip(clip));
    expect(pasted.kind).toBe('clip');
    if (pasted.kind === 'clip') expect(pasted.clip.shapes[0]?.text).toBe('Faturar');
  });

  it('clip malicioso é ignorado; texto comum vira texto limitado', () => {
    const evil = JSON.stringify({
      paglamp: 'diagram-clip',
      v: 1,
      edges: [],
      shapes: [{ id: 'x', kind: 'process', x: 0, y: 0, w: 100, h: 60, text: '', z: 1, fill: 'url(javascript:alert(1))' }],
    });
    expect(parsePasted(evil)).toEqual({ kind: 'none' });
    expect(parsePasted('{ quebrado')).toEqual({ kind: 'text', text: '{ quebrado' });
    const long = parsePasted('a'.repeat(5000));
    expect(long.kind === 'text' && long.text.length).toBe(2000);
    expect(parsePasted('   ')).toEqual({ kind: 'none' });
  });
});
