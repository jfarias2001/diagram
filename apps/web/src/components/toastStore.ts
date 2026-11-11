import { useSyncExternalStore } from 'react';

// SPEC-009 §5.4 — fila de avisos. Fica em memória: é efêmera e não sai do
// navegador. A regra de tempo é testada sem DOM (toast.test.ts).

export type ToastTone = 'ok' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Em ms. Padrão: 6 s com ação (PRD-009 §9.2), 4 s sem. */
  duration?: number;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** A ação já rodou (o botão some — roda uma vez só). */
  acted: boolean;
}

export const MAX_TOASTS = 3;
export const ACTION_MS = 6000;
export const PLAIN_MS = 4000;

interface Timer {
  remaining: number;
  startedAt: number;
  handle: ReturnType<typeof setTimeout> | null;
}

let items: ToastItem[] = [];
let nextId = 1;
const timers = new Map<number, Timer>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function start(id: number) {
  const timer = timers.get(id);
  if (!timer || timer.handle) return;
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => dismissToast(id), timer.remaining);
}

export function toast(input: ToastInput): number {
  const id = nextId++;
  const item: ToastItem = {
    id,
    message: input.message,
    tone: input.tone ?? 'ok',
    action: input.action,
    acted: false,
  };
  items = [...items, item];
  // O mais antigo sai quando passa do teto.
  while (items.length > MAX_TOASTS) {
    const oldest = items[0];
    if (!oldest) break;
    dismissToast(oldest.id, false);
  }
  timers.set(id, {
    remaining: input.duration ?? (input.action ? ACTION_MS : PLAIN_MS),
    startedAt: Date.now(),
    handle: null,
  });
  start(id);
  emit();
  return id;
}

export function dismissToast(id: number, notify = true) {
  const timer = timers.get(id);
  if (timer?.handle) clearTimeout(timer.handle);
  timers.delete(id);
  const before = items.length;
  items = items.filter((t) => t.id !== id);
  if (notify && items.length !== before) emit();
}

/** Mouse ou foco em cima: o tempo para de correr. */
export function pauseToast(id: number) {
  const timer = timers.get(id);
  if (!timer?.handle) return;
  clearTimeout(timer.handle);
  timer.handle = null;
  timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
}

export function resumeToast(id: number) {
  start(id);
}

/** Roda a ação do aviso uma vez só; cliques repetidos são ignorados. */
export async function runToastAction(id: number): Promise<void> {
  const item = items.find((t) => t.id === id);
  if (!item?.action || item.acted) return;
  items = items.map((t) => (t.id === id ? { ...t, acted: true } : t));
  emit();
  const action = item.action;
  dismissToast(id);
  try {
    await action.run();
  } catch (error) {
    toast({ message: errorMessage(error), tone: 'error' });
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Algo deu errado. Tente de novo.';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): ToastItem[] {
  return items;
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, getToasts, getToasts);
}

/** Só para teste: zera a fila. */
export function resetToasts() {
  for (const timer of timers.values()) if (timer.handle) clearTimeout(timer.handle);
  timers.clear();
  items = [];
  emit();
}
