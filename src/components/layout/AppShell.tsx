'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import Decimal from 'decimal.js'
import {
  Plus,
  ClipboardCheck,
  Download, LogOut, Settings, Settings2, TrendingUp,
  Users, UserPlus, ChevronRight,
  Wifi, WifiOff,
  Scale, ClipboardList,
  Boxes, ArrowLeftRight, Grid3X3, SlidersHorizontal,
  ShieldCheck, History, LifeBuoy, DoorOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOfflineStore } from '@/stores/offlineStore'
import { getModuleName } from '@/lib/module-names'
import { WindowTaskbar } from '@/components/ui/WindowTaskbar'
import { useRecordTitle } from '@/hooks/useRecordTitle'
import { useFeatureFlag } from '@/hooks/useFeatureFlags'
import { Btn, BtnMenu, type BtnVariant, type BtnMenuItem } from '@/components/rpx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolbarButton {
  label:    string
  icon:     React.ElementType
  href?:    string
  onClick?: () => void
  variant:  'primary' | 'secondary' | 'danger' | 'ghost'
  iconOnly?: boolean
  /** When present, renders as a dropdown menu of these items. */
  items?:   BtnMenuItem[]
}

// ─── Toolbar configs ──────────────────────────────────────────────────────────

function useToolbarButtons(pathname: string, role: string): ToolbarButton[] {
  const isMgr  = role === 'admin' || role === 'manager'
  const isAdmin = role === 'admin'

  // Exact match only — the list page gets "Add Account", but a customer's
  // own profile (/app/customers/[id]) or the add-account page itself
  // (/app/customers/new) shouldn't show a button that just re-opens the
  // same or a redundant "add" flow.
  if (pathname === '/app/customers')
    return [
      { label: 'Add Account', icon: Plus, href: '/app/customers/new', variant: 'primary' },
    ]

  if (pathname === '/app/casual' || pathname.startsWith('/app/casual/'))
    return []

  if (pathname === '/app/purchases' || pathname.startsWith('/app/purchases/'))
    return []

  // "Unpaid Sales" now lives only inside the Pending Sales panel on the
  // new-sale page itself, not the top nav bar — was a duplicate entry point.
  if (pathname === '/app/sales' || pathname.startsWith('/app/sales/'))
    return []

  // "Account Balances" now lives only inside the Pending Purchases panel on
  // the new-purchase page itself, not the top nav bar — was a duplicate entry point.
  if (pathname === '/app/payments' || pathname.startsWith('/app/payments/'))
    return []

  if (pathname === '/app/expenses' || pathname.startsWith('/app/expenses/'))
    return [
      { label: 'Add Expense', icon: Plus, href: '/app/expenses?add=1', variant: 'primary' },
    ]

  if (pathname === '/app/cashup' || pathname.startsWith('/app/cashup/'))
    return []

  if (pathname === '/app/float' || pathname.startsWith('/app/float/'))
    return []

  if (pathname === '/app/stocktake' || pathname.startsWith('/app/stocktake/'))
    return isMgr ? [
      { label: 'Start Stocktake', icon: ClipboardCheck, href: '/app/stocktake?create=1', variant: 'primary' },
    ] : []

  if (pathname === '/app/stock' || pathname.startsWith('/app/stock/')) {
    const isOnHand    = pathname === '/app/stock'
    const isMovements = pathname === '/app/stock/movements'
    const isGrid      = pathname === '/app/stock/grid'
    return [
      { label: 'Stock On Hand', icon: Boxes,             href: '/app/stock',           variant: isOnHand    ? 'primary' : 'secondary' as const },
      { label: 'Movements',     icon: ArrowLeftRight,    href: '/app/stock/movements', variant: isMovements ? 'primary' : 'secondary' as const },
      { label: 'Grid',          icon: Grid3X3,           href: '/app/stock/grid',      variant: isGrid      ? 'primary' : 'secondary' as const },
      ...(isMgr ? [
        { label: 'Manual Adjustment', icon: SlidersHorizontal, href: '/app/stock?adjust=1', variant: 'ghost' as const },
      ] : []),
    ]
  }

  if (pathname === '/app/products' || pathname.startsWith('/app/products/'))
    return isMgr ? [
      { label: 'Add Product', icon: Plus,       href: '/app/products?add=1',        variant: 'primary' },
      { label: 'Categories',  icon: Settings2,  href: '/app/products?categories=1', variant: 'secondary' },
      { label: 'Bulk Price',  icon: TrendingUp, href: '/app/products?bulk=1',       variant: 'secondary' },
    ] : []

  if (pathname === '/app/price-groups' || pathname.startsWith('/app/price-groups/'))
    return isMgr ? [
      { label: 'Add Price Group', icon: Plus, href: '/app/price-groups?create=1', variant: 'primary' },
    ] : []

  // Reports has its own in-page Run/Download controls — no toolbar actions
  if (pathname === '/app/reports' || pathname.startsWith('/app/reports/'))
    return []

  if (pathname === '/app/audit-log' || pathname.startsWith('/app/audit-log/'))
    return isAdmin ? [
      { label: 'Download', icon: Download, href: '/app/audit-log?export=1', variant: 'secondary' },
    ] : []

  if (pathname === '/app/settings' || pathname.startsWith('/app/settings/'))
    // "Add User" stays even on the Users page itself (it drives ?create=1,
    // opening the modal — genuinely useful there). "Users" is a plain
    // navigation shortcut and shouldn't point at the page you're already on.
    return !isAdmin ? [] : [
      { label: 'Add User', icon: UserPlus, href: '/app/settings/users?create=1', variant: 'primary' },
      ...(pathname === '/app/settings/users' ? [] : [
        { label: 'Users', icon: Users, href: '/app/settings/users', variant: 'secondary' as const },
      ]),
    ]

  if (pathname === '/app/support' || pathname.startsWith('/app/support/'))
    return isAdmin ? [
      { label: 'New Ticket', icon: Plus, href: '/app/support?new=1', variant: 'primary' },
    ] : []

  return []
}

