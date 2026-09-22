import { describe, expect, it } from 'vitest';
import { hasRole, isSafeLink, NODE_LINK_MAX, normalizeLink } from './document.js';

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

describe('normalizeLink (SPEC-002 §2.3)', () => {
  it('aceita http, https e mailto e completa o https://', () => {
    expect(normalizeLink('https://paglamp.com.br/x')).toBe('https://paglamp.com.br/x');
    expect(normalizeLink('http://exemplo.com')).toBe('http://exemplo.com');
    expect(normalizeLink('mailto:ti@paglamp.com.br')).toBe('mailto:ti@paglamp.com.br');
    expect(normalizeLink('  paglamp.com.br/pedidos  ')).toBe('https://paglamp.com.br/pedidos');
  });

  it('recusa protocolos perigosos, lixo e links grandes demais', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'ftp://arquivos.paglamp.com.br',
      'file:///etc/passwd',
      'paglamp com br',
      '',
      '   ',
      `https://x.com/${'a'.repeat(NODE_LINK_MAX)}`,
    ]) {
      expect(normalizeLink(bad), bad).toBeNull();
    }
  });
});
