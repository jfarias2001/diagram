import { Link, NavLink, Outlet } from 'react-router';
import { useLogout, useMe } from '../features/auth/session';
import { Avatar, Logo } from './ui';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`;

export function AppShell() {
  const me = useMe().data;
  const logout = useLogout();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={26} />
            <span className="font-display text-[15px] font-semibold tracking-tight">Paglamp Diagram</span>
          </Link>
          <nav className="ml-2 flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Mapas
            </NavLink>
            {me?.role === 'ADMIN' && (
              <NavLink to="/admin/usuarios" className={navClass}>
                Usuários
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <>
                <Link to="/trocar-senha" className="hidden text-sm text-muted hover:text-ink sm:block">
                  Trocar senha
                </Link>
                <button
                  type="button"
                  onClick={() => logout.mutate()}
                  className="text-sm text-muted hover:text-ink"
                >
                  Sair
                </button>
                <Avatar name={me.name} />
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
