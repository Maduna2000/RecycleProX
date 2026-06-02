import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/api';
import { TOKEN_KEY } from './api';

export type SessionUser = {
  id: string;
  fullName: string;
  username: string;
  role: string;
};

export async function signIn(
  username: string,
  password: string
): Promise<{ token: string; user: SessionUser }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error('Invalid username or password');
  }

  // NextAuth v5 returns a session cookie — extract the token from the cookie header
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/next-auth\.session-token=([^;]+)/);
  if (!match) throw new Error('Authentication failed — no session token returned');

  const token = match[1];
  await SecureStore.setItemAsync(TOKEN_KEY, token);

  const sessionRes = await fetch(`${API_BASE_URL}/api/auth/session`, {
    headers: { Cookie: `next-auth.session-token=${token}` },
  });
  const session = await sessionRes.json();
  const user: SessionUser = {
    id: session.user?.id ?? '',
    fullName: session.user?.fullName ?? session.user?.name ?? '',
    username: session.user?.username ?? session.user?.email ?? '',
    role: session.user?.role ?? '',
  };

  return { token, user };
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
    // KeyStore unavailable on some Android 9 Samsung devices — treat as no token
    return null;
  }
}
