export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://renovopros.vercel.app';

// Session cookie name must match NextAuth's encoding salt:
// HTTPS/production → __Secure-authjs.session-token
// HTTP/dev         → authjs.session-token
export const SESSION_COOKIE_NAME = __DEV__
  ? 'authjs.session-token'
  : '__Secure-authjs.session-token';

export const GATE_ENDPOINTS = {
  entries: '/api/gate/entries',
  entry: (id: string) => `/api/gate/entries/${id}`,
  checkout: (id: string) => `/api/gate/entries/${id}/checkout`,
  repeatVisit: '/api/gate/repeat-visit',
  purposeConfig: (purpose: string) => `/api/gate/purpose-config/${purpose}`,
  sellOptions: '/api/gate/sell-options',
} as const;

export const CUSTOMER_ENDPOINTS = {
  lookup: '/api/customers/lookup',
} as const;

export const AUTH_ENDPOINTS = {
  session: '/api/auth/session',
} as const;

export const R2_ENDPOINTS = {
  upload: '/api/r2/upload',
} as const;
