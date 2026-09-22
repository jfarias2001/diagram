/**
 * Reaproveita o objeto `data` anterior de um nó quando nada mudou (comparação
 * rasa). Assim o React.memo do MindNode segura o re-render dos outros nós
 * quando só a seleção ou um nó muda (SPEC-002 §5.4).
 */
export function stableData<T extends Record<string, unknown>>(cache: Map<string, T>, id: string, next: T): T {
  const prev = cache.get(id);
  if (prev && shallowEqual(prev, next)) return prev;
  cache.set(id, next);
  return next;
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.is(a[k], b[k]));
}
