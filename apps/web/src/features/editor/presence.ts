import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

// SPEC-009 §5.7 — quem dos colegas está com cada bloco selecionado.
//
// Antes, as seleções viviam num Map no `useMemo` do mapa inteiro: um colega
// trocar de seleção reconstruía os 1.000 nós. Agora cada bloco assina só a
// própria lista, e a store avisa apenas os blocos cuja lista mudou — trocar
// de seleção re-renderiza 2 nós. É o pré-requisito do cursor ao vivo (PRD-011).
//
// Nome e cor já chegam validados pelo servidor (collab/plugin.ts).

export interface Peer {
  name: string;
  color: string;
}

const NONE: Peer[] = [];
const FALLBACK_COLOR = '#5c7cfa';

/** Seleções por id de bloco, a partir dos estados do awareness (pura). */
export function computeSelections(states: Iterable<[number, Record<string, unknown>]>, selfId: number): Map<string, Peer[]> {
  const out = new Map<string, Peer[]>();
  for (const [clientId, state] of states) {
    if (clientId === selfId) continue;
    const selected = state.selected;
    const user = state.user as { name?: unknown; color?: unknown } | undefined;
    if (typeof selected !== 'string' || typeof user?.name !== 'string' || !user.name) continue;
    const list = out.get(selected) ?? [];
    list.push({ name: user.name, color: typeof user.color === 'string' ? user.color : FALLBACK_COLOR });
    out.set(selected, list);
  }
  return out;
}

const samePeers = (a: Peer[], b: Peer[]) =>
  a.length === b.length && a.every((p, i) => p.name === b[i]?.name && p.color === b[i]?.color);

export interface PresenceStore {
  /** Troca o estado inteiro; avisa só os ids cuja lista mudou. Devolve esses ids. */
  update(next: Map<string, Peer[]>): string[];
  get(id: string): Peer[];
  subscribe(id: string, listener: () => void): () => void;
}

export function createPresenceStore(): PresenceStore {
  let current = new Map<string, Peer[]>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    update(next) {
      const changed: string[] = [];
      const merged = new Map<string, Peer[]>();
      for (const [id, peers] of next) {
        const before = current.get(id);
        // Lista igual mantém a MESMA referência: useSyncExternalStore não re-renderiza.
        if (before && samePeers(before, peers)) merged.set(id, before);
        else {
          merged.set(id, peers);
          changed.push(id);
        }
      }
      for (const id of current.keys()) if (!next.has(id)) changed.push(id);
      current = merged;
      for (const id of changed) listeners.get(id)?.forEach((l) => l());
      return changed;
    },
    get: (id) => current.get(id) ?? NONE,
    subscribe(id, listener) {
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },
  };
}

/** Liga a store ao awareness do documento (sem provider, no modo versão: vazia). */
export function usePresenceStore(provider: HocuspocusProvider | null): PresenceStore {
  const [store] = useState(createPresenceStore);
  useEffect(() => {
    const awareness = provider?.awareness;
    if (!awareness) return;
    const sync = () =>
      store.update(
        computeSelections(awareness.getStates() as Map<number, Record<string, unknown>>, awareness.clientID),
      );
    awareness.on('change', sync);
    sync();
    return () => {
      awareness.off('change', sync);
      store.update(new Map());
    };
  }, [provider, store]);
  return store;
}

export const PresenceContext = createContext<PresenceStore | null>(null);

const noop = () => () => {};

/** Colegas com este bloco selecionado — o bloco re-renderiza só quando ELA muda. */
export function usePeersFor(id: string): Peer[] {
  const store = useContext(PresenceContext);
  return useSyncExternalStore(
    store ? (listener) => store.subscribe(id, listener) : noop,
    () => (store ? store.get(id) : NONE),
    () => NONE,
  );
}
