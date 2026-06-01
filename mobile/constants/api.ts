export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://your-vercel-project.vercel.app';

export const SCALE_ENDPOINTS = {
  orders: '/api/scale/orders',
  order: (id: string) => `/api/scale/orders/${id}`,
  orderProcess: (id: string) => `/api/scale/orders/${id}/process`,
  orderVoid: (id: string) => `/api/scale/orders/${id}/void`,
  orderSlip: (id: string) => `/api/scale/orders/${id}/slip`,
  categories: '/api/scale/categories',
  products: '/api/scale/products',
  operators: '/api/scale/operators',
} as const;

export const AUTH_ENDPOINTS = {
  session: '/api/auth/session',
} as const;

export const R2_ENDPOINTS = {
  uploadUrl: '/api/r2/upload-url',
  viewUrl: '/api/r2/view-url',
} as const;
