import type { FolderKind, FolderMemberView, FolderNode, FolderRole } from '@diagram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, ErrorText, Field, Input, Modal, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';

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
    mutationFn: () =>
      state?.mode === 'rename'
        ? api(`/folders/${state.folder!.id}`, { method: 'PATCH', json: { name: name.trim() } })
        : api('/folders', {
            method: 'POST',
            json: { kind: state?.kind, name: name.trim(), parentId: state?.parentId ?? null },
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
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
          {(id) => (
            <Input id={id} autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
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

/** Opções da pasta: renomear, membros (se compartilhada e minha) e apagar. */
export function FolderMenuDialog({
  folder,
  onClose,
  onRename,
  onMembers,
  onDeleted,
}: {
  folder: FolderNode | null;
  onClose: () => void;
  onRename: () => void;
  onMembers: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api(`/folders/${folder!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      onDeleted();
      onClose();
    },
  });

  const isOwner = folder?.kind === 'PERSONAL' || folder?.myRole === 'OWNER';
  const canEdit = isOwner || folder?.myRole === 'EDITOR';

  return (
    <Modal open={!!folder} onClose={onClose} title={folder?.name ?? 'Pasta'}>
      <div className="flex flex-col gap-3">
        {canEdit && (isOwner || folder!.depth > 0) && <Button onClick={onRename}>Renomear</Button>}
        {folder?.kind === 'SHARED' && folder.depth === 0 && (
          <Button onClick={onMembers}>{folder.myRole === 'OWNER' ? 'Gerenciar membros' : 'Ver membros'}</Button>
        )}
        {isOwner && (
          <>
            <p className="text-xs text-muted">
              Apagar a pasta <strong>não apaga os documentos</strong>: eles voltam para "sem pasta".
              {folder?.kind === 'SHARED' ? ' As subpastas são apagadas junto e o acesso pela pasta acaba.' : ''}
            </p>
            <Button
              variant="danger"
              busy={remove.isPending}
              onClick={() => {
                if (window.confirm(`Apagar a pasta "${folder?.name}"? Os documentos continuam existindo.`)) {
                  remove.mutate();
                }
              }}
            >
              Apagar pasta
            </Button>
          </>
        )}
        <ErrorText error={remove.error} />
        <div className="flex justify-end">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Membros da pasta compartilhada — mesmo desenho do compartilhamento de documento. */
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
    mutationFn: () => api(`/folders/${folder!.id}/members`, { method: 'POST', json: { email: email.trim(), role } }),
    onSuccess: () => {
      setEmail('');
      invalidate();
    },
  });
  const change = useMutation({
    mutationFn: (v: { userId: string; role: FolderRole }) =>
      api(`/folders/${folder!.id}/members/${v.userId}`, { method: 'PATCH', json: { role: v.role } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/folders/${folder!.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
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
                {(id) => (
                  <Input
                    id={id}
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
        <ErrorText error={add.error ?? change.error ?? remove.error ?? members.error} />

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
