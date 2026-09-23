import { contrastRatio } from '@diagram/shared';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// SPEC-008 §5.1 — a paleta da interface é lida do próprio index.css e conferida
// aqui: nenhum par de cores usado em texto pode nascer abaixo de AA (4,5:1).
// Se alguém mexer num token, este teste é quem reclama.

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

/** Tokens do primeiro `:root` (claro) e do bloco de `prefers-color-scheme: dark`. */
function tokens(mode: 'light' | 'dark'): Record<string, string> {
  const block =
    mode === 'light'
      ? (css.match(/:root\s*\{([^}]*)\}/) ?? [])[1]
      : (css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/) ?? [])[1];
  expect(block, `bloco de tokens ${mode} não encontrado`).toBeTruthy();
  const out: Record<string, string> = {};
  for (const match of (block as string).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[match[1] as string] = (match[2] as string).trim();
  }
  return out;
}

/** Pares texto→fundo que precisam de contraste de leitura. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink', 'surface-2'],
  ['muted', 'canvas'],
  ['muted', 'surface'],
  ['brand-ink', 'surface'],
  ['nav-ink', 'nav'],
  ['nav-muted', 'nav'],
  ['nav-ink', 'nav-2'],
  ['danger', 'surface'],
  ['ok', 'surface'],
  ['warn', 'surface'],
];

describe.each(['light', 'dark'] as const)('paleta da interface — modo %s', (mode) => {
  const t = tokens(mode);

  it('define todos os tokens esperados em #rrggbb', () => {
    for (const name of [
      'canvas',
      'surface',
      'surface-2',
      'ink',
      'muted',
      'line',
      'grid',
      'brand',
      'brand-2',
      'brand-ink',
      'nav',
      'nav-2',
      'nav-ink',
      'nav-muted',
      'on-brand',
      'danger',
      'ok',
      'warn',
    ]) {
      expect(t[name], `--${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXT_PAIRS)('%s sobre %s tem contraste AA', (fg, bg) => {
    expect(contrastRatio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('o texto do botão principal é legível sobre a cor de ação e sobre o degradê', () => {
    for (const name of ['brand', 'brand-2']) {
      expect(contrastRatio(t['on-brand'] as string, t[name] as string)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('bordas se distinguem do fundo', () => {
    expect(contrastRatio(t.line as string, t.surface as string)).toBeGreaterThanOrEqual(1.2);
  });

  it('o âmbar da interface antiga não existe mais', () => {
    expect(css).not.toContain('--filament');
  });
});
