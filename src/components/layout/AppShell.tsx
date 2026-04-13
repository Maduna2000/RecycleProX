'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import {
  Recycle, ChevronDown, Bell, Search,
  Plus, Scale, Printer, Zap, Ban,
  CreditCard, DollarSign, BarChart2,
  ShieldCheck, UserCheck, AlertCircle,
  ArrowLeftRight, ClipboardCheck, FileSpreadsheet,
  FileText, Download, RefreshCw,
  Handshake, LogOut, Settings,
  Minus, Square, X as XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'home' | 'transactions' | 'finance' | 'customers' | 'stock' | 'loans' | 'reports' | 'settings'

interface Tab {
  id:       TabId
  label:    string
  href:     string
  shortcut: string
  matches:  string[]
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS: Tab[] = [
  { id: 'home',         label: 'Home',         href: '/app/dashboard',  shortcut: 'H', matches: ['/app/dashboard'] },
  { id: 'transactions', label: 'Transactions',  href: '/app/purchases',  shortcut: 'T', matches: ['/app/purchases', '/app/sales', '/app/purchases/unpaid'] },
  { id: 'finance',      label: 'Finance',       href: '/app/payments',   shortcut: 'F', matches: ['/app/payments', '/app/expenses', '/app/cashup', '/app/float'] },
  { id: 'customers',    label: 'Customers',     href: '/app/customers',  shortcut: 'C', matches: ['/app/customers', '/app/casual', '/app/police-register', '/app/photos'] },
  { id: 'stock',        label: 'Stock',         href: '/app/stock',      shortcut: 'S', matches: ['/app/stock', '/app/stocktake'] },
  { id: 'loans',        label: 'Loans',         href: '/app/loans',      shortcut: 'L', matches: ['/app/loans'] },
  { id: 'reports',      label: 'Reports',       href: '/app/reports',    shortcut: 'R', matches: ['/app/reports'] },
  { id: 'settings',     label: 'Settings',      href: '/app/settings',   shortcut: ',', matches: ['/app/settings', '/app/products', '/app/price-groups', '/app/audit-log'] },
]

function getActiveTab(pathname: string): TabId {
  for (const tab of TABS) {
    if (tab.matches.some((m) => pathname === m || pathname.startsWith(m + '/'))) {
      return tab.id
    }
  }
  return 'home'
}

// ─── Toolbar button type ──────────────────────────────────────────────────────

interface ToolbarButton {
  label:   string
  icon:    React.ElementType
  href?:   string
  onClick?: () => void
  variant: 'primary' | 'secondary' | 'danger' | 'ghost'
  iconOnly?: boolean
}

// ─── Toolbar configs per tab ──────────────────────────────────────────────────

function useToolbarButtons(activeTab: TabId): ToolbarButton[] {
  switch (activeTab) {
    case 'home':
      return [
        { label: 'Quick Purchase', icon: Plus,     href: '/app/purchases/new', variant: 'primary' },
        { label: 'Refresh',        icon: RefreshCw, variant: 'ghost', iconOnly: true },
      ]
    case 'transactions':
      return [
        { label: 'New Purchase', icon: Plus,          href: '/app/purchases/new',     variant: 'primary' },
        { label: 'New Sale',     icon: Plus,          href: '/app/sales/new',         variant: 'secondary' },
        { label: 'Unpaid',       icon: AlertCircle,   href: '/app/purchases/unpaid',  variant: 'ghost' },
        { label: 'Weigh',        icon: Scale,         href: '/app/purchases/new', variant: 'ghost', iconOnly: true },
        { label: 'Print Slip',   icon: Printer,       variant: 'ghost', iconOnly: true },
        { label: 'Void',         icon: Zap,           variant: 'danger', iconOnly: true },
      ]
    case 'finance':
      return [
        { label: 'Record Payment', icon: Plus,       href: '/app/payments',  variant: 'primary' },
        { label: 'Add Expense',    icon: Plus,       href: '/app/expenses',  variant: 'secondary' },
        { label: 'Cash-Up',        icon: DollarSign, href: '/app/cashup',    variant: 'ghost', iconOnly: true },
        { label: 'Float',          icon: CreditCard, href: '/app/float',     variant: 'ghost', iconOnly: true },
      ]
    case 'customers':
      return [
        { label: 'Add Customer',    icon: Plus,        href: '/app/customers/new',   variant: 'primary' },
        { label: 'Casual Details',  icon: UserCheck,   href: '/app/casual',          variant: 'secondary' },
        { label: 'Police Register', icon: ShieldCheck, href: '/app/police-register', variant: 'ghost', iconOnly: true },
        { label: 'Blacklist',       icon: Ban,         variant: 'danger', iconOnly: true },
      ]
    case 'stock':
      return [
        { label: 'Adjust',        icon: Plus,             href: '/app/stock',    variant: 'primary' },
        { label: 'Transfer',      icon: ArrowLeftRight,   variant: 'secondary', iconOnly: true },
        { label: 'Stocktake',     icon: ClipboardCheck,   href: '/app/stocktake', variant: 'ghost', iconOnly: true },
        { label: 'Export Excel',  icon: FileSpreadsheet,  variant: 'ghost', iconOnly: true },
      ]
    case 'loans':
      return [
        { label: 'New Loan',    icon: Plus,      href: '/app/loans',  variant: 'primary' },
        { label: 'Repayment',   icon: Handshake, variant: 'secondary', iconOnly: true },
        { label: 'Statement',   icon: FileText,  variant: 'ghost', iconOnly: true },
      ]
    case 'reports':
      return [
        { label: 'Generate',     icon: BarChart2,   variant: 'primary' },
        { label: 'Export CSV',   icon: Download,    variant: 'secondary', iconOnly: true },
        { label: 'Export Excel', icon: FileSpreadsheet, variant: 'ghost', iconOnly: true },
        { label: 'Print',        icon: Printer,     variant: 'ghost', iconOnly: true },
      ]
    case 'settings':
      return []
    default:
      return []
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolbarBtn({ btn }: { btn: ToolbarButton }) {
  const base = 'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors focus:outline-none whitespace-nowrap'
  const variants: Record<string, string> = {
    primary:   'bg-[#217346] text-white hover:bg-[#1a5c38]',
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

function UserMenu({ role, fullName }: { role: string; fullName: string }) {
  const [open, setOpen] = useState(false)
  const initial = fullName.charAt(0).toUpperCase()

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
          {initial}
        </div>
        <span className="text-white text-xs font-medium hidden sm:block max-w-24 truncate">{fullName}</span>
        <ChevronDown className="w-3 h-3 text-white/70" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-[#E0E0E0] py-1 z-50"
          onBlur={() => setOpen(false)}
        >
          <div className="px-4 py-2 border-b border-[#E0E0E0]">
            <p className="text-xs font-semibold text-[#212529]">{fullName}</p>
            <p className="text-xs text-[#6C757D] capitalize">{role}</p>
          </div>
          <Link
            href="/app/settings"
            className="flex items-center gap-2 px-4 py-2 text-xs text-[#212529] hover:bg-[#F1F3F4]"
            onClick={() => setOpen(false)}
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </Link>
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[#C0392B] hover:bg-red-50"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Window Controls (Electron only) ─────────────────────────────────────────

function WindowControls() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
  if (!isElectron) return null

  return (
    <div className="flex items-center ml-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        title="Minimise"
        className="w-9 h-full flex items-center justify-center hover:bg-white/10 transition-colors"
        onClick={() => window.electronAPI?.minimize()}
      >
        <Minus className="w-3 h-3 text-white/80" />
      </button>
      <button
        title="Maximise"
        className="w-9 h-full flex items-center justify-center hover:bg-white/10 transition-colors"
        onClick={() => window.electronAPI?.maximize()}
      >
        <Square className="w-3 h-3 text-white/80" />
      </button>
      <button
        title="Close"
        className="w-9 h-full flex items-center justify-center hover:bg-red-600 transition-colors"
        onClick={() => window.electronAPI?.close()}
      >
        <XIcon className="w-3 h-3 text-white/80" />
      </button>
    </div>
  )
}

// ─── Main AppShell ────────────────────────────────────────────────────────────

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
  const activeTab   = getActiveTab(pathname)
  const toolbarBtns = useToolbarButtons(activeTab)
  const [search, setSearch] = useState('')

  // Alt+key shortcuts for ribbon tabs
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.altKey) return
      const key = e.key.toLowerCase()
      const tab = TABS.find((t) => t.shortcut.toLowerCase() === key)
      if (tab) {
        e.preventDefault()
        router.push(tab.href)
      }
    },
    [router],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ fontFamily: 'var(--rpx-font)' }}
    >
      {/* ── ZONE 1: Title Bar ── */}
      <header
        className="flex items-center shrink-0 px-3 gap-0"
        style={{ height: 'var(--rpx-titlebar-h)', background: 'var(--rpx-navy)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 pr-4 shrink-0">
          <div className="w-7 h-7 rounded-md bg-[#217346] flex items-center justify-center">
            <Recycle className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-sm hidden lg:block">RecycleProX</span>
        </div>

        {/* Ribbon Tabs */}
        <nav className="flex items-end h-full flex-1 overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                href={tab.href}
                title={`Alt+${tab.shortcut}`}
                className={cn(
                  'flex items-center px-4 h-full text-xs font-medium transition-colors shrink-0 border-b-2 focus:outline-none',
                  isActive
                    ? 'text-white border-[#F2AB1A] bg-white/10'
                    : 'text-[#8BA4D4] border-transparent hover:text-white hover:bg-white/10',
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-1 pl-2 shrink-0">
          <button className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Notifications">
            <Bell className="w-4 h-4 text-white/80" />
          </button>
          <UserMenu role={role} fullName={fullName} />
          <WindowControls />
        </div>
      </header>

      {/* ── ZONE 2: Contextual Toolbar ── */}
      <div
        className="flex items-center gap-1 px-4 shrink-0 border-b"
        style={{
          height:     'var(--rpx-toolbar-h)',
          background: 'var(--rpx-ribbon-grey)',
          borderColor:'var(--rpx-border)',
        }}
      >
        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-1 flex-wrap overflow-hidden">
          {toolbarBtns.map((btn, i) => (
            <ToolbarBtn key={i} btn={btn} />
          ))}
        </div>

        {/* Separator */}
        {toolbarBtns.length > 0 && (
          <div className="w-px h-5 bg-[#E0E0E0] mx-1 shrink-0" />
        )}

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6C757D]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-7 pr-3 py-1 text-xs rounded border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] w-44"
          />
        </div>
      </div>

      {/* ── ZONE 3: Content Area ── */}
      <main
        className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F8F9FA] px-5 pt-6 pb-5"
      >
        {children}
      </main>
    </div>
  )
}
