import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '../../components/ui';
import { useMe } from './session';

/** Guarda global: sem sessão → /login; senha provisória → /trocar-senha. */
export function RequireAuth({ admin = false }: { admin?: boolean }) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Não foi possível falar com o servidor. Verifique sua conexão e recarregue a página.
      </div>
    );
  }
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (me.data.mustChangePassword && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }
  if (admin && me.data.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}
