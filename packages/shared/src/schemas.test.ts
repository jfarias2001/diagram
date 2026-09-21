import { describe, expect, it } from 'vitest';
import { createUserBodySchema, loginBodySchema, passwordSchema, safeNextPath } from './schemas.js';

describe('schemas', () => {
  it('normaliza e-mail para minúsculo sem espaços', () => {
    expect(loginBodySchema.parse({ email: '  Joao@Paglamp.com.BR ', password: 'x' }).email).toBe('joao@paglamp.com.br');
  });

  it('aceita e-mail de qualquer provedor (ADR-003)', () => {
    expect(createUserBodySchema.parse({ name: 'Ana', email: 'ana@gmail.com' }).role).toBe('MEMBER');
  });

  it('aplica o tamanho mínimo de senha', () => {
    expect(passwordSchema.safeParse('curta').success).toBe(false);
    expect(passwordSchema.safeParse('uma senha longa').success).toBe(true);
  });
});

describe('safeNextPath', () => {
  it('só aceita caminho interno', () => {
    expect(safeNextPath('/m/abc')).toBe('/m/abc');
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('/\\evil.com')).toBe('/');
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});