// ─── ToolbarBtn ───────────────────────────────────────────────────────────────

const TOOLBAR_VARIANT: Record<ToolbarButton['variant'], BtnVariant> = {
  primary:   'primary',
  secondary: 'secondary',
  danger:    'danger',
  ghost:     'secondary',
}

function ToolbarBtn({ btn }: { btn: ToolbarButton }) {
  if (btn.items) {
    return (
      <BtnMenu
        size="sm"
        variant={TOOLBAR_VARIANT[btn.variant]}
        icon={btn.icon}
        label={btn.label}
        items={btn.items}
      />
    )
  }
  return (
    <Btn
      size="sm"
      variant={TOOLBAR_VARIANT[btn.variant]}
      icon={btn.icon}
      href={btn.href}
      onClick={btn.onClick}
      title={btn.iconOnly ? btn.label : undefined}
    >
      {!btn.iconOnly && btn.label}
    </Btn>
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
            {role === 'admin' && (
              <Link
                href="/app/support"
                className="flex items-center gap-2 px-4 py-2 text-xs text-[#212529] hover:bg-[#F1F3F4] transition-colors"
                onClick={() => setOpen(false)}
              >
                <LifeBuoy className="w-3.5 h-3.5" /> Support
              </Link>
            )}
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

// ─── ScalePopup ───────────────────────────────────────────────────────────────

function ScalePopup() {
  const [open, setOpen] = useState(false)

  const tiles = [
    { label: 'Scale Orders',    icon: ClipboardList, href: '/app/scale',                  desc: 'View & manage orders' },
    { label: 'Scale Operators', icon: Users,         href: '/app/scale?tab=operators',    desc: 'Manage operator accounts' },
    { label: 'Scale Station',   icon: Scale,         href: '/scale',                      desc: 'Open tablet app', external: true },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all duration-100 focus:outline-none whitespace-nowrap border rounded-sm border-[#185ABD] text-[#185ABD] bg-transparent hover:bg-[#EBF3FC]"
        title="Scale Station"
        aria-label="Scale Station shortcuts"
      >
        <Scale className="w-3.5 h-3.5 shrink-0" />
        <span>Scale</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-sm shadow-2xl border border-[#E0E0E0] py-1.5 z-50">
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold text-[#6C757D] uppercase tracking-widest border-b border-[#F1F3F4]">
              Scale Station
            </p>
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                target={t.external ? '_blank' : undefined}
                rel={t.external ? 'noopener noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-[#EBF3FC] transition-colors"
              >
                <div
                  className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: '#EBF3FC' }}
                >
                  <t.icon className="w-3.5 h-3.5" style={{ color: '#185ABD' }} />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#212529]">{t.label}</p>
                  <p className="text-[10px] text-[#6C757D]">{t.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── GatePopup ────────────────────────────────────────────────────────────────

function GatePopup() {
  const [open, setOpen] = useState(false)

  const tiles = [
    { label: 'Gate Entries',  icon: ClipboardList, href: '/app/gate',               desc: 'View & manage entries' },
    { label: 'Gate Guards',   icon: Users,         href: '/app/gate?tab=guards',    desc: 'Manage guard accounts' },
    { label: 'Guard Station', icon: DoorOpen,      href: '/gate',                   desc: 'Open kiosk app', external: true },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all duration-100 focus:outline-none whitespace-nowrap border rounded-sm border-[#185ABD] text-[#185ABD] bg-transparent hover:bg-[#EBF3FC]"
        title="Guard Station"
        aria-label="Guard Station shortcuts"
      >
        <DoorOpen className="w-3.5 h-3.5 shrink-0" />
        <span>Guard</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-sm shadow-2xl border border-[#E0E0E0] py-1.5 z-50">
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold text-[#6C757D] uppercase tracking-widest border-b border-[#F1F3F4]">
              Guard Station
            </p>
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                target={t.external ? '_blank' : undefined}
                rel={t.external ? 'noopener noreferrer' : undefined}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-[#EBF3FC] transition-colors"
              >
                <div
                  className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: '#EBF3FC' }}
                >
                  <t.icon className="w-3.5 h-3.5" style={{ color: '#185ABD' }} />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#212529]">{t.label}</p>
                  <p className="text-[10px] text-[#6C757D]">{t.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── PolicePopup ──────────────────────────────────────────────────────────────

function PolicePopup({ role }: { role: string }) {
  const [open, setOpen] = useState(false)
  const isManager = role === 'admin' || role === 'manager'
  // Company-level plan entitlement (proof-of-wiring flag for Phase 6 of the
  // SaaS rollout) — distinct from the isManager per-user check above.
  const policeRegisterEnabled = useFeatureFlag('policeRegister')

  const tiles = [
    { label: 'Officer Portal', icon: ShieldCheck, href: '/police', desc: 'Officer registers & searches the register' },
    ...(isManager && policeRegisterEnabled ? [
      { label: 'Register Admin', icon: History, href: '/app/police-register', desc: 'Daily register PDF & visit history' },
    ] : []),
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-all duration-100 focus:outline-none whitespace-nowrap border rounded-sm border-[#185ABD] text-[#185ABD] bg-transparent hover:bg-[#EBF3FC]"
        title="Police Register"
        aria-label="Police Register shortcuts"
      >
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Police</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-sm shadow-2xl border border-[#E0E0E0] py-1.5 z-50">
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold text-[#6C757D] uppercase tracking-widest border-b border-[#F1F3F4]">
              Police Register
            </p>
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2 hover:bg-[#EBF3FC] transition-colors"
              >
                <div
                  className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: '#EBF3FC' }}
                >
                  <t.icon className="w-3.5 h-3.5" style={{ color: '#185ABD' }} />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#212529]">{t.label}</p>
                  <p className="text-[10px] text-[#6C757D]">{t.desc}</p>
                </div>
              </Link>
            ))}
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

// ─── Taskbar ──────────────────────────────────────────────────────────────────

function Taskbar() {
  const [time, setTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
    }
    const msUntilNextMinute = 60000 - (Date.now() % 60000)
    let interval: ReturnType<typeof setInterval>
    const timeout = setTimeout(() => {
      tick()
      interval = setInterval(tick, 60000)
    }, msUntilNextMinute)
    return () => { clearTimeout(timeout); clearInterval(interval) }
  }, [])

  return (
    <div
      className="flex items-center px-3 shrink-0 border-t border-white/10"
      style={{ height: 28, background: 'rgba(27,58,107,0.95)' }}
    >
      <span className="flex-1 text-center text-[10px] text-white/50 font-medium tracking-wide select-none whitespace-nowrap">
        Renovo Pro Management Software &nbsp;·&nbsp; V1.0
      </span>
      <span className="text-[11px] text-white/55 shrink-0 font-mono tabular-nums">{time}</span>
    </div>
  )
}

// ─── Dashboard stats bar (renders inside Zone 2 on dashboard) ────────────────

type TodayStats = {
  purchases:    { total: string; count: number }
  sales:        { total: string; count: number }
  cashUpStatus: 'open' | 'submitted' | 'approved' | null
}

const statsFetcher = (url: string) => fetch(url).then(r => r.json())

type OnSiteData = {
  count:   number
  entries: { id: string; entryNumber: string; vehicleReg: string | null; visitorFirstName: string; visitorLastName: string }[]
}

function OnSiteIndicator() {
  const [open, setOpen] = useState(false)
  const { data } = useSWR<OnSiteData>('/api/gate/on-site', statsFetcher, { refreshInterval: 30_000 })
  const count = data?.count ?? 0

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 border-r border-[#E0E0E0] shrink-0 h-full focus:outline-none"
      >
        <span className="text-[#6B7280] text-[11px] select-none">On Site</span>
        <span className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full border select-none',
          count > 0 ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200',
        )}>
          {count}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-sm shadow-2xl border border-[#E0E0E0] py-1.5 z-50">
            <p className="px-3 pb-1.5 pt-0.5 text-[10px] font-semibold text-[#6C757D] uppercase tracking-widest border-b border-[#F1F3F4]">
              On Site Now
            </p>
            {(!data?.entries || data.entries.length === 0) ? (
              <p className="px-3 py-2.5 text-[11px] text-[#9CA3AF]">No one currently on site</p>
            ) : (
              data.entries.map((e) => (
                <div key={e.id} className="px-3 py-1.5 border-b border-[#F8F9FA] last:border-b-0">
                  <p className="text-[12px] font-medium text-[#212529]">{e.visitorFirstName} {e.visitorLastName}</p>
                  <p className="text-[10px] text-[#6C757D]">{e.entryNumber}{e.vehicleReg ? ` · ${e.vehicleReg}` : ''}</p>
                </div>
              ))
            )}
            <Link
              href="/app/gate"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-[11px] font-medium text-[#185ABD] hover:bg-[#EBF3FC] transition-colors border-t border-[#F1F3F4] mt-0.5"
            >
              View all entries →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

function DashboardStatsBar({ fullName, role }: { fullName: string; role: string }) {
  const { data: stats, isLoading } = useSWR<TodayStats>('/api/reports/today', statsFetcher, {
    refreshInterval: 30_000,
  })
  const isManager = ['admin', 'manager'].includes(role)

  const cashUpLabel =
    stats?.cashUpStatus === 'approved'  ? 'Approved'  :
    stats?.cashUpStatus === 'submitted' ? 'Awaiting'  :
    stats?.cashUpStatus === 'open'      ? 'Open'      : 'Not Started'

  const cashUpBadge =
    stats?.cashUpStatus === 'approved'  ? 'bg-green-100 text-green-700 border-green-200' :
    stats?.cashUpStatus === 'submitted' ? 'bg-amber-100 text-amber-700 border-amber-200' :
    stats?.cashUpStatus === 'open'      ? 'bg-blue-100 text-blue-700 border-blue-200'   :
                                          'bg-gray-100 text-gray-500 border-gray-200'

  return (
    <>
      {/* Welcome */}
      <div className="flex items-center gap-1.5 pr-3 border-r border-[#E0E0E0] shrink-0">
        <span className="text-[#374151] text-[11px] select-none">
          Welcome,&nbsp;<span className="font-semibold">{fullName}</span>
          {role && <span className="text-[#9CA3AF] ml-1">· {role}</span>}
        </span>
      </div>

      {isManager && (
        <>
          {/* Purchases */}
          <div className="flex items-center gap-2 px-3 border-r border-[#E0E0E0] shrink-0">
            <span className="text-[#6B7280] text-[11px] select-none">Purchases</span>
            {isLoading
              ? <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
              : <span className="text-[#1B3A6B] text-[12px] font-bold tabular-nums">
                  R {new Decimal(stats?.purchases?.total ?? '0').toFixed(2)}
                </span>
            }
          </div>

          {/* Cash-Up */}
          <div className="flex items-center gap-2 px-3 border-r border-[#E0E0E0] shrink-0">
            <span className="text-[#6B7280] text-[11px] select-none">Cash-Up</span>
            {isLoading
              ? <div className="h-3 w-14 rounded bg-gray-200 animate-pulse" />
              : <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border select-none', cashUpBadge)}>
                  {cashUpLabel}
                </span>
            }
          </div>

          {/* Sales */}
          <div className="flex items-center gap-2 px-3 border-r border-[#E0E0E0] shrink-0">
            <span className="text-[#6B7280] text-[11px] select-none">Sales</span>
            {isLoading
              ? <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
              : <span className="text-[#1B3A6B] text-[12px] font-bold tabular-nums">
                  R {new Decimal(stats?.sales?.total ?? '0').toFixed(2)}
                </span>
            }
          </div>

          {/* On Site (Gate Security) */}
          <OnSiteIndicator />
        </>
      )}

      <div className="flex-1" />

      {/* Police + Scale + Gate popups — far right */}
      <div className="flex items-center gap-1.5">
        <PolicePopup role={role} />
        {isManager && <ScalePopup />}
        {isManager && <GatePopup />}
      </div>
    </>
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

  // Dynamic route title (for detail pages like /app/purchases/[id])
  const { title: recordTitle, isDetailPage, parentPath, parentLabel } = useRecordTitle(pathname)

  const goHome = useCallback(() => router.push('/app/dashboard'), [router])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      goHome()
    }
  }, [goHome])

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
        style={{ height: 40, background: 'var(--rpx-navy, #1B3A6B)' }}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-2 pr-3 border-r border-white/15 shrink-0">
          <Image src="/brand/renovo-icon.png" alt="" width={22} height={22} className="rounded shrink-0" />
          <div className="flex flex-col leading-none select-none whitespace-nowrap">
            <span className="text-[13px] font-bold tracking-wide">
              <span className="text-white">Renovo</span> <span style={{ color: '#10B981' }}>Pro</span>
            </span>
            <span className="text-white/45 text-[8px] font-semibold tracking-widest uppercase mt-0.5">
              Buy. Sell. Track.
            </span>
          </div>
        </div>

        {/* Breadcrumb: Portal › Module [› Detail] */}
        <nav className="flex items-center gap-1.5 px-3 flex-1 min-w-0" aria-label="Breadcrumb">
          <Link
            href="/app/dashboard"
            className="text-[#8BA4D4] text-[11px] font-medium hover:text-white transition-colors whitespace-nowrap shrink-0"
            title="Alt+H"
          >
            Portal
          </Link>
          <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
          {isDetailPage && parentPath && parentLabel ? (
            <>
              <Link
                href={parentPath}
                className="text-[#8BA4D4] text-[11px] font-medium hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                {parentLabel}
              </Link>
              <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
              <span className="text-white text-[14px] font-bold tracking-wide truncate">
                {recordTitle}
              </span>
            </>
          ) : (
            <span className="text-white text-[14px] font-bold tracking-wide truncate">
              {moduleName}
            </span>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1 pl-2 shrink-0">
          <OfflineChip />
          <UserMenu role={role} fullName={fullName} />
        </div>
      </header>

      {/* ── ZONE 2: Contextual Toolbar ────────────────────────── */}
      {(() => {
        const isDashboard   = pathname === '/app/dashboard'
        const showDashBar   = isDashboard   // all app roles get welcome + police portal access
        const showToolbar   = toolbarBtns.length > 0 || showDashBar
        if (!showToolbar) return null
        return (
          <div
            className="flex items-center gap-1 px-3 shrink-0 border-b"
            style={{
              height:      'var(--rpx-toolbar-h, 32px)',
              background:  'rgba(27,58,107,0.09)',
              borderColor: 'var(--rpx-border, #E0E0E0)',
            }}
          >
            {toolbarBtns.map((btn, i) => <ToolbarBtn key={i} btn={btn} />)}
            {showDashBar && <DashboardStatsBar fullName={fullName} role={role} />}
          </div>
        )
      })()}

      {/* ── ZONE 3: Content Area ──────────────────────────────── */}
      <main className="rpx-content flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F1F3F4]">
        <div className="flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
          {children}
        </div>
      </main>

      {/* ── ZONE 4b: Open Windows Taskbar ────────────────────── */}
      <WindowTaskbar />

      {/* ── ZONE 4a: Footer ───────────────────────────────────── */}
      <Taskbar />
    </div>
  )
}
