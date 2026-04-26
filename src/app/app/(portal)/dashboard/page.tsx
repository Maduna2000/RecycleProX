'use client'

import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import Decimal from 'decimal.js'
import {
  Users, UserRound, ShoppingCart, AlertCircle,
  Tag, CreditCard, ImageIcon, Scale,
  Package, ClipboardList, TrendingUp, BarChart2,
  Archive, Wallet, Landmark, Settings,
  LogOut, RefreshCw, Wifi, WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOfflineStore } from '@/stores/offlineStore'

// ─── Types ────────────────────────────────────────────────────────────────────

type TodayStats = {
  purchases:    { total: string; count: number }
  sales:        { total: string; count: number }
  cashUpStatus: 'open' | 'submitted' | 'approved' | null
}

type TileGroup = 'navy' | 'blue' | 'green' | 'amber' | 'grey'

interface Tile {
  label:       string
  subtitle:    string
  icon:        React.ElementType
  href:        string
  group:       TileGroup
  comingSoon?: boolean
}

// ─── Tile registry ────────────────────────────────────────────────────────────

const TILES: Tile[] = [
  // Navy — Customers & Transactions
  { label: 'Accounts',           subtitle: 'Customers & Dealers',  icon: Users,         href: '/app/customers',         group: 'navy'  },
  { label: 'Casual Details',     subtitle: 'Walk-in Sellers',      icon: UserRound,     href: '/app/casual',            group: 'navy'  },
  { label: 'Purchases',          subtitle: 'Buy Scrap',            icon: ShoppingCart,  href: '/app/purchases',         group: 'navy'  },
  { label: 'Unpaid Purchases',   subtitle: 'Outstanding Balances', icon: AlertCircle,   href: '/app/purchases/unpaid',  group: 'navy'  },
  // Blue — Sales & Media
  { label: 'Sales',              subtitle: 'Sell Stock',           icon: Tag,           href: '/app/sales',             group: 'blue'  },
  { label: 'Sales Payments',     subtitle: 'Record Payments',      icon: CreditCard,    href: '/app/payments',          group: 'blue'  },
  { label: 'Photo Viewer',       subtitle: 'ID & Purchase Photos', icon: ImageIcon,     href: '/app/photos',            group: 'blue'  },
  { label: 'Weighbridge',        subtitle: 'Scale Integration',    icon: Scale,         href: '/app/weighbridge',       group: 'blue',  comingSoon: true },
  // Green — Stock & Products
  { label: 'Stock Level Grid',   subtitle: 'Inventory View',       icon: Package,       href: '/app/stock',             group: 'green' },
  { label: 'Products',           subtitle: 'Catalogue & Pricing',  icon: ClipboardList, href: '/app/products',          group: 'green' },
  { label: 'Top Product Prices', subtitle: 'Price Groups',         icon: TrendingUp,    href: '/app/price-groups',      group: 'green' },
  { label: 'Reports',            subtitle: 'Analytics & Exports',  icon: BarChart2,     href: '/app/reports',           group: 'green' },
  // Amber — Finance
  { label: 'Cash Up',            subtitle: 'Daily Reconciliation', icon: Archive,       href: '/app/cashup',            group: 'amber' },
  { label: 'Expenses',           subtitle: 'Record & Approve',     icon: Wallet,        href: '/app/expenses',          group: 'amber' },
  { label: 'Float',              subtitle: 'Opening & Closing',    icon: Landmark,      href: '/app/float',             group: 'amber' },
  // Grey — System
  { label: 'Settings',           subtitle: 'System Configuration', icon: Settings,      href: '/app/settings',          group: 'grey'  },
]

// ─── Design maps ──────────────────────────────────────────────────────────────

const GRADIENT: Record<TileGroup, string> = {
  navy:  'from-[#1e4a8a] to-[#1B3A6B]',
  blue:  'from-[#1d6bc7] to-[#185ABD]',
  green: 'from-[#278a54] to-[#217346]',
  amber: 'from-[#c49b1c] to-[#C9A020]',
  grey:  'from-[#4a5568] to-[#374151]',
}

const GRADIENT_HOVER: Record<TileGroup, string> = {
  navy:  'hover:from-[#2558a8] hover:to-[#1e4a8a]',
  blue:  'hover:from-[#2278d4] hover:to-[#1d6bc7]',
  green: 'hover:from-[#2e9e60] hover:to-[#278a54]',
  amber: 'hover:from-[#d4a820] hover:to-[#c49b1c]',
  grey:  'hover:from-[#5a6578] hover:to-[#4a5568]',
}

