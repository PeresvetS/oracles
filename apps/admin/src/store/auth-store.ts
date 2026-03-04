import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Данные пользователя */
interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

/** Хранилище авторизации с persist в localStorage */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token: string, user: User) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'oracle-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : sessionStorage,
      ),
    },
  ),
);
