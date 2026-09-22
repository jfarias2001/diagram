import { useCallback } from 'react';
import { api } from '../../lib/api';

// Versão de segurança antes de uma operação grande (PRD-005 §5.2): organizar
// automaticamente mexe na posição de tudo de uma vez.

/**
 * Dispara a gravação e não espera: organizar não pode ficar travado — nem
 * falhar — por causa do histórico. Leitor não chega aqui (o botão não existe).
 */
export function useCheckpoint(documentId: string, enabled: boolean) {
  return useCallback(
    (name: string) => {
      if (!enabled) return;
      void api(`/documents/${documentId}/versions`, {
        method: 'POST',
        json: { kind: 'CHECKPOINT', name },
      }).catch(() => {
        /* silencioso de propósito */
      });
    },
    [documentId, enabled],
  );
}
