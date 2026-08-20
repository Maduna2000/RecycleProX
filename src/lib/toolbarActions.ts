import {
  Plus, ClipboardCheck, ClipboardList, Download, Settings2, TrendingUp,
  Users, UserPlus, ReceiptText,
  SlidersHorizontal, ShieldCheck, Ban, CheckCircle, RefreshCw,
  Boxes, ArrowLeftRight, Grid3X3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The single registry of every Zone 2 toolbar action, replacing the old
 * per-pathname if-chain (useToolbarButtons) plus the two other injection
 * mechanisms this consolidates (titleBarActionsStore, PortalPage's
 * `actions` prop — see 2026-08-19 design doc). The toolbar always renders
 * every action in this list, in this order (grouped, with a separator
 * between groups) — a page makes its own action(s) enabled just by being
 * the current route; everything else renders visibly disabled, the classic
 * MT4/Office "always there, greyed when not applicable" toolbar convention.
 *
 * Most actions are fully static (`href` — just navigate/open a `?x=1`
 * modal). The few whose availability depends on the specific record, not
 * just the route (Approve, Complete Stocktake, Void, Refresh), have no
 * `href` — they start disabled and a mounted page opts them in via
 * `useToolbarAction()` (toolbarActionStore.ts).
 */
export interface ToolbarAction {
  id: string
  label: string
  icon: LucideIcon
  group: string
  /** Which route(s) this is ever relevant to — exact match or `startsWith` prefix. */
  routes: string[]
  /** Omit = every role. */
  roles?: string[]
  /** Static actions navigate straight there. Omit for a dynamic action (see above). */
  href?: string
}

export const TOOLBAR_ACTIONS: ToolbarAction[] = [
  // ── Accounts ──────────────────────────────────────────────────────────
  { id: 'add-account', label: 'Add Account', icon: Plus, group: 'Accounts',
    routes: ['/app/customers'], href: '/app/customers/new' },

  // ── Expenses ──────────────────────────────────────────────────────────
  { id: 'add-expense', label: 'Add Expense', icon: Plus, group: 'Expenses',
    routes: ['/app/expenses'], href: '/app/expenses?add=1' },
  { id: 'approve-expense', label: 'Approve', icon: CheckCircle, group: 'Expenses',
    routes: ['/app/expenses/'], roles: ['admin', 'manager'] },

  // ── Cash-Up ───────────────────────────────────────────────────────────
  { id: 'cashup-refresh', label: 'Refresh', icon: RefreshCw, group: 'Cash-Up',
    routes: ['/app/cashup'] },

  // ── Stock ─────────────────────────────────────────────────────────────
  // On Hand/Movements/Grid are 3 separate routes with no shared parent —
  // these three are pure navigation between them (toolbar icon buttons,
  // not a PortalPage tab strip — deliberate: switching views this way is
  // the established convention here, same as Gate/Scale below).
  { id: 'stock-on-hand', label: 'Stock On Hand', icon: Boxes, group: 'Stock',
    routes: ['/app/stock/'], href: '/app/stock' },
  { id: 'stock-movements', label: 'Movements', icon: ArrowLeftRight, group: 'Stock',
    routes: ['/app/stock/'], href: '/app/stock/movements' },
  { id: 'stock-grid', label: 'Grid', icon: Grid3X3, group: 'Stock',
    routes: ['/app/stock/'], href: '/app/stock/grid' },
  // Relevant on all 3 stock views since it adjusts stock levels regardless
  // of which view you're looking at — matches the original behavior.
  { id: 'stock-adjust', label: 'Manual Adjustment', icon: SlidersHorizontal, group: 'Stock',
    routes: ['/app/stock/'], roles: ['admin', 'manager'], href: '/app/stock?adjust=1' },

  // ── Stocktake ─────────────────────────────────────────────────────────
  // Exact match only (list page) — every other module excludes its detail
  // page from a "create new" action; stocktake's old toolbar logic didn't,
  // which showed "Start Stocktake" on an existing session's own detail
  // page too. Fixed here to match the consistent pattern.
  { id: 'start-stocktake', label: 'Start Stocktake', icon: ClipboardCheck, group: 'Stocktake',
    routes: ['/app/stocktake'], roles: ['admin', 'manager'], href: '/app/stocktake?create=1' },
  // No role gate on these two — matches the original stocktake/[id] page,
  // which never checked isMgr for either (unlike "Start Stocktake" above).
  { id: 'complete-stocktake', label: 'Complete Stocktake', icon: CheckCircle, group: 'Stocktake',
    routes: ['/app/stocktake/'] },
  { id: 'void-stocktake', label: 'Void', icon: Ban, group: 'Stocktake',
    routes: ['/app/stocktake/'] },

  // ── Gate ──────────────────────────────────────────────────────────────
  // No role gate — matches the original (route access itself is already
  // gated by allowedModules/role in middleware; anyone who can reach one
  // Gate view can reach all three).
  { id: 'gate-entries', label: 'Entries', icon: ClipboardList, group: 'Gate',
    routes: ['/app/gate/'], href: '/app/gate' },
  { id: 'gate-guards', label: 'Guards', icon: Users, group: 'Gate',
    routes: ['/app/gate/'], href: '/app/gate/guards' },
  { id: 'gate-config', label: 'Purpose Config', icon: Settings2, group: 'Gate',
    routes: ['/app/gate/'], href: '/app/gate/config' },

  // ── Scale ─────────────────────────────────────────────────────────────
  { id: 'scale-orders', label: 'Orders', icon: ClipboardList, group: 'Scale',
    routes: ['/app/scale/'], href: '/app/scale' },
  { id: 'scale-operators', label: 'Operators', icon: Users, group: 'Scale',
    routes: ['/app/scale/'], href: '/app/scale/operators' },
  { id: 'scale-config', label: 'Step Config', icon: Settings2, group: 'Scale',
    routes: ['/app/scale/'], href: '/app/scale/config' },

  // ── Products & Pricing ────────────────────────────────────────────────
  { id: 'add-product', label: 'Add Product', icon: Plus, group: 'Products & Pricing',
    routes: ['/app/products'], roles: ['admin', 'manager'], href: '/app/products?add=1' },
  { id: 'product-categories', label: 'Categories', icon: Settings2, group: 'Products & Pricing',
    routes: ['/app/products'], roles: ['admin', 'manager'], href: '/app/products?categories=1' },
  { id: 'bulk-price', label: 'Bulk Price', icon: TrendingUp, group: 'Products & Pricing',
    routes: ['/app/products'], roles: ['admin', 'manager'], href: '/app/products?bulk=1' },
  { id: 'price-lists', label: 'Price Lists', icon: ReceiptText, group: 'Products & Pricing',
    routes: ['/app/products'], roles: ['admin', 'manager'], href: '/app/products/price-lists' },
  { id: 'new-price-list', label: 'New Price List', icon: Plus, group: 'Products & Pricing',
    routes: ['/app/products/price-lists/'], roles: ['admin', 'manager'], href: '/app/products/price-lists/new' },
  { id: 'add-price-group', label: 'Add Price Group', icon: Plus, group: 'Products & Pricing',
    routes: ['/app/price-groups'], roles: ['admin', 'manager'], href: '/app/price-groups?create=1' },

  // ── Compliance ────────────────────────────────────────────────────────
  { id: 'officer-portal', label: 'Officer Portal', icon: ShieldCheck, group: 'Compliance',
    routes: ['/app/police-register'], href: '/police' },
  { id: 'audit-log-download', label: 'Download', icon: Download, group: 'Compliance',
    routes: ['/app/audit-log'], roles: ['admin'], href: '/app/audit-log?export=1' },

  // ── Support ───────────────────────────────────────────────────────────
  { id: 'new-ticket', label: 'New Ticket', icon: Plus, group: 'Support',
    routes: ['/app/support'], roles: ['admin'], href: '/app/support?new=1' },

  // ── Admin ─────────────────────────────────────────────────────────────
  // Prefix match (trailing "/") — "Add User" is relevant on the Settings
  // landing page AND the Users list itself (?create=1 opens the same modal
  // either way, matching the old useToolbarButtons behavior); an
  // exact-match-only route here was the bug reported 2026-08-20 (Add User
  // greyed out while already on the Users page).
  { id: 'add-user', label: 'Add User', icon: UserPlus, group: 'Admin',
    routes: ['/app/settings/'], roles: ['admin'], href: '/app/settings/users?create=1' },
  { id: 'view-users', label: 'Users', icon: Users, group: 'Admin',
    routes: ['/app/settings/'], roles: ['admin'], href: '/app/settings/users' },
]

/** Exact match, or a "/" prefix match for a group of sub-routes (a trailing
 * "/" in the registry entry means "this route and everything under it"). */
export function actionMatchesRoute(action: ToolbarAction, pathname: string): boolean {
  return action.routes.some((r) =>
    r.endsWith('/') ? pathname.startsWith(r) || pathname === r.slice(0, -1) : pathname === r
  )
}
