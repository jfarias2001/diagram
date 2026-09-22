import { useCallback, useEffect, useState } from 'react';

// Tema do quadro (SPEC-006 §5.5). Vale só para o quadro — o resto da interface
// continua seguindo o sistema. Preferência do navegador, não do documento.

export type BoardTheme = 'light' | 'dark';

const STORAGE_KEY = 'paglamp.board-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): BoardTheme {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Lê a escolha guardada. Valor estranho (ou storage bloqueado) = sem escolha. */
function storedTheme(): BoardTheme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function useBoardTheme(): { theme: BoardTheme; toggle: () => void } {
  const [chosen, setChosen] = useState<BoardTheme | null>(() => storedTheme());
  const [system, setSystem] = useState<BoardTheme>(systemTheme);

  // Enquanto não houver escolha, o quadro acompanha o sistema.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const update = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const theme = chosen ?? system;

  const toggle = useCallback(() => {
    const next: BoardTheme = theme === 'dark' ? 'light' : 'dark';
    setChosen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Navegador com storage bloqueado: vale só nesta sessão.
    }
  }, [theme]);

  return { theme, toggle };
}
