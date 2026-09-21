import type { AdminUser, UserRole } from '@diagram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Button, ErrorText, Field, Input, Modal, relativeTime, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useMe } from '../auth/session';

const usersKey = ['admin-users'] as const;

export function UsersPage() {
  const me = useMe().data;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<{ name: string; email: string; password: string } | null>(null);

  const users = useQuery({
    queryKey: usersKey,
    queryFn: () => api<{ items: AdminUser[] }>('/admin/users'),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: UserRole; active?: boolean }) =>
      api(`/admin/users/${id}`, { method: 'PATCH', json: body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });

  const reset = useMutation({
    mutationFn: (user: AdminUser) =>
      api<{ temporaryPassword: string }>(`/admin/users/${user.id}/reset-password`, { method: 'POST', json: {} }),
    onSuccess: (res, user) => {
      setTemp({ name: user.name, email: user.email, password: res.temporaryPassword });
      qc.invalidateQueries({ queryKey: usersKey });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-1 text-sm text-muted">Crie o acesso de cada colaborador e repasse a senha provisória a ele.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Criar acesso
        </Button>
      </div>

      <ErrorText error={users.error ?? update.error ?? reset.error} />

      {users.isPending ? (
        <div className="flex justify-center py-16 text-muted">
          <Spinner />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.data?.items.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={`border-b border-line last:border-0 ${u.active ? '' : 'opacity-55'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {u.name} {self && <span className="text-xs font-normal text-muted">(você)</span>}
                      </p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        aria-label={`Papel de ${u.name}`}
                        value={u.role}
                        disabled={self}
                        onChange={(e) => update.mutate({ id: u.id, role: e.target.value as UserRole })}
                        className="h-8 w-36"
                      >
                        <option value="MEMBER">Colaborador</option>
                        <option value="ADMIN">Administrador</option>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {!u.active ? (
                        <span className="text-muted">Desativado</span>
                      ) : u.mustChangePassword ? (
                        <span className="text-filament-ink">Aguardando 1º acesso</span>
                      ) : (
                        <span className="text-ok">Ativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Nunca'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="h-8 text-xs"
                          disabled={!u.active}
                          onClick={() => {
                            if (window.confirm(`Gerar uma nova senha provisória para ${u.name}? A senha atual deixa de funcionar.`)) {
                              reset.mutate(u);
                            }
                          }}
                        >
                          Redefinir senha
                        </Button>
                        {!self && (
                          <Button
                            variant="ghost"
                            className={`h-8 text-xs ${u.active ? 'text-danger' : ''}`}
                            onClick={() => update.mutate({ id: u.id, active: !u.active })}
                          >
                            {u.active ? 'Desativar' : 'Reativar'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setCreating(false);
          setTemp(t);
          qc.invalidateQueries({ queryKey: usersKey });
        }}
      />
      <TempPasswordDialog value={temp} onClose={() => setTemp(null)} />
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (t: { name: string; email: string; password: string }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('MEMBER');
  const create = useMutation({
    mutationFn: () =>
      api<{ user: AdminUser; temporaryPassword: string }>('/admin/users', { method: 'POST', json: { name, email, role } }),
    onSuccess: (res) => {
      onCreated({ name: res.user.name, email: res.user.email, password: res.temporaryPassword });
      setName('');
      setEmail('');
      setRole('MEMBER');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title="Criar acesso">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome">
          {(id) => <Input id={id} autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="E-mail" hint="É o login da pessoa. Pode ser de qualquer provedor.">
          {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Papel">
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full">
              <option value="MEMBER">Colaborador</option>
              <option value="ADMIN">Administrador (gerencia usuários)</option>
            </Select>
          )}
        </Field>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" busy={create.isPending}>
            Criar acesso
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TempPasswordDialog({
  value,
  onClose,
}: {
  value: { name: string; email: string; password: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = value ? `Acesso ao Paglamp Diagram\n${window.location.origin}\nLogin: ${value.email}\nSenha provisória: ${value.password}` : '';
  return (
    <Modal
      open={!!value}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title={`Senha provisória de ${value?.name ?? ''}`}
      footer={
        <>
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            }}
          >
            {copied ? 'Copiado' : 'Copiar mensagem'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            Pronto
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Envie para <b className="text-ink">{value?.email}</b>. No primeiro login a pessoa escolhe uma senha própria.
      </p>
      <code className="select-all rounded-lg bg-surface-2 px-4 py-3 text-center font-mono text-lg tracking-wider">
        {value?.password}
      </code>
      <p className="text-xs font-medium text-danger">Esta senha não será exibida de novo.</p>
    </Modal>
  );
}
