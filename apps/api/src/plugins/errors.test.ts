import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import errors from './errors.js';

async function build() {
  const app = Fastify();
  await app.register(errors);
  app.get('/boom', async () => {
    throw new Error('senha do banco: hunter2');
  });
  return app;
}

describe('handler de erros', () => {
  it('não vaza mensagem interna em erro 500', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('hunter2');
    expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } });
  });

  it('responde 404 no formato padrão', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/nada' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
