import { z } from 'zod';
import { contrastRatio, HEX_COLOR, type NodeShape, readableInk, relativeLuminance } from './document.js';

// Tema do documento (SPEC-007 §2.1). O documento guarda só IDS de listas
// fechadas (mais um hex validado); as cores e as fontes em si moram aqui, no
// código. Por isso aplicar um tema num mapa de 1.000 blocos é UMA escrita, e
// nenhum texto livre do documento chega a virar CSS.

export const THEME_IDS = ['paglamp', 'aurora', 'oceano', 'porsol', 'grafite', 'papel', 'caderno', 'neon'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const FONT_IDS = ['sans', 'inter', 'geometrica', 'serifada', 'manuscrita', 'condensada', 'mono', 'legivel'] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface DocumentFont {
  id: FontId;
  /** Rótulo na interface. */
  name: string;
  /** Pilha CSS. A família principal só existe depois de `fonts.ts` carregá-la. */
  stack: string;
  /**
   * Largura média do caractere em relação à fonte padrão (SPEC-007 §5.4).
   * `estimateSize` usa isto para o bloco não ficar apertado nem folgado demais.
   */
  widthFactor: number;
}

export const DOC_FONTS: Record<FontId, DocumentFont> = {
  sans: {
    id: 'sans',
    name: 'Padrão',
    stack: "'Instrument Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
    widthFactor: 1,
  },
  inter: {
    id: 'inter',
    name: 'Neutra',
    stack: "'Inter Variable', system-ui, 'Segoe UI', sans-serif",
    widthFactor: 1.02,
  },
  geometrica: {
    id: 'geometrica',
    name: 'Geométrica',
    stack: "'Outfit Variable', system-ui, 'Segoe UI', sans-serif",
    widthFactor: 1,
  },
  serifada: {
    id: 'serifada',
    name: 'Com serifa',
    stack: "'Source Serif 4 Variable', Georgia, 'Times New Roman', serif",
    widthFactor: 0.97,
  },
  manuscrita: {
    id: 'manuscrita',
    name: 'Manuscrita',
    stack: "'Caveat Variable', 'Segoe Script', cursive",
    widthFactor: 0.78,
  },
  condensada: {
    id: 'condensada',
    name: 'Condensada',
    stack: "'Oswald Variable', 'Arial Narrow', sans-serif",
    widthFactor: 0.82,
  },
  mono: {
    id: 'mono',
    name: 'Monoespaçada',
    stack: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', monospace",
    widthFactor: 1.12,
  },
  legivel: {
    id: 'legivel',
    name: 'Alta legibilidade',
    stack: "'Atkinson Hyperlegible', system-ui, 'Segoe UI', sans-serif",
    widthFactor: 1.05,
  },
};

export interface DocumentTheme {
  id: ThemeId;
  name: string;
  mode: 'light' | 'dark';
  /** Fundo do quadro. */
  canvas: string;
  /** Fundo padrão do bloco. */
  surface: string;
  /** Texto padrão. */
  ink: string;
  /** Bordas dentro do quadro. */
  line: string;
  /** Pontinhos do fundo. */
  grid: string;
  /** Cores dos ramos, na ordem em que são distribuídas. */
  branches: readonly string[];
  rootColor: string;
  font: FontId;
  /** Traço da ligação: espessura na saída e fração dela na chegada (§5.5). */
  edge: { width: number; taper: number };
  /** Formato padrão dos blocos que não escolheram um. */
  shape: NodeShape;
  /** Blocos de 1º nível nascem preenchidos com a cor do ramo (como na referência). */
  filledBranches: boolean;
}

/**
 * Os oito temas. Regras seguidas em todos (verificadas em teste):
 * contraste do texto sobre o bloco ≥ 4,5:1, e toda cor de ramo aceita um texto
 * legível por cima — nenhum tema pode nascer ilegível.
 */
export const DOC_THEMES: Record<ThemeId, DocumentTheme> = {
  paglamp: {
    id: 'paglamp',
    name: 'Paglamp',
    mode: 'light',
    canvas: '#f2f1ed',
    surface: '#fbfaf8',
    ink: '#1b2230',
    line: '#e0ded8',
    grid: '#d3d0c8',
    branches: ['#e8590c', '#1971c2', '#2f9e44', '#ae3ec9', '#c2740a', '#0b7285', '#d6336c', '#5c7cfa'],
    rootColor: '#5b6472',
    font: 'sans',
    edge: { width: 3, taper: 0.45 },
    shape: 'rounded',
    filledBranches: false,
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    mode: 'light',
    canvas: '#f6f4fb',
    surface: '#fdfcfe',
    ink: '#221b33',
    line: '#e6e1f0',
    grid: '#d9d2ea',
    branches: ['#b45309', '#2563eb', '#7c3aed', '#047857', '#db2777', '#0e7490', '#ea580c', '#4f46e5'],
    rootColor: '#6d28d9',
    font: 'geometrica',
    edge: { width: 3.5, taper: 0.4 },
    shape: 'rounded',
    filledBranches: true,
  },
  oceano: {
    id: 'oceano',
    name: 'Oceano',
    mode: 'light',
    canvas: '#edf3f7',
    surface: '#fafdfe',
    ink: '#10232e',
    line: '#d7e3ea',
    grid: '#c4d5de',
    branches: ['#0e7490', '#1d4ed8', '#0f766e', '#4338ca', '#0369a1', '#15803d', '#7e22ce', '#b45309'],
    rootColor: '#0e7490',
    font: 'inter',
    edge: { width: 3, taper: 0.5 },
    shape: 'capsule',
    filledBranches: true,
  },
  porsol: {
    id: 'porsol',
    name: 'Pôr do sol',
    mode: 'light',
    canvas: '#fbf2ec',
    surface: '#fffbf8',
    ink: '#3b1f16',
    line: '#f0ddd0',
    grid: '#e5cbb9',
    branches: ['#c2410c', '#b91c1c', '#a16207', '#be185d', '#9a3412', '#b45309', '#9d174d', '#78350f'],
    rootColor: '#9a3412',
    font: 'serifada',
    edge: { width: 3.5, taper: 0.45 },
    shape: 'rounded',
    filledBranches: true,
  },
  grafite: {
    id: 'grafite',
    name: 'Grafite',
    mode: 'dark',
    canvas: '#14181f',
    surface: '#1e242e',
    ink: '#e8ebf0',
    line: '#2c3340',
    grid: '#242b36',
    branches: ['#f59e0b', '#38bdf8', '#4ade80', '#c084fc', '#fb7185', '#22d3ee', '#a3e635', '#818cf8'],
    rootColor: '#94a3b8',
    font: 'sans',
    edge: { width: 3, taper: 0.45 },
    shape: 'rounded',
    filledBranches: false,
  },
  papel: {
    id: 'papel',
    name: 'Papel',
    mode: 'light',
    canvas: '#f3eee3',
    surface: '#fdfbf6',
    ink: '#2a2317',
    line: '#e3d9c6',
    grid: '#d6c9b0',
    branches: ['#8c5a2b', '#2f5d50', '#7a3b2e', '#4a5d23', '#6b4e71', '#2d4a6b', '#8a6d1f', '#7c3a3a'],
    rootColor: '#4a4034',
    font: 'serifada',
    edge: { width: 2.5, taper: 0.6 },
    shape: 'rounded',
    filledBranches: false,
  },
  caderno: {
    id: 'caderno',
    name: 'Caderno',
    mode: 'light',
    canvas: '#f6f4ef',
    surface: '#fdfcf8',
    ink: '#1f2933',
    line: '#e2dfd7',
    grid: '#d2cec4',
    branches: ['#2f3e4d', '#4e6b78', '#a5543b', '#8f5545', '#43606e', '#9c4f37', '#456070', '#7c4a3a'],
    rootColor: '#2f3e4d',
    font: 'manuscrita',
    edge: { width: 2.5, taper: 0.55 },
    shape: 'rounded',
    filledBranches: true,
  },
  neon: {
    id: 'neon',
    name: 'Neon',
    mode: 'dark',
    canvas: '#0b0e14',
    surface: '#151a24',
    ink: '#eaf2ff',
    line: '#273046',
    grid: '#1b2231',
    branches: ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#60a5fa', '#c4b5fd'],
    rootColor: '#22d3ee',
    font: 'mono',
    edge: { width: 3.5, taper: 0.35 },
    shape: 'capsule',
    filledBranches: true,
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'paglamp';

/** Estilo guardado no documento (SPEC-007 §2.1). Tudo opcional = tema padrão. */
export const documentStyleSchema = z.object({
  theme: z.enum(THEME_IDS).optional(),
  font: z.enum(FONT_IDS).optional(),
  background: z.string().regex(HEX_COLOR).optional(),
});
export type DocumentStyle = z.infer<typeof documentStyleSchema>;

/**
 * Tema com as sobreposições do documento já aplicadas — pronto para a interface.
 * Um fundo escolhido à mão pode contrariar o tema (fundo escuro num tema claro),
 * então `mode` vem da luminância do fundo em uso e o texto só é trocado se o do
 * tema tiver ficado ilegível sobre ele (o bloco sem preenchimento continua
 * usando `surface`, que não muda).
 */
export function resolveTheme(style: DocumentStyle | undefined): DocumentTheme {
  const base = DOC_THEMES[style?.theme ?? DEFAULT_THEME_ID] ?? DOC_THEMES[DEFAULT_THEME_ID];
  const font = style?.font && DOC_FONTS[style.font] ? style.font : base.font;
  const canvas = style?.background && HEX_COLOR.test(style.background) ? style.background : base.canvas;
  if (font === base.font && canvas === base.canvas) return base;
  const mode = canvas === base.canvas ? base.mode : relativeLuminance(canvas) < 0.2 ? 'dark' : 'light';
  const ink = contrastRatio(base.ink, canvas) >= 3 ? base.ink : readableInk(canvas);
  return { ...base, font, canvas, mode, ink };
}

/** Fonte resolvida do documento. */
export function resolveFont(style: DocumentStyle | undefined): DocumentFont {
  return DOC_FONTS[resolveTheme(style).font];
}
