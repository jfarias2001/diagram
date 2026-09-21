import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'statusCode' in error;
}

/** Nunca vazar stack trace, SQL ou mensagem do Prisma para o cliente. */
export default fp(async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', issues: error.issues },
      });
    }

    const status = isFastifyError(error) ? (error.statusCode ?? 500) : 500;
    if (status >= 500 || !isFastifyError(error)) {
      request.log.error({ err: error }, 'erro não tratado');
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } });
    }

    return reply.code(status).send({ error: { code: error.code ?? 'REQUEST_ERROR', message: error.message } });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } });
  });
});
