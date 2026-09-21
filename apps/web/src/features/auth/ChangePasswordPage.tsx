import { type Me, PASSWORD_MIN } from '@diagram/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ErrorText, Field, Input, Logo } from '../../components/ui';
import { api } from '../../lib/api';
import { meKey, useLogout, useMe } from './session';

export function ChangePasswordPage() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useLogout();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const forced = me.data?.mustChangePassword ?? false;

  const change = useMutation({
    mutationFn: () => api<{ user: Me }>('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } }),
    onSuccess: ({ user }) => {
      qc.setQueryData(meKey, user);
      navigate('/', { replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < PASSWORD_MIN) return setLocalError(`A nova senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`);
    if (newPassword !== confirm) return setLocalError('A confirmação não é igual à nova senha.');
    setLocalError(null);
    change.mutate();
  };

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <h1 className="font-display text-xl font-semibold">{forced ? 'Crie sua senha' : 'Trocar senha'}</h1>
          {forced && (
            <p className="text-sm text-muted">
              Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.
            </p>
          )}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <Field label={forced ? 'Senha provisória' : 'Senha atual'}>
            {(id) => (
              <Input id={id} type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
            )}
          </Field>
          <Field label="Nova senha" hint={`Pelo menos ${PASSWORD_MIN} caracteres. Uma frase curta funciona bem.`}>
            {(id) => (
              <Input id={id} type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNew(e.target.value)} />
            )}
          </Field>
          <Field label="Confirme a nova senha">
            {(id) => (
              <Input id={id} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            )}
          </Field>
          <ErrorText error={localError ? new Error(localError) : change.error} />
          <Button type="submit" variant="primary" busy={change.isPending} className="h-10">
            Salvar nova senha
          </Button>
          {forced ? (
            <Button variant="ghost" onClick={() => logout.mutate()}>
              Sair
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
          )}
        </form>
      </div>
    </main>
  );
}
