'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Search, Plus, Scale, Printer,
  Zap, Ban, BarChart2,
  ShieldCheck, ClipboardCheck, FileSpreadsheet,
  FileText, Download, Handshake, LogOut, Settings,
  Minus, Square, X as XIcon, Package, Tag,
  Images, ShieldAlert, Users, UserPlus, ChevronRight,
  UserCheck, AlertCircle, Archive, Landmark,
  Wifi, WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOfflineStore } from '@/stores/offlineStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolbarButton {
  label:    string
  icon:     React.ElementType
  href?:    string
  onClick?: () => void
  variant:  'primary' | 'secondary' | 'danger' | 'ghost'
  iconOnly?: boolean
}

// ─── Module name map ──────────────────────────────────────────────────────────

const MODULE_NAMES: Record<string, string> = {
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
}

function getModuleName(pathname: string): string {
  // Exact match first
  const exact = MODULE_NAMES[pathname]
  if (exact) return exact
  // Prefix match (e.g. /app/customers/abc → Accounts)
  const sorted = Object.keys(MODULE_NAMES).sort((a, b) => b.length - a.length)
  for (const key of sorted) {
    const name = MODULE_NAMES[key]
    if (name && pathname.startsWith(key + '/')) return name
  }
  return 'RecycleProX'
}

// ─── Toolbar configs — fully pathname-driven ──────────────────────────────────

function useToolbarButtons(pathname: string, role: string): ToolbarButton[] {
  const isMgr   = role === 'admin' || role === 'manager'
  const isAdmin = role === 'admin'

  // Accounts
  if (pathname.startsWith('/app/customers')) return [
    { label: 'Add Account', icon: Plus,      href: '/app/customers/new',                     variant: 'primary' },
    { label: 'Add Casual',  icon: UserCheck, href: '/app/casual',                             variant: 'secondary' },
    ...(isMgr ? [
      { label: 'Police Register', icon: ShieldCheck, href: '/app/police-register', variant: 'ghost' as const },
    ] : []),
    { label: 'Photos', icon: Images, href: '/app/photos', variant: 'ghost' },
    ...(isMgr ? [{ label: 'Blacklist', icon: Ban, variant: 'danger' as const, iconOnly: true }] : []),
  ]

  // Casual Details
  if (pathname.startsWith('/app/casual')) return [
    { label: 'Add Casual', icon: Plus, href: '/app/casual', variant: 'primary' },
  ]

  // Purchases (main + unpaid)
  if (pathname.startsWith('/app/purchases')) return [
    { label: 'New Purchase', icon: Plus,        href: '/app/purchases/new',    variant: 'primary' },
    { label: 'Unpaid',       icon: AlertCircle, href: '/app/purchases/unpaid', variant: 'secondary' },
    { label: 'Weigh',        icon: Scale,       href: '/app/purchases/new',    variant: 'ghost', iconOnly: true },
    { label: 'Print Slip',   icon: Printer,     variant: 'ghost', iconOnly: true },
    ...(isMgr ? [{ label: 'Void', icon: Zap, variant: 'danger' as const, iconOnly: true }] : []),
  ]

  // Sales
  if (pathname.startsWith('/app/sales')) return [
    { label: 'New Sale',   icon: Plus,    href: '/app/sales/new', variant: 'primary' },
    { label: 'Print Slip', icon: Printer, variant: 'ghost', iconOnly: true },
    ...(isMgr ? [{ label: 'Void', icon: Zap, variant: 'danger' as const, iconOnly: true }] : []),
  ]

  // Payments
  if (pathname.startsWith('/app/payments')) return [
    { label: 'Record Payment', icon: Plus,       href: '/app/payments', variant: 'primary' },
    { label: 'Statement',      icon: FileText,   variant: 'ghost', iconOnly: true },
  ]

  // Expenses
  if (pathname.startsWith('/app/expenses')) return [
    { label: 'Add Expense',      icon: Plus, href: '/app/expenses?add=1',     variant: 'primary' },
    { label: 'Add Expense Type', icon: Tag,  href: '/app/expenses?addtype=1', variant: 'secondary' },
  ]

  // Cash Up
  if (pathname.startsWith('/app/cashup')) return [
    { label: 'Open Cash-Up',  icon: Archive,    href: '/app/cashup', variant: 'primary' },
    { label: 'Print Summary', icon: Printer,    variant: 'ghost', iconOnly: true },
    { label: 'Export',        icon: Download,   variant: 'ghost', iconOnly: true },
  ]

  // Float
  if (pathname.startsWith('/app/float')) return [
    { label: 'Open Float', icon: Landmark, href: '/app/float', variant: 'primary' },
  ]

  // Stock
  if (pathname.startsWith('/app/stocktake')) return isMgr ? [
    { label: 'Start Stocktake', icon: ClipboardCheck, href: '/app/stocktake', variant: 'primary' },
  ] : []

  if (pathname.startsWith('/app/stock')) return [
    ...(isMgr ? [
      { label: 'Adjust',    icon: Plus,           href: '/app/stock',     variant: 'primary' as const },
      { label: 'Stocktake', icon: ClipboardCheck, href: '/app/stocktake', variant: 'ghost' as const },
    ] : []),
    { label: 'Products',     icon: Package,         href: '/app/products',     variant: isMgr ? 'secondary' as const : 'primary' as const },
    { label: 'Price Groups', icon: Tag,             href: '/app/price-groups', variant: 'ghost' },
    { label: 'Export Excel', icon: FileSpreadsheet, variant: 'ghost', iconOnly: true },
  ]

  // Products
  if (pathname.startsWith('/app/price-groups')) return isMgr ? [
    { label: 'Add Price Group', icon: Plus, href: '/app/price-groups', variant: 'primary' },
  ] : []

  if (pathname.startsWith('/app/products')) return [
    { label: 'Add Product',  icon: Plus, href: '/app/products', variant: 'primary' },
    { label: 'Price Groups', icon: Tag,  href: '/app/price-groups', variant: 'secondary' },
  ]

  // Loans
  if (pathname.startsWith('/app/loans')) return [
    { label: 'New Loan',  icon: Plus,      href: '/app/loans', variant: 'primary' },
    { label: 'Repayment', icon: Handshake, variant: 'secondary', iconOnly: true },
    { label: 'Statement', icon: FileText,  variant: 'ghost',    iconOnly: true },
  ]

  // Reports
  if (pathname.startsWith('/app/reports')) {
    if (!isMgr) return []
    return [
      { label: 'Generate',     icon: BarChart2,       variant: 'primary' },
      { label: 'Export CSV',   icon: Download,        variant: 'secondary', iconOnly: true },
      { label: 'Export Excel', icon: FileSpreadsheet, variant: 'ghost',    iconOnly: true },
      { label: 'Print',        icon: Printer,         variant: 'ghost',    iconOnly: true },
    ]
  }

  // Settings & Audit Log
  if (pathname.startsWith('/app/audit-log')) return isAdmin ? [
    { label: 'Export', icon: Download, variant: 'ghost' },
  ] : []

  if (pathname.startsWith('/app/settings')) {
    if (!isAdmin) return []
    return [
      { label: 'Add User',  icon: UserPlus,    href: '/app/settings/users?create=1', variant: 'primary' },
      { label: 'Users',     icon: Users,       href: '/app/settings/users',          variant: 'secondary' },
      { label: 'Audit Log', icon: ShieldAlert, href: '/app/audit-log',               variant: 'ghost' },
    ]
  }

  // Photos / Police Register — no toolbar buttons
  if (pathname.startsWith('/app/photos'))          return []
  if (pathname.startsWith('/app/police-register')) return isMgr ? [] : []
  if (pathname.startsWith('/app/change-password')) return []

  return []
}

