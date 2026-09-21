import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { UsersPage } from './features/admin/UsersPage';
import { ChangePasswordPage } from './features/auth/ChangePasswordPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { DashboardPage } from './features/dashboard/DashboardPage';
import './index.css';

// O editor (React Flow, Yjs) é o pedaço mais pesado: carrega sob demanda.
const EditorPage = lazy(() => import('./features/editor/EditorPage'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/trocar-senha', element: <ChangePasswordPage /> },
      {
        path: '/m/:id',
        element: (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-muted">
                <Spinner />
              </div>
            }
          >
            <EditorPage />
          </Suspense>
        ),
      },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          {
            element: <RequireAuth admin />,
            children: [{ path: '/admin/usuarios', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root não encontrado');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
