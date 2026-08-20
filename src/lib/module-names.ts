import {
  Users, UserRound, ShoppingCart, AlertCircle,
  Tag, CreditCard, ImageIcon, Scale,
  Package, ClipboardList, ClipboardCheck, TrendingUp, BarChart2,
  Archive, Wallet, Landmark, Settings, LayoutGrid, Banknote, ShieldCheck,
  Smartphone,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const MODULE_NAMES: Record<string, string> = {
  '/app/dashboard':        'Dashboard',
  '/app/customers':        'Accounts',
  '/app/casual':           'Casual Details',
  '/app/purchases':        'Purchases',
  '/app/purchases/unpaid': 'Unpaid Purchases',
  '/app/purchases/new':    'New Purchase',
  '/app/sales':            'Sales',
  '/app/sales/new':        'New Sale',
  '/app/sales/unpaid':     'Unpaid Sales',
  '/app/payments':         'Sales Payments',
  '/app/payments/balances': 'Account Balances',
  '/app/expenses':         'Expenses',
  '/app/momo-statement':   'MoMo Statement',
  '/app/cashup':           'Cash Up',
  '/app/float':            'Float',
  '/app/stock':            'Stock On Hand',
  '/app/stock/movements':  'Stock Movements',
  '/app/stock/grid':       'Stock Grid',
  '/app/stocktake':        'Stocktake',
  '/app/products':         'Products',
  '/app/products/price-lists': 'Price Lists',
  '/app/price-groups':     'Price Groups',
  '/app/reports':          'Reports',
  '/app/settings':         'Settings',
  '/app/loans':            'Loans',
  '/app/photos':           'Photo Viewer',
  '/app/police-register':  'Police Register',
  '/app/audit-log':        'Audit Log',
  '/app/change-password':  'Change Password',
  '/app/scale':            'Scale Station',
  '/app/scale/operators':  'Scale Operators',
  '/app/scale/config':     'Scale Step Config',
  '/app/gate':             'Guard Station',
  '/app/gate/guards':      'Gate Guards',
  '/app/gate/config':      'Gate Purpose Config',
  '/app/support':          'Support',
  '/scale/admin':          'Scale Admin',
  '/scale/admin/orders':   'Scale Orders',
}

/**
 * The MODULE_NAMES key a pathname resolves to (exact match, or the longest
 * prefix match for a dynamic detail route like `/app/customers/[id]`) — or
 * the raw pathname itself if nothing matches. Used as the stable identity
 * for anything that should be shared across every instance of a route
 * pattern rather than per exact URL, e.g. window-geometry persistence
 * (windowGeometryStore.ts): any customer's detail page remembers the same
 * window position, not a separate one per customer.
 */
export function getModuleKey(pathname: string): string {
  if (MODULE_NAMES[pathname]) return pathname
  const match = Object.keys(MODULE_NAMES)
    .filter(k => pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return match ?? pathname
}

export function getModuleName(pathname: string): string {
  return MODULE_NAMES[getModuleKey(pathname)] ?? 'Renovo Pro'
}

export const HREF_TO_ICON: Record<string, LucideIcon> = {
  '/app/customers':        Users,
  '/app/casual':           UserRound,
  '/app/purchases':        ShoppingCart,
  '/app/purchases/unpaid': AlertCircle,
  '/app/sales':            Tag,
  '/app/payments':         CreditCard,
  '/app/photos':           ImageIcon,
  '/app/stock':            Package,
  '/app/stocktake':        ClipboardCheck,
  '/app/products':         ClipboardList,
  '/app/price-groups':     TrendingUp,
  '/app/reports':          BarChart2,
  '/app/cashup':           Archive,
  '/app/expenses':         Wallet,
  '/app/momo-statement':   Smartphone,
  '/app/float':            Landmark,
  '/app/loans':            Banknote,
  '/app/settings':         Settings,
  '/app/scale':            Scale,
  '/app/gate':             ShieldCheck,
  '/scale/admin':          Scale,
}

export function getModuleIcon(pathname: string): LucideIcon {
  return HREF_TO_ICON[pathname] ?? LayoutGrid
}
