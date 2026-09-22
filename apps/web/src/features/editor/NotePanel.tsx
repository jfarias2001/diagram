import { type MindMapNode, NODE_NOTE_MAX, updateNode } from '@diagram/shared';
import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { IconClose } from './icons';
import { LOCAL_ORIGIN } from './useMindMap';

// Painel lateral da nota do tópico selecionado (SPEC-002 §5.5).

const SAVE_DELAY_MS = 500;

export function NotePanel({
  doc,
  node,
  canEdit,
  onClose,
}: {
  doc: Y.Doc;
  node: MindMapNode | undefined;
  canEdit: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Nota do tópico"
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-line bg-surface shadow-lg sm:w-[360px]"
      onKeyDown={(e) => {
        // Atalhos do mapa não disparam de dentro do painel.
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Nota</p>
          <h2 className="truncate font-display text-base font-semibold" title={node?.text}>
            {node ? node.text || 'Tópico sem texto' : 'Selecione um tópico'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar nota (Esc)"
          title="Fechar nota (Esc)"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <IconClose />
        </button>
      </header>

      {!node ? (
        <p className="p-4 text-sm text-muted">Clique num tópico do mapa para ver ou escrever a nota dele.</p>
      ) : canEdit ? (
        <NoteEditor key={node.id} doc={doc} nodeId={node.id} remote={node.note ?? ''} />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap break-words">
          {/* Texto sempre como texto — nunca HTML (CLAUDE.md §9). */}
          {node.note || <span className="text-muted">Este tópico não tem nota.</span>}
        </div>
      )}
    </aside>
  );
}

function NoteEditor({ doc, nodeId, remote }: { doc: Y.Doc; nodeId: string; remote: string }) {
  const [value, setValue] = useState(remote);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const flush = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    updateNode(doc, nodeId, { note: latest.current }, LOCAL_ORIGIN);
  };

  // Alteração de um colega só aparece quando eu não estou digitando (vale a última gravação).
  useEffect(() => {
    if (!focused.current && !timer.current) setValue(remote);
  }, [remote]);

  // Ao trocar de tópico ou fechar o painel, grava o que estiver pendente.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só no desmonte
  useEffect(() => flush, []);

  return (
    <div className="flex flex-1 flex-col gap-2 p-4">
      <textarea
        autoFocus
        aria-label="Texto da nota"
        placeholder="Escreva detalhes, observações, próximos passos…"
        value={value}
        maxLength={NODE_NOTE_MAX}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          flush();
        }}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            updateNode(doc, nodeId, { note: latest.current }, LOCAL_ORIGIN);
          }, SAVE_DELAY_MS);
        }}
        className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink placeholder:text-muted focus:border-filament focus:outline-none"
      />
      <p className="text-right text-xs text-muted tabular-nums">
        {value.length.toLocaleString('pt-BR')} / {NODE_NOTE_MAX.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
