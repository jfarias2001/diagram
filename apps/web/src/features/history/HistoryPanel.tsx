import type { VersionList, VersionSummary } from '@diagram/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, ErrorText, Input, relativeTime, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { IconClose } from '../../components/icons';

// Painel de histórico do documento (SPEC-005 §5.1). Todos os papéis veem;
// só Editor e Dono criam e restauram.

const KIND_LABEL: Record<VersionSummary['kind'], string> = {
  AUTO: 'Automática',
  NAMED: 'Salva com nome',
  CHECKPOINT: 'Ponto de segurança',
};

export function useVersions(documentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['versions', documentId],
    enabled,
    queryFn: ({ pageParam }) =>
      api<VersionList>(`/documents/${documentId}/versions${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function HistoryPanel({
  documentId,
  canEdit,
  viewingId,
  onView,
  onClose,
}: {
  documentId: string;
  canEdit: boolean;
  /** Versão aberta no modo somente leitura, se houver. */
  viewingId: string | null;
  onView: (version: VersionSummary) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const list = useVersions(documentId, true);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['versions', documentId] });
  const save = useMutation({
    mutationFn: () =>
      api(`/documents/${documentId}/versions`, { method: 'POST', json: { kind: 'NAMED', name: name.trim() } }),
    onSuccess: () => {
      setNaming(false);
      setName('');
      invalidate();
    },
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <aside
      aria-label="Histórico de versões"
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-line bg-surface shadow-lg sm:w-[360px]"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Histórico</p>
          <h2 className="font-display text-base font-semibold">Versões deste documento</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar histórico (Esc)"
          title="Fechar histórico (Esc)"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
        >
          <IconClose />
        </button>
      </header>

      {canEdit && (
        <div className="border-b border-line px-4 py-3">
          {naming ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) save.mutate();
              }}
            >
              <Input
                autoFocus
                aria-label="Nome da versão"
                placeholder="Ex.: Aprovado pela diretoria"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" busy={save.isPending} disabled={!name.trim()}>
                  Salvar versão
                </Button>
                <Button onClick={() => setNaming(false)}>Cancelar</Button>
              </div>
            </form>
          ) : (
            <Button onClick={() => setNaming(true)}>Salvar versão com nome</Button>
          )}
          <ErrorText error={save.error} />
        </div>
      )}

      <ErrorText error={list.error} />

      {list.isPending ? (
        <div className="flex justify-center py-10 text-muted">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted">
          Ainda não há versões guardadas deste documento. Elas aparecem sozinhas enquanto o documento é editado.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {items.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => onView(version)}
                aria-current={viewingId === version.id}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-line px-4 py-3 text-left transition hover:bg-surface-2 ${
                  viewingId === version.id ? 'bg-surface-2' : ''
                }`}
              >
                <span className="text-sm font-medium">{version.name ?? KIND_LABEL[version.kind]}</span>
                <span className="text-xs text-muted">
                  {new Date(version.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                  {relativeTime(version.createdAt)}
                </span>
                {version.editors.length > 0 && (
                  <span className="text-xs text-muted">
                    Editado por {version.editors.map((e) => e.name.split(' ')[0]).join(', ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {list.hasNextPage && (
        <div className="border-t border-line p-3">
          <Button onClick={() => list.fetchNextPage()} busy={list.isFetchingNextPage}>
            Carregar mais
          </Button>
        </div>
      )}
    </aside>
  );
}
