import { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';

// SPEC-001 §4/§5.2 — conexão Yjs com o servidor. O cookie de sessão e o
// Origin vão automaticamente no handshake do WebSocket.

export type SaveStatus = 'connecting' | 'saving' | 'saved' | 'offline';

export interface CollabState {
  status: SaveStatus;
  synced: boolean;
  /** Decidido pelo servidor (papel VIEWER/COMMENTER). */
  readOnly: boolean;
  /** Motivo da recusa: 'not-found', 'unauthenticated', ... */
  failed: string | null;
}

export interface CollabSession {
  doc: Y.Doc;
  provider: HocuspocusProvider;
}

function collabUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/collab`;
}

export function useCollab(documentId: string) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [state, setState] = useState<CollabState>({
    status: 'connecting',
    synced: false,
    readOnly: true,
    failed: null,
  });

  useEffect(() => {
    const doc = new Y.Doc();
    let connected = false;
    let unsynced = 0;
    const statusOf = (): SaveStatus => (!connected ? 'offline' : unsynced > 0 ? 'saving' : 'saved');

    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: documentId,
      document: doc,
      // O servidor autentica pelo cookie; o token só dispara o fluxo de auth.
      token: 'session',
      onStatus: ({ status }) => {
        connected = status === 'connected';
        setState((s) => ({ ...s, status: s.synced ? statusOf() : connected ? 'connecting' : 'offline' }));
      },
      onAuthenticated: ({ scope }) => setState((s) => ({ ...s, readOnly: scope !== 'read-write', failed: null })),
      onAuthenticationFailed: ({ reason }) => setState((s) => ({ ...s, failed: reason })),
      onSynced: () => setState((s) => ({ ...s, synced: true, status: statusOf() })),
      onUnsyncedChanges: ({ number }) => {
        unsynced = number;
        setState((s) => (s.synced ? { ...s, status: statusOf() } : s));
      },
    });

    setSession({ doc, provider });
    return () => {
      provider.destroy();
      doc.destroy();
      setSession(null);
      setState({ status: 'connecting', synced: false, readOnly: true, failed: null });
    };
  }, [documentId]);

  return { session, state };
}
