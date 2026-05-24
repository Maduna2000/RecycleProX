'use client'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import Decimal from 'decimal.js'
import {
  Users, UserRound, ShoppingCart, AlertCircle,
  Tag, CreditCard, ImageIcon, Scale,
  Package, ClipboardList, TrendingUp, BarChart2,
  Archive, Wallet, Landmark, Settings,
  ChevronRight,
} from 'lucide-react'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

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

const TILE_SECTIONS: { heading: string; tiles: Tile[] }[] = [
  {
    heading: 'Transactions',
    tiles: [
      { label: 'Accounts',         subtitle: 'Customers & Dealers',  icon: Users,        href: '/app/customers',        group: 'navy'  },
      { label: 'Casual Details',   subtitle: 'Walk-in Sellers',      icon: UserRound,    href: '/app/casual',           group: 'navy'  },
      { label: 'Purchases',        subtitle: 'Buy Scrap',            icon: ShoppingCart, href: '/app/purchases',        group: 'navy'  },
      { label: 'Unpaid Purchases', subtitle: 'Outstanding Balances', icon: AlertCircle,  href: '/app/purchases/unpaid', group: 'navy'  },
    ],
  },
  {
    heading: 'Sales & Media',
    tiles: [
      { label: 'Sales',          subtitle: 'Sell Stock',           icon: Tag,          href: '/app/sales',     group: 'blue' },
      { label: 'Sales Payments', subtitle: 'Record Payments',      icon: CreditCard,   href: '/app/payments',  group: 'blue' },
      { label: 'Photo Viewer',   subtitle: 'ID & Purchase Photos', icon: ImageIcon,    href: '/app/photos',    group: 'blue' },
      { label: 'Weighbridge',    subtitle: 'Scale Integration',    icon: Scale,        href: '/app/weighbridge', group: 'blue', comingSoon: true },
    ],
  },
  {
    heading: 'Inventory',
    tiles: [
      { label: 'Stock Level Grid',   subtitle: 'Inventory View',       icon: Package,       href: '/app/stock',        group: 'green' },
      { label: 'Products',           subtitle: 'Catalogue & Pricing',  icon: ClipboardList, href: '/app/products',     group: 'green' },
      { label: 'Top Product Prices', subtitle: 'Price Groups',         icon: TrendingUp,    href: '/app/price-groups', group: 'green' },
      { label: 'Reports',            subtitle: 'Analytics & Exports',  icon: BarChart2,     href: '/app/reports',      group: 'green' },
    ],
  },
  {
    heading: 'Finance',
    tiles: [
      { label: 'Cash Up',  subtitle: 'Daily Reconciliation', icon: Archive,  href: '/app/cashup',   group: 'amber' },
      { label: 'Expenses', subtitle: 'Record & Approve',     icon: Wallet,   href: '/app/expenses', group: 'amber' },
      { label: 'Float',    subtitle: 'Opening & Closing',    icon: Landmark, href: '/app/float',    group: 'amber' },
      { label: 'Settings', subtitle: 'System Configuration', icon: Settings, href: '/app/settings', group: 'grey'  },
    ],
  },
]

// ─── Group accent colours (light-theme) ──────────────────────────────────────

