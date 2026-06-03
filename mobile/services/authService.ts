import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/api';
import { TOKEN_KEY } from './api';

export type SessionUser = {
  id: string;
  fullName: string;
  username: string;
  role: string;
  forcePasswordChange?: boolean;
};

export async function signIn(
  username: string,
  password: string
): Promise<{ token: string; user: SessionUser }> {
  const res = await fetch(`${API_BASE_URL}/api/mobile/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({})) as { token?: string; user?: SessionUser; error?: string };

  if (!res.ok || !data.token || !data.user) {
    throw new Error(data.error ?? 'Invalid username or password');
  }

  await SecureStore.setItemAsync(TOKEN_KEY, data.token);

  return { token: data.token, user: data.user };
}

export async function signOut(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // KeyStore unavailable on some Android 9 Samsung devices — ignore
  }
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}
