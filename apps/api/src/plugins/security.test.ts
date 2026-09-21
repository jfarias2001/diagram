import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import security from './security.js';

const env = {
  APP_URL: 'https://diagram.paglamp.com.br',
  SESSION_SECRET: 'x'.repeat(32),
} as Env;

async function build() {
  const app = Fastify();
  await app.register(security, { env });
  app.post('/echo', async () => ({ ok: true }));
  app.get('/echo', async () => ({ ok: true }));
  return app;
}

describe('proteção CSRF por Origin', () => {
  it('bloqueia POST de outra origem', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/echo', headers: { origin: 'https://evil.com' } });
    expect(res.statusCode).toBe(403);
  });

  it('bloqueia POST sem Origin', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/echo' });
    expect(res.statusCode).toBe(403);
  });

  it('aceita POST da própria origem', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { origin: 'https://diagram.paglamp.com.br' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('GET não exige Origin', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/echo' });
    expect(res.statusCode).toBe(200);
  });
});
