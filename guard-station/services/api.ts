import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, SESSION_COOKIE_NAME } from '@/constants/api';

export const TOKEN_KEY = 'guardstation_auth_token';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Both headers point at the same encoded NextAuth JWT — the backend's
// auth() helper (cookie-based) and the mobile-specific Bearer check both
// need to see it, since we don't know ahead of time which one a given
// route was written against (see src/app/api/mobile/session/route.ts vs.
// the gate/customers routes, which only check auth()'s cookie path).
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Cookie = `${SESSION_COOKIE_NAME}=${token}`;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Deliberately does NOT delete the stored token on a 401 here. A single
// transient failure (backend cold-start, brief network blip) on any one
// request would otherwise wipe an otherwise-valid token, cascading into
// every subsequent request in the session also failing with 401 — turning
// one hiccup into "nothing works until you log out and back in." Token
// invalidation is handled explicitly instead: authStore.restoreSession()
// already treats a failed /api/mobile/session check as "not logged in"
// without needing this to have pre-deleted anything.
api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export default api;
