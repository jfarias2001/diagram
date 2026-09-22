import { HEX_COLOR } from '@diagram/shared';

// Conversões de cor do seletor livre (SPEC-007 §5.6). Sem dependência nova:
// são 40 linhas de aritmética, testadas.

export interface Hsv {
  /** Matiz em graus, 0–360. */
  h: number;
  /** Saturação, 0–1. */
  s: number;
  /** Brilho, 0–1. */
  v: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const byte = (v: number) => Math.round(clamp01(v) * 255);

/**
 * Aceita o que a pessoa digita: `abc`, `#abc`, `aabbcc`, `#AABBCC`.
 * Devolve sempre `#rrggbb` minúsculo, ou null se não for cor.
 */
export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    const [r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  return null;
}

export function hexToHsv(hex: string): Hsv | null {
  if (!HEX_COLOR.test(hex)) return null;
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector] ?? [0, 0, 0];
  return `#${[r + m, g + m, b + m].map((n) => byte(n).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- cores recentes (só neste navegador, SPEC-007 §5.6) ----------

const RECENT_KEY = 'paglamp.recent-colors';
const RECENT_MAX = 12;

export function loadRecentColors(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c)).slice(0, RECENT_MAX);
  } catch {
    // Storage bloqueado ou conteúdo estranho: começa vazio.
    return [];
  }
}

/** Põe a cor no começo da lista (sem repetir) e devolve a lista nova. */
export function pushRecentColor(color: string): string[] {
  if (!HEX_COLOR.test(color)) return loadRecentColors();
  const next = [color, ...loadRecentColors().filter((c) => c !== color)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Sem storage: vale só nesta sessão.
  }
  return next;
}
