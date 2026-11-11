import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Button, Modal } from './ui';

// SPEC-009 §5.4 — confirmação do próprio sistema no lugar do window.confirm.
// O foco começa em "Cancelar": Enter por engano nunca apaga nada.

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false); // um pedido novo cancela o anterior
    setRequest(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={open}
        onClose={() => finish(false)}
        title={request?.title ?? ''}
        footer={
          <>
            <Button autoFocus onClick={() => finish(false)}>
              Cancelar
            </Button>
            <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
              {request?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        {request?.body && <div className="text-sm text-muted">{request.body}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm fora do ConfirmProvider');
  return confirm;
}