// ─── ToolbarBtn ───────────────────────────────────────────────────────────────

function ToolbarBtn({ btn }: { btn: ToolbarButton }) {
  const base = cn(
    'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium',
    'transition-all duration-150 focus:outline-none whitespace-nowrap min-h-[28px]',
  )
  const variants: Record<string, string> = {
    primary:   'bg-[#217346] text-white hover:bg-[#1a5c38] shadow-sm',
    secondary: 'border border-[#185ABD] text-[#185ABD] bg-white hover:bg-blue-50',
    danger:    'border border-[#C0392B] text-[#C0392B] bg-white hover:bg-red-50',
    ghost:     'text-[#6C757D] hover:bg-white hover:text-[#212529]',
  }
  const cls = cn(base, variants[btn.variant])
  const inner = (
    <>
      <btn.icon className="w-3.5 h-3.5 shrink-0" />
      {!btn.iconOnly && <span>{btn.label}</span>}
    </>
  )
  if (btn.href) {
    return <Link href={btn.href} className={cls} title={btn.iconOnly ? btn.label : undefined}>{inner}</Link>
  }
  return (
    <button
      className={cls}
      title={btn.iconOnly ? btn.label : undefined}
      onClick={btn.onClick ?? (() => {})}
    >
      {inner}
    </button>
  )
}

// ─── UserMenu ─────────────────────────────────────────────────────────────────

