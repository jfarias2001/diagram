import { computeTreeRepairs, nodesMap, type NodeRecord, readNodes, repairTree } from '@diagram/shared';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';

/** Origem das alterações feitas por este usuário (o desfazer só olha estas). */
export const LOCAL_ORIGIN = Symbol('local-edit');
const REPAIR_ORIGIN = Symbol('tree-repair');

/**
 * Snapshot imutável dos nós do Y.Doc, atualizado a cada mudança (local ou
 * remota). Só os componentes que dependem do snapshot re-renderizam.
 */
export function useMindMapNodes(doc: Y.Doc, canRepair: boolean): NodeRecord {
  const store = useMemo(() => {
    let snapshot = readNodes(doc);
    return {
      subscribe(onChange: () => void) {
        const map = nodesMap(doc);
        const handler = () => {
          snapshot = readNodes(doc);
          onChange();
        };
        map.observeDeep(handler);
        return () => map.unobserveDeep(handler);
      },
      get: () => snapshot,
    };
  }, [doc]);

  const nodes = useSyncExternalStore(store.subscribe, store.get);

  // Reparo de árvore (SPEC-001 §2.2): órfãos e ciclos voltam para a raiz.
  // Determinístico, então vários clientes reparando juntos convergem.
  useEffect(() => {
    if (canRepair && computeTreeRepairs(nodes).length > 0) repairTree(doc, REPAIR_ORIGIN);
  }, [doc, nodes, canRepair]);

  return nodes;
}

/**
 * Desfazer/refazer só das alterações deste usuário. Criado dentro do efeito
 * (não em useMemo) para o StrictMode não deixar um manager já destruído em uso.
 */
export function useUndoManager(doc: Y.Doc): Y.UndoManager | null {
  const [manager, setManager] = useState<Y.UndoManager | null>(null);
  useEffect(() => {
    const m = new Y.UndoManager(nodesMap(doc), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 });
    setManager(m);
    return () => {
      m.destroy();
      setManager(null);
    };
  }, [doc]);
  return manager;
}
