import type { DocumentSummary } from '@diagram/shared';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';
import { EditorHeader } from '../editor/EditorHeader';
import { ShortcutHint } from '../editor/ShortcutHint';
import type { CollabState } from '../editor/useCollab';
import { DiagramCanvas } from './DiagramCanvas';
import { useDiagram, useDiagramUndo } from './useDiagram';

const SHORTCUTS: Array<[string, string]> = [
  ['Arrastar da paleta', 'nova forma'],
  ['Arrastar da borda', 'ligar com seta'],
  ['Duplo clique', 'editar texto'],
  ['Delete', 'apagar seleção'],
  ['Setas (Shift = mais)', 'mover seleção'],
  ['Arrastar no fundo', 'selecionar várias'],
  ['Espaço + arrastar', 'mover o quadro'],
  ['Roda do mouse', 'zoom'],
  ['Alt (segurando)', 'soltar da grade'],
  ['Ctrl+C / V / D', 'copiar, colar, duplicar'],
  ['Ctrl+Z / Ctrl+Y', 'desfazer/refazer'],
];

const READ_ONLY_SHORTCUTS: Array<[string, string]> = [
  ['Espaço + arrastar', 'mover o quadro'],
  ['Roda do mouse', 'zoom'],
];

export default function DiagramEditor({
  doc,
  provider,
  meta,
  state,
}: {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  meta: DocumentSummary;
  state: CollabState;
}) {
  const canEdit = !state.readOnly;
  const diagram = useDiagram(doc, canEdit);
  const undo = useDiagramUndo(doc);

  return (
    <div className="flex h-full flex-col">
      <EditorHeader meta={meta} state={state} provider={provider} />
      <div className="relative flex-1">
        <DiagramCanvas doc={doc} diagram={diagram} provider={provider} canEdit={canEdit} undo={undo} />
        <ShortcutHint rows={canEdit ? SHORTCUTS : READ_ONLY_SHORTCUTS} />
      </div>
    </div>
  );
}
