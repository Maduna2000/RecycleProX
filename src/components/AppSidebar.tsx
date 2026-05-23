'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Users,
  Package, BarChart2, Settings, LogOut, RefreshCw,
  Warehouse, DollarSign, Tag, Banknote, ShieldCheck, ShieldAlert,
  Receipt, Coins, UserCheck, ClipboardList, HandCoins, Images,
  AlertCircle, Scale, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface NavItem { label: string; href: string; icon: React.ElementType }
interface NavGroup { heading: string; items: NavItem[] }

// ─── Navigation structure (grouped by function) ───────────────────────────────

const ALWAYS: NavGroup = {
  heading: 'Transactions',
  items: [
    { label: 'Dashboard',  href: '/app/dashboard',  icon: LayoutDashboard },
    { label: 'Purchases',  href: '/app/purchases',  icon: ShoppingCart },
    { label: 'Sales',      href: '/app/sales',      icon: TrendingUp },
    { label: 'Customers',  href: '/app/customers',  icon: Users },
  ],
}

const FINANCE: NavGroup = {
  heading: 'Finance',
  items: [
    { label: 'Payments',    href: '/app/payments',  icon: Banknote },
    { label: 'Loans',       href: '/app/loans',     icon: HandCoins },
    { label: 'Expenses',    href: '/app/expenses',  icon: Receipt },
    { label: 'Cash-up',     href: '/app/cashup',    icon: DollarSign },
    { label: 'Cash Float',  href: '/app/float',     icon: Coins },
  ],
}

const INVENTORY: NavGroup = {
  heading: 'Inventory',
  items: [
    { label: 'Stock',        href: '/app/stock',          icon: Warehouse },
    { label: 'Products',     href: '/app/products',       icon: Package },
    { label: 'Price Groups', href: '/app/price-groups',   icon: Tag },
    { label: 'Stocktake',    href: '/app/stocktake',      icon: ClipboardList },
  ],
}

const RECORDS: NavGroup = {
  heading: 'Records',
  items: [
    { label: 'Unpaid Purchases', href: '/app/purchases/unpaid', icon: AlertCircle },
    { label: 'Casual Details',   href: '/app/casual',           icon: UserCheck },
    { label: 'Photos',           href: '/app/photos',           icon: Images },
    { label: 'Police Register',  href: '/app/police-register',  icon: ShieldCheck },
    { label: 'Reports',          href: '/app/reports',          icon: BarChart2 },
  ],
}

const SCALE_ADMIN: NavGroup = {
  heading: 'Scale Station',
  items: [
    { label: 'Dashboard',   href: '/scale/admin',            icon: Scale },
    { label: 'Orders',      href: '/scale/admin/orders',     icon: ClipboardList },
    { label: 'Categories',  href: '/scale/admin/categories', icon: Layers },
    { label: 'Products',    href: '/scale/admin/products',   icon: Package },
  ],
}

const ADMIN: NavGroup = {
  heading: 'Administration',
  items: [
    { label: 'Users',     href: '/app/settings/users', icon: Users },
    { label: 'Audit Log', href: '/app/audit-log',      icon: ShieldAlert },
    { label: 'Settings',  href: '/app/settings',       icon: Settings },
  ],
}

// ─── Active link helper ───────────────────────────────────────────────────────

function isActive(pathname: string, href: string): boolean {
  // Exact match only for paths that are a prefix of deeper routes
  if (href === '/app/settings' || href === '/app/purchases' || href === '/scale/admin') {
    return pathname === href || pathname === href + '/'
  }
  return pathname.startsWith(href)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppSidebar({ role, fullName }: { role: string; fullName: string; username?: string }) {
  const pathname = usePathname()
  const isManager = ['manager', 'admin'].includes(role)
  const isAdmin   = role === 'admin'

  const groups: NavGroup[] = [
    ALWAYS,
    ...(isManager ? [FINANCE, INVENTORY, RECORDS, SCALE_ADMIN] : []),
    ...(isAdmin   ? [ADMIN]                                     : []),
  ]

  return (
    <aside className="w-56 bg-white border-r flex flex-col h-full" style={{ borderColor: '#E0E0E0' }}>

      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1B3A6B' }}>
          <RefreshCw className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm" style={{ color: '#212529' }}>Renovo Pro</p>
          <p className="text-xs" style={{ color: '#6C757D' }}>Lariat Technologies</p>
        </div>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.heading}>
            <p
              className="px-3 mb-1 text-xs font-semibold uppercase tracking-widest"
              style={{ color: '#6C757D' }}
            >
              {group.heading}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      active
                        ? 'bg-[#F0FBF4] text-[#217346]'
                        : 'hover:bg-[#F8F9FA]',
                    )}
                    style={active ? {} : { color: '#212529' }}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <Separator />

      {/* User footer */}
      <div className="p-3 shrink-0">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: '#F0FBF4', color: '#217346' }}>
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: '#212529' }}>{fullName}</p>
            <p className="text-xs truncate capitalize" style={{ color: '#6C757D' }}>{role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs h-7 px-2"
          style={{ color: '#6C757D' }}
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="w-3.5 h-3.5 mr-2" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
