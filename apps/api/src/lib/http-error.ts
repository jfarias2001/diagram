/** Erro esperado de regra de negócio. O handler global devolve `{ error: { code, message } }`. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.');
export const unauthorized = () => new HttpError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
export const forbidden = (code = 'FORBIDDEN', message = 'Sem permissão para esta ação.') =>
  new HttpError(403, code, message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
