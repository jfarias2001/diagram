import { type DiagramSnapshot, danglingEdges, edgesMap, readDiagram, repairDiagram, shapesMap } from '@diagram/shared';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { LOCAL_ORIGIN } from '../editor/useMindMap';

const REPAIR_ORIGIN = Symbol('diagram-repair');

/** Snapshot imutável do fluxograma, atualizado a cada mudança local ou remota (SPEC-003 §5.2). */
export function useDiagram(doc: Y.Doc, canRepair: boolean): DiagramSnapshot {
  const store = useMemo(() => {
    let snapshot = readDiagram(doc);
    return {
      subscribe(onChange: () => void) {
        const shapes = shapesMap(doc);
        const edges = edgesMap(doc);
        const handler = () => {
          snapshot = readDiagram(doc);
          onChange();
        };
        shapes.observeDeep(handler);
        edges.observeDeep(handler);
        return () => {
          shapes.unobserveDeep(handler);
          edges.unobserveDeep(handler);
        };
      },
      get: () => snapshot,
    };
  }, [doc]);

  const snapshot = useSyncExternalStore(store.subscribe, store.get);

  // Conectores soltos por edição concorrente: apagados (SPEC-003 §2.2). Fora do desfazer.
  useEffect(() => {
    if (canRepair && danglingEdges(doc).length > 0) repairDiagram(doc, REPAIR_ORIGIN);
  }, [doc, snapshot, canRepair]);

  return snapshot;
}

/** Desfazer/refazer só das alterações deste usuário, nas formas e nos conectores. */
export function useDiagramUndo(doc: Y.Doc): Y.UndoManager | null {
  const [manager, setManager] = useState<Y.UndoManager | null>(null);
  useEffect(() => {
    const m = new Y.UndoManager([shapesMap(doc), edgesMap(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 400,
    });
    setManager(m);
    return () => {
      m.destroy();
      setManager(null);
    };
  }, [doc]);
  return manager;
}
