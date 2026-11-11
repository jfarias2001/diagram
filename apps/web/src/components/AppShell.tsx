import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useMe } from '../features/auth/session';
import { IconChevronDown, IconKey, IconLogout, IconMenu, IconUsers } from './icons';
import { Menu } from './Menu';
import { Avatar, Logo } from './ui';

// SPEC-008 §5.3 — lateral escura fixa + conteúdo, no lugar do cabeçalho claro.
// A navegação da rota (escopos e pastas, no painel) é injetada na lateral pelo
// "encaixe": a página continua dona do estado, sem duplicar nada aqui.

const SidebarSlot = createContext<HTMLElement | null>(null);

/** Onde a página desenha os próprios itens de navegação (ou `null` fora do shell). */
export function useSidebarSlot(): HTMLElement | null {
  return useContext(SidebarSlot);
}

export function AppShell() {
  const me = useMe().data;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Em tela estreita a lateral é uma gaveta: navegar fecha.
  useEffect(() => setOpen(false), [location.pathname, location.search]);

  return (
    <SidebarSlot.Provider value={slot}>
      <div className="flex min-h-full">
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="fixed top-3 left-3 z-30 rounded-lg border border-line bg-surface p-2 text-ink shadow-sm lg:hidden"
        >
          <IconMenu size={20} />
        </button>
        {open && (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
        )}

        <aside
          data-nav
          className={`fixed inset-y-0 left-0 z-40 flex w-62 shrink-0 flex-col bg-nav text-nav-ink transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link to="/" className="flex items-center gap-2.5 px-4 py-4">
            <Logo size={28} />
            <span className="font-display text-[15px] font-semibold tracking-tight">Paglamp Diagram</span>
          </Link>

          <div ref={setSlot} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" />

          <div className="border-t border-white/10 p-2">
            {me?.role === 'ADMIN' && (
              <NavLink to="/admin/usuarios" className={navItemClass}>
                <IconUsers size={17} />
                Usuários
              </NavLink>
            )}
            {me && <UserMenu name={me.name} email={me.email} />}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarSlot.Provider>
  );
}

/** Item de navegação da lateral escura. Usado aqui e pelo painel. */
export const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-white/12 text-nav-ink' : 'text-nav-muted hover:bg-white/8 hover:text-nav-ink'
  }`;

/** Mesmo visual do item de navegação, para botões que não são links. */
export function navButtonClass(active: boolean) {
  return navItemClass({ isActive: active });
}

export function SidebarSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between px-3 pb-1">
        <h2 className="text-[11px] font-semibold tracking-wider text-nav-muted uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function UserMenu({ name, email }: { name: string; email: string }) {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <Menu
      label="Conta"
      placement="top-start"
      width="w-full"
      items={[
        { label: 'Trocar senha', icon: IconKey, onSelect: () => navigate('/trocar-senha') },
        { label: 'Sair', icon: IconLogout, onSelect: () => logout.mutate() },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="flex w-full items-center gap-2.5 rounded-control px-2 py-2 text-left text-sm text-nav-muted transition-colors duration-(--dur-micro) hover:bg-nav-hover hover:text-nav-ink"
        >
          <Avatar name={name} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-nav-ink">{name}</span>
            <span className="block truncate text-xs">{email}</span>
          </span>
          <IconChevronDown size={16} />
        </button>
      )}
    />
  );
}
