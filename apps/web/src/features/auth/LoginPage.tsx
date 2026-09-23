import { type Me, safeNextPath } from '@diagram/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button, ErrorText, Field, Input, Logo } from '../../components/ui';
import { api } from '../../lib/api';
import { meKey, useMe } from './session';

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api<{ user: Me }>('/auth/login', { method: 'POST', json: { email, password } }),
    onSuccess: ({ user }) => {
      qc.setQueryData(meKey, user);
      navigate(user.mustChangePassword ? '/trocar-senha' : next, { replace: true });
    },
  });

  if (me.data) return <Navigate to={me.data.mustChangePassword ? '/trocar-senha' : next} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12">
      {/* Brilho da marca no fundo (SPEC-008 §5.1): dá profundidade sem imagem. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'linear-gradient(120deg, var(--brand), var(--brand-2))' }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size={48} />
          <h1 className="font-display text-2xl font-semibold tracking-tight">Paglamp Diagram</h1>
          <p className="text-sm text-muted">Mapas mentais da equipe Paglamp</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <Field label="E-mail">
            {(id) => (
              <Input
                id={id}
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Field label="Senha">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <ErrorText error={login.error} />
          <Button type="submit" variant="primary" busy={login.isPending} className="mt-1 h-10">
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Sem acesso ou esqueceu a senha? Fale com o administrador do sistema.
        </p>
      </div>
    </main>
  );
}
