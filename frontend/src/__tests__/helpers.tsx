import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, type Role } from '../lib/authStore';

export function signIn(role: Role, departmentId = 1) {
  useAuthStore.setState({ token: 't', user: { id: 1, name: 'Test User', email: 't@t.t', role, departmentId } });
}

export function renderAt(ui: ReactElement, path = '/', route = '*') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Builds an axios-like rejection so errMsg/errData behave as in production. */
export const httpError = (status: number, data: Record<string, unknown>) => Object.assign(new Error('Request failed'), { response: { status, data } });
