import {
  type DocumentFont,
  type DocumentStyle,
  type DocumentTheme,
  readStyle,
  resolveFont,
  resolveTheme,
  setDocumentStyle,
  type StylePatch,
  styleMap,
} from '@diagram/shared';
import { type CSSProperties, useEffect, useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import { loadFont } from './fonts';
import { LOCAL_ORIGIN } from './useMindMap';

// Tema do quadro (SPEC-007 §5.4). Diferente da SPEC-006, onde claro/escuro era
// uma preferência de navegador: agora o tema é do DOCUMENTO, então todo mundo
// que abre vê a mesma coisa, ele entra no histórico de versões e sincroniza em
// tempo real como qualquer outro conteúdo.

export interface BoardTheme {
  style: DocumentStyle;
  theme: DocumentTheme;
  font: DocumentFont;
  /** Variáveis CSS do quadro — valores já validados (§6). */
  vars: CSSProperties;
  /** Aplica um patch no documento. Sem permissão, não faz nada. */
  apply: (patch: StylePatch) => void;
}

/** Estilo do documento, observado como os nós são (SPEC-001 §5). */
function useDocumentStyle(doc: Y.Doc): DocumentStyle {
  const store = useMemo(() => {
    let snapshot = readStyle(doc);
    return {
      subscribe(onChange: () => void) {
        const map = styleMap(doc);
        const handler = () => {
          snapshot = readStyle(doc);
          onChange();
        };
        map.observe(handler);
        return () => map.unobserve(handler);
      },
      get: () => snapshot,
    };
  }, [doc]);
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useBoardTheme(doc: Y.Doc, canEdit: boolean): BoardTheme {
  const style = useDocumentStyle(doc);
  const theme = useMemo(() => resolveTheme(style), [style]);
  const font = useMemo(() => resolveFont(style), [style]);

  // O arquivo da fonte só é baixado quando um documento pede por ela.
  useEffect(() => {
    void loadFont(font.id);
  }, [font.id]);

  const vars = useMemo<CSSProperties>(
    () =>
      ({
        '--canvas': theme.canvas,
        '--surface': theme.surface,
        '--surface-2': theme.mode === 'dark' ? mix(theme.surface, '#ffffff', 0.08) : mix(theme.surface, '#000000', 0.05),
        '--ink': theme.ink,
        '--muted': mix(theme.ink, theme.canvas, 0.45),
        '--line': theme.line,
        '--grid': theme.grid,
        '--board-font': font.stack,
      }) as CSSProperties,
    [theme, font],
  );

  return {
    style,
    theme,
    font,
    vars,
    apply: (patch: StylePatch) => {
      if (canEdit) setDocumentStyle(doc, patch, LOCAL_ORIGIN);
    },
  };
}

/** Mistura dois `#rrggbb` (`amount` = quanto do segundo entra). Só cores já validadas. */
export function mix(a: string, b: string, amount: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const out = [1, 3, 5].map((at) => {
    const value = Math.round(channel(a, at) * (1 - amount) + channel(b, at) * amount);
    return Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0');
  });
  return `#${out.join('')}`;
}
