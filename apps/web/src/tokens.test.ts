import { contrastRatio } from '@diagram/shared';
import { readdirSync, readFileSync } from 'node:fs';
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
      'on-danger',
      'nav-hover',
      'nav-active',
      'nav-edge',
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

  it('o texto do botão de perigo é legível sobre o vermelho', () => {
    expect(contrastRatio(t['on-danger'] as string, t.danger as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('a lateral se separa do quadro (no escuro, pela borda) — SPEC-009 §5.1', () => {
    expect(contrastRatio(t['nav-edge'] as string, t.canvas as string)).toBeGreaterThanOrEqual(1.2);
  });

  it('os estados da lateral se distinguem da própria lateral', () => {
    expect(contrastRatio(t['nav-active'] as string, t.nav as string)).toBeGreaterThanOrEqual(1.2);
  });

  it('bordas se distinguem do fundo', () => {
    expect(contrastRatio(t.line as string, t.surface as string)).toBeGreaterThanOrEqual(1.2);
  });

  it('o âmbar da interface antiga não existe mais', () => {
    expect(css).not.toContain('--filament');
  });
});

describe('movimento (SPEC-009 §5.1)', () => {
  const light = (css.match(/:root\s*\{([^}]*)\}/) ?? [])[1] ?? '';

  it('define o ritmo único de durações', () => {
    for (const [name, ms] of [
      ['micro', 120],
      ['fast', 180],
      ['base', 240],
      ['slow', 320],
    ] as const) {
      expect(light).toContain(`--dur-${name}: ${ms}ms;`);
    }
  });

  it('tem a regra global de "reduzir movimento", que zera animação e transição', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('animation-duration: 1ms !important');
    expect(block).toContain('transition-duration: 1ms !important');
    expect(block).toContain('::view-transition-old(*)');
  });
});

describe('escalas únicas (SPEC-009 §5.1)', () => {
  const root = new URL('./', import.meta.url);
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ f, src: readFileSync(new URL(f.replaceAll('\\', '/'), root), 'utf8') }));

  it('nenhum tamanho de texto solto de 10/11 px — use text-2xs', () => {
    const offenders = files.filter(({ src }) => /text-\[1[01]px\]/.test(src)).map(({ f }) => f);
    expect(offenders).toEqual([]);
  });

  it('estados da lateral usam os tokens, não branco translúcido fixo', () => {
    const offenders = files.filter(({ src }) => /bg-white\/(8|10|12)/.test(src)).map(({ f }) => f);
    expect(offenders).toEqual([]);
  });

  it('nenhuma caixa de diálogo do navegador', () => {
    const offenders = files.filter(({ src }) => /window\.(confirm|alert)\(/.test(src)).map(({ f }) => f);
    expect(offenders).toEqual([]);
  });
});
