import type { ComponentType } from 'react';

// SPEC-009 §5.10 — comandos da paleta (Ctrl+K). Cada página registra os seus;
// a ordenação é uma função pura, testada sem DOM (commands.test.ts).

export interface Command {
  id: string;
  label: string;
  /** Seção da paleta ("Ações do tópico", "Documento", "Ir para"…). */
  group: string;
  /** Palavras extras que também acham o comando (sinônimos). */
  keywords?: string;
  shortcut?: string;
  icon?: ComponentType<{ size?: number }>;
  run: () => void;
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

/**
 * Ordena por relevância: começo do rótulo, depois começo de palavra, depois
 * "contém" (inclusive nas palavras-chave). Dentro de cada faixa, a ordem de
 * registro é mantida. Consulta vazia devolve tudo, na ordem original.
 */
export function rankCommands(commands: readonly Command[], query: string): Command[] {
  const q = normalize(query.trim());
  if (!q) return [...commands];
  const scored: Array<{ command: Command; score: number; order: number }> = [];
  commands.forEach((command, order) => {
    const label = normalize(command.label);
    const extra = normalize(command.keywords ?? '');
    let score = -1;
    if (label.startsWith(q)) score = 0;
    else if (label.split(/[\s/–-]+/).some((word) => word.startsWith(q))) score = 1;
    else if (label.includes(q) || extra.includes(q)) score = 2;
    if (score >= 0) scored.push({ command, score, order });
  });
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.map((s) => s.command);
}
