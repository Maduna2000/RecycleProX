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
  login: (username: string, password: string) => Promise<void>;
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
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
      throw err;
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
      const res = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: { Cookie: `next-auth.session-token=${token}` },
      });
      if (!res.ok) return false;
      const session = await res.json();
      if (!session?.user?.id) return false;
      const user: SessionUser = {
        id: session.user.id,
        fullName: session.user.fullName ?? session.user.name ?? '',
        username: session.user.username ?? session.user.email ?? '',
        role: session.user.role ?? '',
      };
      set({ user, token, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
