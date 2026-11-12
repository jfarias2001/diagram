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

/**
 * Reaproveita o objeto do nó/ligação inteiro (não só o `data`) quando nada
 * mudou. Campos que são objetos ou listas pequenas (`position`, `origin`,
 * `measured`) são comparados pelo conteúdo, um nível abaixo.
 *
 * Sem isto, cada movimento do mouse no arrasto recriava TODOS os nós e
 * ligações, e o React Flow redesenhava o mapa inteiro a cada quadro — a linha
 * do bloco arrastado andava "em câmera lenta" (a mesma causa vale para o
 * fluxograma com muitos blocos).
 */
export function stableItem<T extends object>(cache: Map<string, T>, id: string, next: T): T {
  const prev = cache.get(id);
  if (prev && sameOneLevel(prev as Record<string, unknown>, next as Record<string, unknown>)) return prev;
  cache.set(id, next);
  return next;
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === Array.prototype;
}

function sameOneLevel(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    if (Object.is(x, y)) return true;
    return isPlain(x) && isPlain(y) && shallowEqual(x, y);
  });
}