const SUBTITLE_COLOR: Record<TileGroup, string> = {
  navy:  'text-[#8BA4D4]',
  blue:  'text-[#a8c8f0]',
  green: 'text-[#a8d4b8]',
  amber: 'text-[#fde9a0]',
  grey:  'text-white/50',
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatSkeleton() {
  return <div className="h-3.5 w-20 rounded bg-white/10 animate-pulse" />
}

function OfflineChip() {
  const { isOnline, pendingCount } = useOfflineStore()
  if (isOnline && pendingCount === 0) return null
  return (
    <div className={cn(
      'flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
      isOnline ? 'bg-amber-400/20 text-amber-300' : 'bg-red-500/20 text-red-300',
    )}>
      {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {isOnline ? `Syncing ${pendingCount}` : 'Offline'}
    </div>
  )
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const dateStr = time.toLocaleDateString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeStr = time.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  return (
    <span className="text-[#8BA4D4] text-[11px] tabular-nums">{dateStr} · {timeStr}</span>
  )
}

// ─── Portal Page ──────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function PortalPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const { data: stats, isLoading } = useSWR<TodayStats>('/api/reports/today', fetcher, {
    refreshInterval: 30_000,
  })

  const fullName = session?.user?.fullName ?? session?.user?.username ?? 'User'
  const role     = session?.user?.role ?? ''

  const cashUpLabel =
    stats?.cashUpStatus === 'approved'  ? 'Approved' :
    stats?.cashUpStatus === 'submitted' ? 'Awaiting' :
    stats?.cashUpStatus === 'open'      ? 'Open' : 'Not Started'

  const cashUpBadge =
    stats?.cashUpStatus === 'approved'  ? 'bg-[#217346] text-white' :
    stats?.cashUpStatus === 'submitted' ? 'bg-[#C9A020] text-[#1a1a1a]' :
    stats?.cashUpStatus === 'open'      ? 'bg-[#185ABD] text-white' :
                                          'bg-white/10 text-white/50'

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', background: '#0a1628', fontFamily: 'var(--rpx-font, system-ui)' }}
    >
      {/* ── TOP BAR ────────────────────────────────────────────── */}
      <header
        className="flex items-center shrink-0 px-4 gap-4 border-b border-white/[0.08]"
        style={{ height: 40, background: '#081120' }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded bg-[#1B3A6B] flex items-center justify-center shrink-0">
            <RefreshCw className="w-3.5 h-3.5 text-[#F2AB1A]" />
          </div>
          <span className="text-[#F2AB1A] font-bold text-[13px] tracking-wide select-none">Renovo Pro</span>
        </div>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        <div className="flex-1" />

        <OfflineChip />

        <div className="flex items-center gap-1.5">
          <span className="text-[#8BA4D4] text-[11px] select-none">
            {fullName}
            {role && <span className="text-white/25 ml-1">· {role}</span>}
          </span>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium
                     bg-[#C0392B]/80 text-white hover:bg-[#C0392B] active:scale-95
                     transition-all duration-150 shrink-0"
          aria-label="Sign out"
        >
          <LogOut className="w-3 h-3" />
          Log Out
        </button>
      </header>

      {/* ── STATS STRIP ────────────────────────────────────────── */}
      <div
        className="flex items-center shrink-0 px-4 gap-0 border-b border-white/[0.06]"
        style={{ height: 34, background: '#0d1f3c' }}
      >
        {/* Purchases */}
        <div className="flex items-center gap-2 pr-5">
          <span className="text-[#8BA4D4] text-[11px] select-none">Today&apos;s Purchases</span>
          {isLoading
            ? <StatSkeleton />
            : <span className="text-[#F2AB1A] text-[12px] font-bold tabular-nums">
                R {new Decimal(stats?.purchases?.total ?? '0').toFixed(2)}
              </span>
          }
        </div>

        <div className="w-px h-4 bg-white/10 shrink-0 mx-3" />

        {/* Cash-Up */}
        <div className="flex items-center gap-2 px-0">
          <span className="text-[#8BA4D4] text-[11px] select-none">Cash-Up</span>
          {isLoading
            ? <StatSkeleton />
            : <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full select-none', cashUpBadge)}>
                {cashUpLabel}
              </span>
          }
        </div>

        <div className="w-px h-4 bg-white/10 shrink-0 mx-3" />

        {/* Sales */}
        <div className="flex items-center gap-2 pl-0">
          <span className="text-[#8BA4D4] text-[11px] select-none">Today&apos;s Sales</span>
          {isLoading
            ? <StatSkeleton />
            : <span className="text-[#F2AB1A] text-[12px] font-bold tabular-nums">
                R {new Decimal(stats?.sales?.total ?? '0').toFixed(2)}
              </span>
          }
        </div>

        <div className="flex-1" />
        <LiveClock />
      </div>

      {/* ── TILE GRID ────────────────────────────────────────────── */}
      <main
        className="flex-1 min-h-0 p-3 grid gap-3"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}
      >
        {TILES.map((tile) => {
          const Icon       = tile.icon
          const isDisabled = !!tile.comingSoon

          return (
            <button
              key={tile.label}
              onClick={() => !isDisabled && router.push(tile.href)}
              disabled={isDisabled}
              aria-label={isDisabled ? `${tile.label} — Coming Soon` : tile.label}
              className={cn(
                'flex flex-col items-center justify-center gap-2.5 rounded-xl border border-white/[0.12]',
                'bg-gradient-to-br transition-all duration-150 ease-out cursor-pointer',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2AB1A]/70',
                GRADIENT[tile.group],
                isDisabled
                  ? 'opacity-30 cursor-not-allowed'
                  : cn(
                      GRADIENT_HOVER[tile.group],
                      'hover:border-white/25 hover:shadow-xl hover:shadow-black/40 hover:scale-[1.02]',
                      'active:scale-[0.97] active:brightness-95',
                    ),
              )}
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-white" strokeWidth={1.75} />
              </div>

              {/* Text */}
              <div className="text-center px-3 leading-none">
                <p className="text-white text-[12px] font-semibold tracking-wide">{tile.label}</p>
                <p className={cn('text-[10px] mt-1', SUBTITLE_COLOR[tile.group])}>
                  {tile.comingSoon ? '— Coming Soon —' : tile.subtitle}
                </p>
              </div>
            </button>
          )
        })}
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer
        className="shrink-0 flex items-center justify-center border-t border-white/[0.06]"
        style={{ height: 26, background: '#081120' }}
      >
        <span className="text-white/20 text-[10px] tracking-widest uppercase select-none">
          Renovo Pro Management Software &nbsp;·&nbsp; Version 3.0
        </span>
      </footer>
    </div>
  )
}
