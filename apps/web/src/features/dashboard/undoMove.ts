import type { FolderKind } from '@diagram/shared';

// SPEC-009 §3 — "Desfazer" de um mover: só rotas que já existem, com as
// mesmas checagens no servidor. Função pura, para o caso difícil (trocar de
// tipo de pasta) ter teste sem DOM nem rede.

export interface FolderRef {
  id: string;
  kind: FolderKind;
}

export interface MoveStep {
  route: 'personal-folder' | 'shared-folder';
  folderId: string | null;
}

const routeOf = (kind: FolderKind): MoveStep['route'] => (kind === 'SHARED' ? 'shared-folder' : 'personal-folder');

/**
 * Passos para voltar um documento de `target` (para onde foi movido; `null` =
 * "sem pasta", pela rota pessoal) para `previous` (onde estava; `null` = sem pasta).
 */
export function undoMoveSteps(previous: FolderRef | null, target: FolderRef | null): MoveStep[] {
  const steps: MoveStep[] = [];
  const targetKind: FolderKind = target?.kind ?? 'PERSONAL';
  // Saiu de um tipo de pasta para outro: tira do tipo novo primeiro.
  if (target && targetKind !== previous?.kind) steps.push({ route: routeOf(targetKind), folderId: null });
  if (previous) steps.push({ route: routeOf(previous.kind), folderId: previous.id });
  else if (!target || targetKind === 'PERSONAL') steps.push({ route: 'personal-folder', folderId: null });
  // Sem pasta antes e movido para uma compartilhada: o passo acima já basta.
  return dedupe(steps);
}

function dedupe(steps: MoveStep[]): MoveStep[] {
  const seen = new Set<string>();
  return steps.filter((s) => {
    const key = `${s.route}:${s.folderId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
