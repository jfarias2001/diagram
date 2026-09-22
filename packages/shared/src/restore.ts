import * as Y from 'yjs';
import { readDiagram, repairDiagram } from './diagram.js';
import type { MindMapNode } from './document.js';
import { readNodes, repairTree } from './ydoc.js';

// Restaurar uma versão (SPEC-005 §2.3). Em vez de trocar o estado binário — o
// que quebraria a sincronização de quem está com o documento aberto —, o
// conteúdo vivo é **reconciliado** com o da versão, dentro de uma transação.
// Funciona igual para mapa e fluxograma porque os dois são mapas planos por id.

/** Raízes de conteúdo do documento. `meta` fica de fora: é só a versão do formato. */
const CONTENT_MAPS = ['nodes', 'shapes', 'edges'] as const;

function writeInto(map: Y.Map<Y.Map<unknown>>, id: string, fields: Record<string, unknown>) {
  const y = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) y.set(key, value);
  }
  map.set(id, y);
}

/** Campos de um nó de mapa, do jeito que `readNode` os entrega (já validados). */
function nodeFields(node: MindMapNode): Record<string, unknown> {
  const { id: _id, ...fields } = node;
  return fields;
}

/**
 * Deixa `live` com o mesmo conteúdo de `state`, preservando o CRDT: as chaves
 * que sumiram são apagadas e as que existem são reescritas com os valores da
 * versão — sempre passando pelos leitores defensivos, então uma versão antiga
 * com lixo (cor inválida, link `javascript:`, coordenada absurda) não volta.
 */
export function applySnapshotState(live: Y.Doc, state: Uint8Array, origin?: unknown): void {
  const from = new Y.Doc();
  Y.applyUpdate(from, state);

  const nodes = readNodes(from);
  const diagram = readDiagram(from);

  const content: Record<(typeof CONTENT_MAPS)[number], Record<string, Record<string, unknown>>> = {
    nodes: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, nodeFields(node)])),
    shapes: Object.fromEntries(Object.entries(diagram.shapes).map(([id, s]) => [id, omitId(s)])),
    edges: Object.fromEntries(Object.entries(diagram.edges).map(([id, e]) => [id, omitId(e)])),
  };

  live.transact(() => {
    for (const name of CONTENT_MAPS) {
      const map = live.getMap<Y.Map<unknown>>(name);
      const target = content[name];
      for (const id of [...map.keys()]) {
        if (!target[id]) map.delete(id);
      }
      for (const [id, fields] of Object.entries(target)) writeInto(map, id, fields);
    }
  }, origin);

  // Rede de segurança de sempre: árvore sem órfãos e sem conector solto.
  repairTree(live, origin);
  repairDiagram(live, origin);
}

function omitId<T extends { id: string }>(value: T): Record<string, unknown> {
  const { id: _id, ...rest } = value;
  return rest;
}
