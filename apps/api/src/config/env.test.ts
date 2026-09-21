import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  APP_URL: 'https://diagram.paglamp.com.br',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOWED_EMAIL_DOMAINS: 'paglamp.com.br, Outro.com ',
};

describe('loadEnv', () => {
  it('normaliza a lista de domínios', () => {
    expect(loadEnv(base).ALLOWED_EMAIL_DOMAINS).toEqual(['paglamp.com.br', 'outro.com']);
  });

  it('recusa SESSION_SECRET curto', () => {
    expect(() => loadEnv({ ...base, SESSION_SECRET: 'curto' })).toThrow(/SESSION_SECRET/);
  });
});
