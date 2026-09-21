import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../config/env.js';
import { generateTemporaryPassword } from '../../lib/crypto.js';
import { isEmailDomainAllowed } from '../admin/routes.js';
import {
  LAST_SEEN_THROTTLE_MS,
  SESSION_ABSOLUTE_MAX_MS,
  SESSION_TTL_MS,
  sessionCookieName,
  sessionCookieOptions,
  sessionRefresh,
} from './session.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 21);

describe('sessionRefresh', () => {
  it('não mexe numa sessão recente', () => {
    expect(
      sessionRefresh({ createdAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS), lastSeenAt: new Date(now) }, now),
    ).toBeNull();
  });

  it('renova quando faltam menos de 3,5 dias', () => {
    const r = sessionRefresh(
      { createdAt: new Date(now - 4 * DAY), expiresAt: new Date(now + 2 * DAY), lastSeenAt: new Date(now) },
      now,
    );
    expect(r?.expiresAt?.getTime()).toBe(now + SESSION_TTL_MS);
  });

  it('nunca passa do limite absoluto de 30 dias', () => {
    const createdAt = new Date(now - 28 * DAY);
    const r = sessionRefresh({ createdAt, expiresAt: new Date(now + DAY), lastSeenAt: new Date(now) }, now);
    expect(r?.expiresAt?.getTime()).toBe(createdAt.getTime() + SESSION_ABSOLUTE_MAX_MS);
  });

  it('atualiza lastSeenAt no máximo a cada 5 minutos', () => {
    const base = { createdAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) };
    expect(sessionRefresh({ ...base, lastSeenAt: new Date(now - 60_000) }, now)).toBeNull();
    expect(sessionRefresh({ ...base, lastSeenAt: new Date(now - LAST_SEEN_THROTTLE_MS - 1) }, now)?.lastSeenAt).toBeDefined();
  });
});

describe('cookie de sessão', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@h:5432/d', SESSION_SECRET: 'x'.repeat(32) };

  it('produção (https) usa __Host- com Secure', () => {
    const env = loadEnv({ ...base, APP_URL: 'https://diagram.paglamp.com.br' });
    expect(sessionCookieName(env)).toBe('__Host-sid');
    expect(sessionCookieOptions(env, new Date())).toMatchObject({ secure: true, httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('dev (http://localhost) usa sid sem Secure', () => {
    const env = loadEnv({ ...base, APP_URL: 'http://localhost:5173' });
    expect(sessionCookieName(env)).toBe('sid');
    expect(sessionCookieOptions(env, new Date()).secure).toBe(false);
  });
});

describe('senha provisória', () => {
  it('16 caracteres sem ambíguos e diferentes a cada chamada', () => {
    const a = generateTemporaryPassword();
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    expect(new Set(Array.from({ length: 50 }, () => generateTemporaryPassword())).size).toBe(50);
  });
});

describe('isEmailDomainAllowed', () => {
  it('lista vazia aceita qualquer e-mail (ADR-003)', () => {
    expect(isEmailDomainAllowed('a@gmail.com', [])).toBe(true);
  });
  it('com lista, só os domínios dela', () => {
    expect(isEmailDomainAllowed('a@paglamp.com.br', ['paglamp.com.br'])).toBe(true);
    expect(isEmailDomainAllowed('a@gmail.com', ['paglamp.com.br'])).toBe(false);
  });
});
