import type { VersionSummary } from '@diagram/shared';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';

// Modo versão (SPEC-005 §5.2): o conteúdo da versão é montado num Y.Doc local,
// só para olhar. Nada daqui é enviado ao servidor.

export interface VersionPreview {
  version: VersionSummary;
  doc: Y.Doc;
}

export function useVersionPreview(documentId: string, version: VersionSummary | null) {
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!version) {
      setPreview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const doc = new Y.Doc();
    setError(null);
    setPreview(null);

    fetch(`/api/v1/documents/${documentId}/versions/${version.id}/content`, { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Não foi possível abrir esta versão.');
        return new Uint8Array(await res.arrayBuffer());
      })
      .then((state) => {
        if (cancelled) return;
        Y.applyUpdate(doc, state);
        setPreview({ version, doc });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err);
      });

    return () => {
      cancelled = true;
      doc.destroy();
    };
  }, [documentId, version]);

  return { preview, error };
}
