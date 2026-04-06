'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Users,
  Package, BarChart2, Settings, LogOut, Recycle,
  Warehouse, DollarSign, Tag, Banknote, ShieldCheck, ShieldAlert,
  Receipt, Coins, UserCheck, ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface NavItem { label: string; href: string; icon: React.ElementType }

const cashierNav: NavItem[] = [
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Purchases', href: '/app/purchases', icon: ShoppingCart },
  { label: 'Sales', href: '/app/sales', icon: TrendingUp },
  { label: 'Customers', href: '/app/customers', icon: Users },
]

const managerExtra: NavItem[] = [
  { label: 'Payments',          href: '/app/payments',          icon: Banknote },
  { label: 'Stock',             href: '/app/stock',             icon: Warehouse },
  { label: 'Cash-up',           href: '/app/cashup',            icon: DollarSign },
  { label: 'Expenses',          href: '/app/expenses',          icon: Receipt },
  { label: 'Cash Float',        href: '/app/float',             icon: Coins },
  { label: 'Casual Details',    href: '/app/casual',            icon: UserCheck },
  { label: 'Unpaid Purchases',  href: '/app/purchases/unpaid',  icon: ClipboardList },
  { label: 'Stocktake',         href: '/app/stocktake',         icon: Package },
  { label: 'Police Register',   href: '/app/police-register',   icon: ShieldCheck },
  { label: 'Reports',           href: '/app/reports',           icon: BarChart2 },
]

const adminExtra: NavItem[] = [
  { label: 'Products',    href: '/app/products',     icon: Package },
  { label: 'Price Groups',href: '/app/price-groups', icon: Tag },
  { label: 'Audit Log',   href: '/app/audit-log',    icon: ShieldAlert },
  { label: 'Users',       href: '/app/settings/users', icon: Users },
  { label: 'Settings',    href: '/app/settings',     icon: Settings },
]

export function AppSidebar({ role, fullName }: { role: string; fullName: string; username?: string }) {
  const pathname = usePathname()

  const navItems: NavItem[] = [
    ...cashierNav,
    ...(['manager', 'admin'].includes(role) ? managerExtra : []),
    ...(role === 'admin' ? adminExtra : []),
  ]

  return (
    <aside className="w-60 bg-white border-r flex flex-col h-full shadow-sm">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 bg-green-600 rounded-lg flex items-center justify-center">
          <Recycle className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm text-gray-900">RecycleProX</p>
          <p className="text-xs text-gray-400">Basic</p>
        </div>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          // Exact match for leaf routes that are prefixes of deeper routes
          const active = item.href === '/app/settings' || item.href === '/app/purchases'
            ? pathname === item.href || pathname === item.href + '/'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-green-50 text-green-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* User footer */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{fullName}</p>
            <p className="text-xs text-gray-400 truncate capitalize">{role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-gray-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
