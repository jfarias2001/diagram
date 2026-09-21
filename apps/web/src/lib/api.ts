/** Erro padronizado da API: `{ error: { code, message } }` (CLAUDE.md §8). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Cliente HTTP único. Mesma origem que a API: o cookie de sessão vai sozinho
 * e o navegador envia `Origin`, que a API confere contra CSRF.
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    const message =
      res.status === 429
        ? 'Muitas tentativas. Aguarde um pouco e tente de novo.'
        : (err?.message ?? 'Não foi possível completar a ação. Tente de novo.');
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', message);
  }
  return body as T;
}
