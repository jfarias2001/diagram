import { describe, expect, it } from 'vitest';
import { hasRole, isSafeLink } from './document.js';

describe('hasRole', () => {
  it('owner satisfaz qualquer papel', () => {
    expect(hasRole('OWNER', 'EDITOR')).toBe(true);
    expect(hasRole('OWNER', 'VIEWER')).toBe(true);
  });

  it('viewer não satisfaz editor', () => {
    expect(hasRole('VIEWER', 'EDITOR')).toBe(false);
    expect(hasRole('COMMENTER', 'EDITOR')).toBe(false);
  });
});

describe('isSafeLink', () => {
  it('aceita http, https e mailto', () => {
    expect(isSafeLink('https://paglamp.com.br')).toBe(true);
    expect(isSafeLink('http://exemplo.com')).toBe(true);
    expect(isSafeLink('mailto:ti@paglamp.com.br')).toBe(true);
  });

  it('rejeita javascript:, data: e lixo', () => {
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeLink('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeLink('não é url')).toBe(false);
  });
});
