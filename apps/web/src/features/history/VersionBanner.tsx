import type { DocumentSummary, RestoreResult, VersionSummary } from '@diagram/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button, ErrorText } from '../../components/ui';
import { api } from '../../lib/api';

// Faixa do modo versão (SPEC-005 §5.2).

export function VersionBanner({
  documentId,
  version,
  canRestore,
  canSave,
  onBack,
}: {
  documentId: string;
  version: VersionSummary;
  canRestore: boolean;
  /** Restaurar só faz sentido com a conexão em dia. */
  canSave: boolean;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const restore = useMutation({
    mutationFn: () =>
      api<RestoreResult>(`/documents/${documentId}/versions/${version.id}/restore`, { method: 'POST', json: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions', documentId] });
      onBack(); // o quadro atual já chega restaurado pelo Yjs
    },
  });

  const copy = useMutation({
    mutationFn: () =>
      api<DocumentSummary>(`/documents/${documentId}/versions/${version.id}/copy`, { method: 'POST', json: {} }),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/m/${doc.id}`);
    },
  });

  const moment = new Date(version.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-filament bg-filament/15 px-4 py-2 text-sm"
    >
      <span className="font-medium">
        Você está vendo a versão de {moment}
        {version.name ? ` — "${version.name}"` : ''}. O documento atual não muda enquanto você olha.
      </span>
      <div className="ml-auto flex items-center gap-2">
        {canRestore && (
          <Button
            variant="primary"
            busy={restore.isPending}
            disabled={!canSave}
            onClick={() => {
              if (window.confirm('Restaurar esta versão? O estado atual fica guardado como uma versão nova.')) {
                restore.mutate();
              }
            }}
          >
            Restaurar esta versão
          </Button>
        )}
        <Button busy={copy.isPending} onClick={() => copy.mutate()}>
          Salvar como cópia
        </Button>
        <Button onClick={onBack}>Voltar ao atual</Button>
      </div>
      <ErrorText error={restore.error ?? copy.error} />
    </div>
  );
}
