import type { DocumentMemberView, Role } from '@diagram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, Button, ErrorText, Input, Modal, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { INLINE_ERROR } from '../../lib/mutations';
import { useConfirm } from '../../components/ConfirmDialog';
import { toast } from '../../components/toastStore';
import { Deferred, RowsSkeleton } from '../../components/Skeleton';

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dono',
  EDITOR: 'Pode editar',
  COMMENTER: 'Pode comentar',
  VIEWER: 'Só visualizar',
};
type ShareRole = Exclude<Role, 'OWNER'>;

export function ShareDialog({
  documentId,
  myRole,
  myId,
  open,
  onClose,
}: {
  documentId: string;
  myRole: Role;
  myId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const key = ['members', documentId];
  const isOwner = myRole === 'OWNER';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('EDITOR');

  const members = useQuery({
    queryKey: key,
    queryFn: () => api<{ items: DocumentMemberView[] }>(`/documents/${documentId}/members`),
    enabled: open,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    ...INLINE_ERROR,
    mutationFn: () => api(`/documents/${documentId}/members`, { method: 'POST', json: { email, role } }),
    onSuccess: () => {
      setEmail('');
      refresh();
      toast({ message: 'Acesso compartilhado.' });
    },
  });
  const change = useMutation({
    mutationFn: (v: { userId: string; role: ShareRole }) =>
      api(`/documents/${documentId}/members/${v.userId}`, { method: 'PATCH', json: { role: v.role } }),
    onSuccess: () => {
      refresh();
      toast({ message: 'Papel atualizado.' });
    },
  });
  // O membro removido é guardado antes (onMutate): o "Desfazer" convida de
  // novo com o mesmo e-mail e papel, pela mesma rota de convite (SPEC-009 §3).
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/documents/${documentId}/members/${userId}`, { method: 'DELETE' }),
    onMutate: (userId) => members.data?.items.find((m) => m.userId === userId),
    onSuccess: (_r, userId, removed) => {
      if (userId === myId) {
        navigate('/');
        return;
      }
      refresh();
      if (!removed || removed.role === 'OWNER') return;
      toast({
        message: `${removed.name} não tem mais acesso.`,
        action: {
          label: 'Desfazer',
          run: async () => {
            await api(`/documents/${documentId}/members`, {
              method: 'POST',
              json: { email: removed.email, role: removed.role },
            });
            refresh();
            toast({ message: `${removed.name} tem acesso de novo.` });
          },
        },
      });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) add.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="Compartilhar mapa" footer={<Button onClick={onClose}>Fechar</Button>}>
      {isOwner && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="share-email">
            Convidar pelo e-mail
          </label>
          <div className="flex gap-2">
            <Input
              id="share-email"
              type="email"
              placeholder="colega@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <Select aria-label="Papel" value={role} onChange={(e) => setRole(e.target.value as ShareRole)} className="w-40">
              <option value="EDITOR">{ROLE_LABEL.EDITOR}</option>
              <option value="COMMENTER">{ROLE_LABEL.COMMENTER}</option>
              <option value="VIEWER">{ROLE_LABEL.VIEWER}</option>
            </Select>
          </div>
          <Button type="submit" variant="primary" busy={add.isPending} disabled={!email.trim()} className="self-end">
            Adicionar
          </Button>
        </form>
      )}

      <ErrorText error={add.error ?? members.error} />

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Quem tem acesso</p>
        {members.isPending ? (
          <Deferred loading skeleton={<RowsSkeleton rows={3} avatar />}>
            {() => null}
          </Deferred>
        ) : (
          <ul className="flex max-h-72 flex-col overflow-y-auto">
            {members.data?.items.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {m.userId === myId && <span className="font-normal text-muted">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                {isOwner && m.role !== 'OWNER' ? (
                  <>
                    <Select
                      aria-label={`Papel de ${m.name}`}
                      value={m.role}
                      onChange={(e) => change.mutate({ userId: m.userId, role: e.target.value as ShareRole })}
                      className="h-8 w-36 text-xs"
                    >
                      <option value="EDITOR">{ROLE_LABEL.EDITOR}</option>
                      <option value="COMMENTER">{ROLE_LABEL.COMMENTER}</option>
                      <option value="VIEWER">{ROLE_LABEL.VIEWER}</option>
                    </Select>
                    <button
                      type="button"
                      aria-label={`Remover ${m.name}`}
                      onClick={() => remove.mutate(m.userId)}
                      className="rounded-md px-2 py-1 text-xs text-danger hover:bg-surface-2"
                    >
                      Remover
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isOwner && (
        <Button
          variant="ghost"
          className="self-start text-danger"
          onClick={async () => {
            const ok = await confirm({
              title: 'Sair deste documento?',
              body: 'Você perde o acesso até ser convidado de novo.',
              confirmLabel: 'Sair',
              danger: true,
            });
            if (ok) remove.mutate(myId);
          }}
        >
          Sair deste mapa
        </Button>
      )}
    </Modal>
  );
}