function UserMenu({ role, fullName }: { role: string; fullName: string }) {
  const [open, setOpen] = useState(false)
  const initial = fullName.charAt(0).toUpperCase()

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-label="User menu"
      >
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
          {initial}
        </div>
        <span className="text-white text-[11px] font-medium hidden sm:block max-w-[120px] truncate">{fullName}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-[#E0E0E0] py-1 z-50">
            <div className="px-4 py-2.5 border-b border-[#E0E0E0]">
              <p className="text-xs font-semibold text-[#212529]">{fullName}</p>
              <p className="text-[11px] text-[#6C757D] capitalize">{role}</p>
            </div>
            <Link
              href="/app/settings"
              className="flex items-center gap-2 px-4 py-2 text-xs text-[#212529] hover:bg-[#F1F3F4] transition-colors"
              onClick={() => setOpen(false)}
            >
              <Settings className="w-3.5 h-3.5" /> Settings
            </Link>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[#C0392B] hover:bg-red-50 transition-colors"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── OfflineChip ──────────────────────────────────────────────────────────────

function OfflineChip() {
  const { isOnline, pendingCount } = useOfflineStore()
  if (isOnline && pendingCount === 0) return null
  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0',
      isOnline ? 'bg-amber-100 text-amber-700' : 'bg-red-900/30 text-red-300',
    )}>
      {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      <span className="hidden sm:inline">
        {isOnline ? `Syncing ${pendingCount}` : `Offline${pendingCount > 0 ? ` · ${pendingCount}` : ''}`}
      </span>
    </div>
  )
}

// ─── WindowControls ───────────────────────────────────────────────────────────

function WindowControls() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
  if (!isElectron) return null
  return (
    <div className="flex items-center ml-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button title="Minimise" className="w-9 h-full flex items-center justify-center hover:bg-white/10 transition-colors" onClick={() => window.electronAPI?.minimize()}>
        <Minus className="w-3 h-3 text-white/80" />
      </button>
      <button title="Maximise" className="w-9 h-full flex items-center justify-center hover:bg-white/10 transition-colors" onClick={() => window.electronAPI?.maximize()}>
        <Square className="w-3 h-3 text-white/80" />
      </button>
      <button title="Close" className="w-9 h-full flex items-center justify-center hover:bg-red-600 transition-colors" onClick={() => window.electronAPI?.close()}>
        <XIcon className="w-3 h-3 text-white/80" />
      </button>
    </div>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({
  children,
  role,
  fullName,
}: {
  children:  React.ReactNode
  role:      string
  fullName:  string
}) {
  const pathname    = usePathname()
  const router      = useRouter()
  const toolbarBtns = useToolbarButtons(pathname, role)
  const moduleName  = getModuleName(pathname)
  const [search, setSearch] = useState('')

  // Keyboard shortcut: Alt+H → portal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      router.push('/app/dashboard')
    }
  }, [router])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', fontFamily: 'var(--rpx-font, system-ui)' }}
    >
      {/* ── ZONE 1: Title Bar ─────────────────────────────────── */}
      <header
        className="flex items-center shrink-0 px-3 gap-0 border-b border-white/[0.08]"
        style={{ height: 'var(--rpx-titlebar-h, 36px)', background: 'var(--rpx-navy, #1B3A6B)' }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-2 pr-3 border-r border-white/15 shrink-0">
          <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">
            <RefreshCw className="w-3.5 h-3.5 text-[#F2AB1A]" />
          </div>
        </div>

        {/* Breadcrumb: Portal › Module */}
        <nav className="flex items-center gap-1.5 px-3 flex-1 min-w-0" aria-label="Breadcrumb">
          <Link
            href="/app/dashboard"
            className="text-[#8BA4D4] text-[11px] font-medium hover:text-white transition-colors whitespace-nowrap shrink-0"
            title="Alt+H"
          >
            Portal
          </Link>
          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
          <span className="text-white text-[12px] font-semibold tracking-wide truncate">
            {moduleName}
          </span>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1 pl-2 shrink-0">
          <OfflineChip />
          <UserMenu role={role} fullName={fullName} />
          <WindowControls />
        </div>
      </header>

      {/* ── ZONE 2: Contextual Toolbar ────────────────────────── */}
      <div
        className="flex items-center gap-1 px-3 shrink-0 border-b"
        style={{
          height:      'var(--rpx-toolbar-h, 36px)',
          background:  'var(--rpx-ribbon-grey, #F8F9FA)',
          borderColor: 'var(--rpx-border, #E0E0E0)',
        }}
      >
        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-1 overflow-hidden">
          {toolbarBtns.map((btn, i) => (
            <ToolbarBtn key={i} btn={btn} />
          ))}
        </div>

        {/* Separator */}
        {toolbarBtns.length > 0 && (
          <div className="w-px h-4 bg-[#E0E0E0] mx-1 shrink-0" />
        )}

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6C757D]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            aria-label="Search"
            className="pl-7 pr-3 py-1 text-[11px] rounded border border-[#E0E0E0] bg-white
                       focus:outline-none focus:border-[#185ABD] w-40 transition-colors"
          />
        </div>
      </div>

      {/* ── ZONE 3: Content Area ──────────────────────────────── */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F1F3F4]">
        <div className="flex flex-col flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-5 pt-4 pb-4 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