const ICON_BG: Record<TileGroup, string>    = {
  navy:  '#E8EFF8',
  blue:  '#E8F0FB',
  green: '#E6F4EC',
  amber: '#FEF6E0',
  grey:  '#F1F3F4',
}
const ICON_COLOR: Record<TileGroup, string> = {
  navy:  '#1B3A6B',
  blue:  '#185ABD',
  green: '#217346',
  amber: '#C9A020',
  grey:  '#6C757D',
}
const TILE_BORDER: Record<TileGroup, string> = {
  navy:  '#C5D5EC',
  blue:  '#C0D6F5',
  green: '#B8DECA',
  amber: '#F5D98A',
  grey:  '#D0D0D0',
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label:  string
  value:  string
  sub?:   string
  accent: string
}) {
  return (
    <div
      className="bg-white border border-[#E0E0E0] rounded-sm px-4 py-3 flex flex-col gap-1"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <p style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ fontSize: 20, fontWeight: fontWeight.bold, color: colors.textPrimary, lineHeight: 1.1 }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function DashTile({ tile, onClick }: { tile: Tile; onClick: () => void }) {
  const Icon = tile.icon
  return (
    <button
      onClick={onClick}
      disabled={!!tile.comingSoon}
      title={tile.comingSoon ? `${tile.label} — Coming Soon` : tile.label}
      className="group flex items-center gap-3 bg-white border rounded-sm px-4 py-3 text-left transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none hover:shadow-sm"
      style={{
        borderColor:  TILE_BORDER[tile.group],
        cursor: tile.comingSoon ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!tile.comingSoon) (e.currentTarget as HTMLButtonElement).style.borderColor = ICON_COLOR[tile.group] }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = TILE_BORDER[tile.group] }}
    >
      <div
        className="w-9 h-9 rounded-sm flex items-center justify-center shrink-0"
        style={{ background: ICON_BG[tile.group] }}
      >
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18, color: ICON_COLOR[tile.group] }} strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, lineHeight: 1.2 }}>
          {tile.label}
        </p>
        <p style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 }}>
          {tile.comingSoon ? 'Coming Soon' : tile.subtitle}
        </p>
      </div>
      {!tile.comingSoon && (
        <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: ICON_COLOR[tile.group] }} />
      )}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const { data: stats, isLoading } = useSWR<TodayStats>('/api/reports/today', fetcher, { refreshInterval: 30_000 })

  const role      = session?.user?.role ?? ''
  const isManager = ['admin', 'manager'].includes(role)

  const cashUpLabel =
    stats?.cashUpStatus === 'approved'  ? 'Approved ✓' :
    stats?.cashUpStatus === 'submitted' ? 'Awaiting Review' :
    stats?.cashUpStatus === 'open'      ? 'Open' : 'Not Started'

  const cashUpAccent =
    stats?.cashUpStatus === 'approved'  ? colors.action  :
    stats?.cashUpStatus === 'submitted' ? colors.warning  :
    stats?.cashUpStatus === 'open'      ? colors.process  : colors.textSecondary

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Page header */}
      <div className="flex items-baseline justify-between shrink-0">
        <div>
          <h1 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary, lineHeight: 1.3 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
            Welcome back{session?.user?.fullName ? `, ${session.user.fullName}` : ''}
          </p>
        </div>
      </div>

      {/* Stats strip — manager/admin only */}
      {isManager && (
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <StatCard
            label="Today's Purchases"
            value={isLoading ? '—' : `R ${new Decimal(stats?.purchases?.total ?? '0').toFixed(2)}`}
            sub={isLoading ? undefined : `${stats?.purchases?.count ?? 0} transaction${stats?.purchases?.count !== 1 ? 's' : ''}`}
            accent={colors.primary}
          />
          <StatCard
            label="Today's Sales"
            value={isLoading ? '—' : `R ${new Decimal(stats?.sales?.total ?? '0').toFixed(2)}`}
            sub={isLoading ? undefined : `${stats?.sales?.count ?? 0} transaction${stats?.sales?.count !== 1 ? 's' : ''}`}
            accent={colors.action}
          />
          <StatCard
            label="Cash-Up Status"
            value={isLoading ? '—' : cashUpLabel}
            accent={cashUpAccent}
          />
        </div>
      )}

      {/* Tile grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 gap-6 pb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {TILE_SECTIONS.map(section => (
            <div key={section.heading} className="flex flex-col gap-2">
              <p style={{
                fontSize:      fontSize.xs,
                fontWeight:    fontWeight.semibold,
                color:         colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                paddingBottom: 4,
                borderBottom:  `1px solid ${colors.border}`,
              }}>
                {section.heading}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {section.tiles.map(tile => (
                  <DashTile
                    key={tile.label}
                    tile={tile}
                    onClick={() => !tile.comingSoon && router.push(tile.href)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
