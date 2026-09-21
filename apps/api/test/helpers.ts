import type { UserRole } from '@diagram/shared';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { buildApp } from '../src/app.js';
import { type Env, loadEnv } from '../src/config/env.js';
import { hashPassword } from '../src/lib/crypto.js';

export const APP_URL = 'http://localhost:5173';
export const ORIGIN = APP_URL;
export const PASSWORD = 'senha-de-teste-123';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('databaseUrl'),
    APP_URL,
    SESSION_SECRET: 's'.repeat(40),
    RATE_LIMIT_MAX: '100000',
    LOGIN_RATE_LIMIT_MAX: '100000',
    ...overrides,
  });
}

export async function createTestApp(overrides: Record<string, string> = {}): Promise<FastifyInstance> {
  const app = await buildApp(testEnv(overrides), { jobs: false });
  await app.ready();
  return app;
}

export const uniqueEmail = (prefix = 'user') => `${prefix}-${randomUUID().slice(0, 8)}@teste.com`;

export async function createUser(
  app: FastifyInstance,
  options: { role?: UserRole; mustChangePassword?: boolean; active?: boolean; name?: string } = {},
) {
  return app.prisma.user.create({
    data: {
      email: uniqueEmail(options.role === 'ADMIN' ? 'admin' : 'user'),
      name: options.name ?? 'Usuário Teste',
      role: options.role ?? 'MEMBER',
      passwordHash: await hashPassword(PASSWORD),
      mustChangePassword: options.mustChangePassword ?? false,
      active: options.active ?? true,
    },
  });
}

/** Cookie `sid=...` de uma sessão nova. */
export async function login(app: FastifyInstance, email: string, password = PASSWORD): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'sid');
  if (!cookie) throw new Error('login sem cookie');
  return `sid=${cookie.value}`;
}

export async function userWithSession(app: FastifyInstance, options: Parameters<typeof createUser>[1] = {}) {
  const user = await createUser(app, options);
  const cookie = await login(app, user.email);
  return { user, cookie };
}

/** Requisição autenticada vinda da própria origem. */
export function call(
  app: FastifyInstance,
  cookie: string | null,
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(payload !== undefined ? { payload: payload as InjectOptions['payload'] } : {}),
  });
}
