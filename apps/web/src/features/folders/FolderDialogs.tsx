import type { FolderKind, FolderMemberView, FolderNode, FolderRole } from '@diagram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, ErrorText, Field, Input, Modal, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useConfirm } from '../../components/ConfirmDialog';
import { IconEdit, IconTrash, IconUsers } from '../../components/icons';
import type { MenuItem } from '../../components/Menu';
import { errorMessage, toast } from '../../components/toastStore';
import { INLINE_ERROR } from '../../lib/mutations';

// Diálogos das pastas (SPEC-004 §5.2).

const KIND_LABEL: Record<FolderKind, string> = { PERSONAL: 'pasta', SHARED: 'pasta compartilhada' };
const ROLE_LABEL: Record<FolderRole, string> = { EDITOR: 'Editor', VIEWER: 'Leitor' };

export interface FolderDialogState {
  mode: 'create' | 'rename';
  kind: FolderKind;
  parentId: string | null;
  folder?: FolderNode;
}

export function FolderDialog({ state, onClose }: { state: FolderDialogState | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  useEffect(() => setName(state?.folder?.name ?? ''), [state]);

  const save = useMutation({
    ...INLINE_ERROR,
    mutationFn: () =>
      state?.mode === 'rename'
        ? api(`/folders/${state.folder!.id}`, { method: 'PATCH', json: { name: name.trim() } })
        : api('/folders', {
            method: 'POST',
            json: { kind: state?.kind, name: name.trim(), parentId: state?.parentId ?? null },
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      toast({ message: state?.mode === 'rename' ? 'Pasta renomeada.' : `Pasta "${name.trim()}" criada.` });
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) save.mutate();
  };

  const title =
    state?.mode === 'rename'
      ? 'Renomear pasta'
      : state?.parentId
        ? 'Nova subpasta'
        : `Nova ${KIND_LABEL[state?.kind ?? 'PERSONAL']}`;

  return (
    <Modal open={!!state} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Nome"
          hint={
            state?.kind === 'SHARED' && state.mode === 'create' && !state.parentId
              ? 'Depois de criar, adicione os colegas: quem entra na pasta vê todos os documentos dela.'
              : undefined
          }
        >
          {(id, aria) => (
            <Input id={id} {...aria} autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <ErrorText error={save.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" busy={save.isPending} disabled={!name.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Itens do menu "⋯" da pasta (SPEC-009 §5.3): renomear, membros (compartilhada,
 * no nível de cima) e apagar. Era um diálogo; agora é um menu igual ao do
 * documento. Quem decide se pode é o servidor — aqui só escondemos o que o
 * papel não permite (SPEC-004 §7).
 */
export function useFolderMenu({
  onRename,
  onMembers,
  onDeleted,
}: {
  onRename: (folder: FolderNode) => void;
  onMembers: (folder: FolderNode) => void;
  onDeleted: (folder: FolderNode) => void;
}): (folder: FolderNode) => MenuItem[] {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (folder: FolderNode) => api(`/folders/${folder.id}`, { method: 'DELETE' }),
    onSuccess: (_data, folder) => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      onDeleted(folder);
      toast({ message: `Pasta "${folder.name}" apagada. Os documentos continuam existindo.` });
    },
    onError: (error) => toast({ message: errorMessage(error), tone: 'error' }),
  });

  return (folder) => {
    const isOwner = folder.kind === 'PERSONAL' || folder.myRole === 'OWNER';
    const canEdit = isOwner || folder.myRole === 'EDITOR';
    const items: MenuItem[] = [];
    if (canEdit && (isOwner || folder.depth > 0)) {
      items.push({ label: 'Renomear', icon: IconEdit, onSelect: () => onRename(folder) });
    }
    if (folder.kind === 'SHARED' && folder.depth === 0) {
      items.push({
        label: folder.myRole === 'OWNER' ? 'Gerenciar membros' : 'Ver membros',
        icon: IconUsers,
        onSelect: () => onMembers(folder),
      });
    }
    if (isOwner) {
      items.push({
        label: 'Apagar pasta',
        icon: IconTrash,
        danger: true,
        onSelect: async () => {
          const ok = await confirm({
            title: `Apagar a pasta "${folder.name}"?`,
            body:
              'Os documentos continuam existindo e voltam para "sem pasta".' +
              (folder.kind === 'SHARED' ? ' As subpastas são apagadas junto e o acesso pela pasta acaba.' : ''),
            confirmLabel: 'Apagar pasta',
            danger: true,
          });
          if (ok) remove.mutate(folder);
        },
      });
    }
    return items;
  };
}

export function FolderMembersDialog({ folder, onClose }: { folder: FolderNode | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FolderRole>('VIEWER');
  const canManage = folder?.myRole === 'OWNER';

  const members = useQuery({
    queryKey: ['folder-members', folder?.id],
    enabled: !!folder,
    queryFn: () => api<{ items: FolderMemberView[] }>(`/folders/${folder!.id}/members`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['folder-members', folder?.id] });
    qc.invalidateQueries({ queryKey: ['folders'] });
  };
  const add = useMutation({
    ...INLINE_ERROR,
    mutationFn: () => api(`/folders/${folder!.id}/members`, { method: 'POST', json: { email: email.trim(), role } }),
    onSuccess: () => {
      setEmail('');
      invalidate();
      toast({ message: 'Membro adicionado.' });
    },
  });
  const change = useMutation({
    mutationFn: (v: { userId: string; role: FolderRole }) =>
      api(`/folders/${folder!.id}/members/${v.userId}`, { method: 'PATCH', json: { role: v.role } }),
    onSuccess: () => {
      invalidate();
      toast({ message: 'Papel atualizado.' });
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/folders/${folder!.id}/members/${userId}`, { method: 'DELETE' }),
    onMutate: (userId) => ({ folderId: folder!.id, member: members.data?.items.find((m) => m.userId === userId) }),
    onSuccess: (_r, _userId, ctx) => {
      invalidate();
      const removed = ctx?.member;
      if (!removed) return;
      toast({
        message: `${removed.name} saiu da pasta.`,
        action: {
          label: 'Desfazer',
          run: async () => {
            await api(`/folders/${ctx.folderId}/members`, {
              method: 'POST',
              json: { email: removed.email, role: removed.role },
            });
            invalidate();
            toast({ message: `${removed.name} voltou para a pasta.` });
          },
        },
      });
    },
  });

  return (
    <Modal open={!!folder} onClose={onClose} title={`Membros de "${folder?.name ?? ''}"`}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          Quem entra aqui passa a ver <strong>todos os documentos desta pasta</strong> e das subpastas, inclusive os que
          forem colocados depois. Editor edita os documentos; Leitor só lê. O dono de cada documento continua sendo quem
          o criou.
        </p>

        {canManage && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) add.mutate();
            }}
          >
            <div className="min-w-48 flex-1">
              <Field label="E-mail do colega">
                {(id, aria) => (
                  <Input
                    id={id}
                    {...aria}
                    type="email"
                    value={email}
                    placeholder="colega@paglamp.com.br"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <Select value={role} aria-label="Papel na pasta" onChange={(e) => setRole(e.target.value as FolderRole)}>
              <option value="VIEWER">Leitor</option>
              <option value="EDITOR">Editor</option>
            </Select>
            <Button type="submit" variant="primary" busy={add.isPending} disabled={!email.trim()}>
              Adicionar
            </Button>
          </form>
        )}
        <ErrorText error={add.error ?? members.error} />

        {members.isPending ? (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {members.data?.items.length === 0 && (
              <li className="py-3 text-sm text-muted">Ninguém além de você tem acesso a esta pasta.</li>
            )}
            {members.data?.items.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                {canManage ? (
                  <>
                    <Select
                      value={m.role}
                      aria-label={`Papel de ${m.name}`}
                      onChange={(e) => change.mutate({ userId: m.userId, role: e.target.value as FolderRole })}
                    >
                      <option value="VIEWER">Leitor</option>
                      <option value="EDITOR">Editor</option>
                    </Select>
                    <Button variant="ghost" className="!text-danger" onClick={() => remove.mutate(m.userId)}>
                      Remover
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}
