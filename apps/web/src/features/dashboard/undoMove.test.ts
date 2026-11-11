import { describe, expect, it } from 'vitest';
import { undoMoveSteps } from './undoMove';

// SPEC-009 §3 / §7 — o "Desfazer" do mover usa só as rotas existentes.

const personalA = { id: 'A', kind: 'PERSONAL' as const };
const personalC = { id: 'C', kind: 'PERSONAL' as const };
const sharedB = { id: 'B', kind: 'SHARED' as const };

describe('undoMoveSteps', () => {
  it('pessoal → pessoal: volta para a pasta anterior', () => {
    expect(undoMoveSteps(personalA, personalC)).toEqual([{ route: 'personal-folder', folderId: 'A' }]);
  });

  it('pessoal A → compartilhada B: sai de B e volta para A', () => {
    expect(undoMoveSteps(personalA, sharedB)).toEqual([
      { route: 'shared-folder', folderId: null },
      { route: 'personal-folder', folderId: 'A' },
    ]);
  });

  it('compartilhada → pessoal: sai da pessoal e volta para a compartilhada', () => {
    expect(undoMoveSteps(sharedB, personalA)).toEqual([
      { route: 'personal-folder', folderId: null },
      { route: 'shared-folder', folderId: 'B' },
    ]);
  });

  it('sem pasta → pessoal: tira da pasta pessoal', () => {
    expect(undoMoveSteps(null, personalA)).toEqual([{ route: 'personal-folder', folderId: null }]);
  });

  it('sem pasta → compartilhada: tira da compartilhada', () => {
    expect(undoMoveSteps(null, sharedB)).toEqual([{ route: 'shared-folder', folderId: null }]);
  });

  it('pessoal → "sem pasta": volta para a pessoal', () => {
    expect(undoMoveSteps(personalA, null)).toEqual([{ route: 'personal-folder', folderId: 'A' }]);
  });
});
