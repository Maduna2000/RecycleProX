import { create } from 'zustand';
import { signIn, signOut, getStoredToken, type SessionUser } from '@/services/authService';
import { API_BASE_URL } from '@/constants/api';

type AuthState = {
  user: SessionUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
};

type AuthActions = {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { token, user } = await signIn(username, password);
      set({ user, token, isAuthenticated: true, isLoading: false });
      return true;
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
      return false;
    }
  },

  logout: async () => {
    await signOut();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  restoreSession: async () => {
    const token = await getStoredToken();
    if (!token) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${API_BASE_URL}/api/mobile/session`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return false;
      let data: { user: SessionUser };
      try {
        data = await res.json();
      } catch {
        return false;
      }
      if (!data?.user?.id) return false;
      set({ user: data.user, token, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
