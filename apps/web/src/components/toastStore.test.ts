import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_MS,
  dismissToast,
  getToasts,
  MAX_TOASTS,
  pauseToast,
  PLAIN_MS,
  resetToasts,
  resumeToast,
  runToastAction,
  toast,
} from './toastStore';

// SPEC-009 §5.4 / §7 — a regra de tempo dos avisos, sem DOM.

const current = getToasts;

beforeEach(() => {
  vi.useFakeTimers();
  resetToasts();
});
afterEach(() => vi.useRealTimers());

describe('avisos', () => {
  it('com ação dura 6 s; sem ação, 4 s (PRD-009 §9.2)', () => {
    toast({ message: 'Movido', action: { label: 'Desfazer', run: () => {} } });
    toast({ message: 'Renomeado' });
    vi.advanceTimersByTime(PLAIN_MS - 1);
    expect(current()).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(current().map((t) => t.message)).toEqual(['Movido']);
    vi.advanceTimersByTime(ACTION_MS - PLAIN_MS);
    expect(current()).toHaveLength(0);
  });

  it('pausa com o mouse em cima e retoma de onde parou', () => {
    const id = toast({ message: 'Na lixeira', action: { label: 'Desfazer', run: () => {} } });
    vi.advanceTimersByTime(5000);
    pauseToast(id);
    vi.advanceTimersByTime(60_000);
    expect(current()).toHaveLength(1);
    resumeToast(id);
    vi.advanceTimersByTime(999);
    expect(current()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(current()).toHaveLength(0);
  });

  it(`guarda no máximo ${MAX_TOASTS}: o mais antigo sai`, () => {
    for (let i = 1; i <= 5; i++) toast({ message: `aviso ${i}` });
    expect(current().map((t) => t.message)).toEqual(['aviso 3', 'aviso 4', 'aviso 5']);
  });

  it('a ação roda uma vez só, mesmo com clique duplo', async () => {
    const run = vi.fn();
    const id = toast({ message: 'Na lixeira', action: { label: 'Desfazer', run } });
    await Promise.all([runToastAction(id), runToastAction(id)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(current().some((t) => t.id === id)).toBe(false);
  });

  it('se a ação falhar, aparece um aviso de erro com a mensagem', async () => {
    const id = toast({
      message: 'Na lixeira',
      action: {
        label: 'Desfazer',
        run: () => Promise.reject(new Error('Sem permissão para restaurar.')),
      },
    });
    await runToastAction(id);
    expect(current()).toEqual([expect.objectContaining({ tone: 'error', message: 'Sem permissão para restaurar.' })]);
  });

  it('fechar na mão cancela o tempo', () => {
    const id = toast({ message: 'Ok' });
    dismissToast(id);
    vi.advanceTimersByTime(PLAIN_MS);
    expect(current()).toHaveLength(0);
  });
});
