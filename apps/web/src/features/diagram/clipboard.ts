import { type DiagramClip, diagramClipSchema, SHAPE_TEXT_MAX } from '@diagram/shared';

// Área de transferência do fluxograma (SPEC-003 §5.7). O que chega pelo "colar"
// é entrada externa: só vira forma depois de passar pelo schema Zod.

const MAX_PASTE_CHARS = 2_000_000; // antes de tentar o JSON.parse

export type Pasted = { kind: 'clip'; clip: DiagramClip } | { kind: 'text'; text: string } | { kind: 'none' };

export function serializeClip(clip: DiagramClip): string {
  return JSON.stringify(clip);
}

export function parsePasted(raw: string): Pasted {
  const text = raw.trim();
  if (!text) return { kind: 'none' };
  if (text.startsWith('{') && text.length <= MAX_PASTE_CHARS) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (data && typeof data === 'object' && (data as { paglamp?: unknown }).paglamp === 'diagram-clip') {
      const parsed = diagramClipSchema.safeParse(data);
      // Clip inválido é ignorado sem erro (não vira texto com JSON dentro).
      return parsed.success ? { kind: 'clip', clip: parsed.data } : { kind: 'none' };
    }
  }
  return { kind: 'text', text: text.slice(0, SHAPE_TEXT_MAX) };
}
