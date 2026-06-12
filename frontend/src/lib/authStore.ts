import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
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
    localStorage.removeItem('samayak_token');
    localStorage.removeItem('samayak_user');
    set({ token: null, user: null });
  },
  isAuthenticated: () => !!get().token && !!get().user,
}));
