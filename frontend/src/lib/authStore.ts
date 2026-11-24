import { create } from 'zustand';
import { disconnectWebSocket } from './api';

export type Role = 'ADMIN' | 'DEAN' | 'HOD' | 'COORDINATOR' | 'PROFESSOR';

export const ROLE_LEVEL: Record<Role, number> = { ADMIN: 5, DEAN: 4, HOD: 3, COORDINATOR: 2, PROFESSOR: 1 };

interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  departmentId?: number;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('samayak_token'),
  user: (() => {
    try { return JSON.parse(localStorage.getItem('samayak_user') || 'null'); } catch { return null; }
  })(),
  setAuth: (token, user) => {
    localStorage.setItem('samayak_token', token);
    localStorage.setItem('samayak_user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    disconnectWebSocket();
    localStorage.removeItem('samayak_token');
    localStorage.removeItem('samayak_user');
    set({ token: null, user: null });
  },
  isAuthenticated: () => !!get().token && !!get().user,
}));

/** True when the signed-in user's role is at least `min` (UI affordance only; the API enforces roles). */
export function useCan(min: Role): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return !!role && ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}
