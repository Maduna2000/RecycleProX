import {
  Users, UserRound, ShoppingCart, AlertCircle,
  Tag, CreditCard, ImageIcon, Scale,
  Package, ClipboardList, TrendingUp, BarChart2,
  Archive, Wallet, Landmark, Settings, LayoutGrid,
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
  '/app/payments':         'Payments',
  '/app/expenses':         'Expenses',
  '/app/cashup':           'Cash Up',
  '/app/float':            'Float',
  '/app/stock':            'Stock',
  '/app/stocktake':        'Stocktake',
  '/app/products':         'Products',
  '/app/price-groups':     'Price Groups',
  '/app/reports':          'Reports',
  '/app/settings':         'Settings',
  '/app/loans':            'Loans',
  '/app/photos':           'Photo Viewer',
  '/app/police-register':  'Police Register',
  '/app/audit-log':        'Audit Log',
  '/app/change-password':  'Change Password',
  '/app/scale':            'Scale Station',
}

export function getModuleName(pathname: string): string {
  if (MODULE_NAMES[pathname]) return MODULE_NAMES[pathname]
  const match = Object.keys(MODULE_NAMES)
    .filter(k => pathname.startsWith(k + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return match ? (MODULE_NAMES[match] ?? 'Renovo Pro') : 'Renovo Pro'
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
  '/app/products':         ClipboardList,
  '/app/price-groups':     TrendingUp,
  '/app/reports':          BarChart2,
  '/app/cashup':           Archive,
  '/app/expenses':         Wallet,
  '/app/float':            Landmark,
  '/app/settings':         Settings,
  '/app/scale':            Scale,
}

export function getModuleIcon(pathname: string): LucideIcon {
  return HREF_TO_ICON[pathname] ?? LayoutGrid
}
