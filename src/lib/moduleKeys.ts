/**
 * The single source of truth for "module keys" — the coarse per-module
 * permission units an admin can grant/revoke via a user's `allowedModules`
 * (see docs/superpowers/specs/2026-06-15-user-module-permissions-design.md).
 * Both middleware.ts (route access) and the Zone 2 toolbar (button
 * visibility) resolve a pathname down to one of these before checking it
 * against a user's allowedModules — kept here once so the two never drift.
 */
export const MODULE_KEYS = [
  '/app/dashboard',
  '/app/customers',
  '/app/purchases',
  '/app/sales',
  '/app/payments',
  '/app/expenses',
  '/app/cashup',
  '/app/float',
  '/app/stock',
  '/app/products',
  '/app/price-groups',
  '/app/reports',
  '/app/police-register',
  '/app/audit-log',
  '/app/photos',
  '/app/settings',
] as const

/**
 * Find the module key for a given pathname.
 * e.g., /app/purchases/new → /app/purchases
 * Returns null for routes outside the gate-able set (e.g. /app/support) —
 * those are never restricted by allowedModules.
 */
export function findModuleKey(pathname: string): string | null {
  // Stocktake now folds under the Stock permission grant — it doesn't share
  // Stock's URL prefix, so it needs its own explicit mapping here rather
  // than falling out of the prefix match below.
  if (pathname === '/app/stocktake' || pathname.startsWith('/app/stocktake/')) return '/app/stock'
  if ((MODULE_KEYS as readonly string[]).includes(pathname)) return pathname
  return MODULE_KEYS.find((key) => pathname.startsWith(key + '/')) ?? null
}
