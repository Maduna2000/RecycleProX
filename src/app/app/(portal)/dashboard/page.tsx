'use client'

import { useRouter } from 'next/navigation'
import {
  Users, UserRound, ShoppingCart, AlertCircle,
  Tag, CreditCard, ImageIcon, Scale,
  Package, ClipboardList, TrendingUp, BarChart2,
  Archive, Wallet, Landmark, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  { label: 'Accounts',           subtitle: 'Customers & Dealers',  icon: Users,         href: '/app/customers',         group: 'navy'  },
  { label: 'Casual Details',     subtitle: 'Walk-in Sellers',      icon: UserRound,     href: '/app/casual',            group: 'navy'  },
  { label: 'Purchases',          subtitle: 'Buy Scrap',            icon: ShoppingCart,  href: '/app/purchases/new',     group: 'navy'  },
  { label: 'Unpaid Purchases',   subtitle: 'Outstanding Balances', icon: AlertCircle,   href: '/app/purchases/unpaid',  group: 'navy'  },
  { label: 'Sales',              subtitle: 'Sell Stock',           icon: Tag,           href: '/app/sales/new',         group: 'blue'  },
  { label: 'Sales Payments',     subtitle: 'Record Payments',      icon: CreditCard,    href: '/app/payments',          group: 'blue'  },
  { label: 'Photo Viewer',       subtitle: 'ID & Purchase Photos', icon: ImageIcon,     href: '/app/photos',            group: 'blue'  },
  { label: 'Weighbridge',        subtitle: 'Scale Integration',    icon: Scale,         href: '/app/weighbridge',       group: 'blue',  comingSoon: true },
  { label: 'Stock Level Grid',   subtitle: 'Inventory View',       icon: Package,       href: '/app/stock',             group: 'green' },
  { label: 'Products',           subtitle: 'Catalogue & Pricing',  icon: ClipboardList, href: '/app/products',          group: 'green' },
  { label: 'Top Product Prices', subtitle: 'Price Groups',         icon: TrendingUp,    href: '/app/price-groups',      group: 'green' },
  { label: 'Reports',            subtitle: 'Analytics & Exports',  icon: BarChart2,     href: '/app/reports',           group: 'green' },
  { label: 'Cash Up',            subtitle: 'Daily Reconciliation', icon: Archive,       href: '/app/cashup',            group: 'amber' },
  { label: 'Expenses',           subtitle: 'Record & Approve',     icon: Wallet,        href: '/app/expenses',          group: 'amber' },
  { label: 'Float',              subtitle: 'Opening & Closing',    icon: Landmark,      href: '/app/float',             group: 'amber' },
  { label: 'Settings',           subtitle: 'System Configuration', icon: Settings,      href: '/app/settings',          group: 'grey'  },
]

// ─── Design maps ──────────────────────────────────────────────────────────────
// Glossy Win7/Aero tile treatment: a translucent glass-highlight gradient
// layered over each group's base color gradient, plus an inner bevel
// (light top edge / dark bottom edge) for a raised, lacquered look. Hover
// intensifies the glow and border rather than scaling the tile — Win7
// motion is glows and fades, not the spring/scale interaction this used to
// have (that read as a Windows 8/10 Start-tile launcher, not Aero).

const GROUP_COLORS: Record<TileGroup, { light: string; base: string; hover: string }> = {
  navy:  { light: '#1e4a8a', base: '#1B3A6B', hover: '#2558a8' },
  blue:  { light: '#1d6bc7', base: '#185ABD', hover: '#2278d4' },
  green: { light: '#278a54', base: '#217346', hover: '#2e9e60' },
  amber: { light: '#c49b1c', base: '#C9A020', hover: '#d4a820' },
  grey:  { light: '#4a5568', base: '#374151', hover: '#5a6578' },
}

const GROUP_GLOW: Record<TileGroup, string> = {
  navy:  'rgba(37,88,168,0.55)',
  blue:  'rgba(34,120,212,0.55)',
  green: 'rgba(46,158,96,0.55)',
  amber: 'rgba(212,168,32,0.55)',
  grey:  'rgba(90,101,120,0.55)',
}

const SUBTITLE_COLOR: Record<TileGroup, string> = {
  navy:  'text-rpx-tabmuted',
  blue:  'text-[#a8c8f0]',
  green: 'text-[#a8d4b8]',
  amber: 'text-[#fde9a0]',
  grey:  'text-white/50',
}

function glossBackground(group: TileGroup): string {
  const { light, base } = GROUP_COLORS[group]
  return [
    'linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0) 52%)',
    `linear-gradient(180deg, ${light} 0%, ${base} 100%)`,
  ].join(', ')
}

const BEVEL = 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18)'
function glowBoxShadow(group: TileGroup): string {
  return `${BEVEL}, 0 0 18px 2px ${GROUP_GLOW[group]}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()

  return (
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
            style={{
              background: glossBackground(tile.group),
              boxShadow:  BEVEL,
            }}
            onMouseEnter={(e) => {
              if (isDisabled) return
              e.currentTarget.style.boxShadow   = glowBoxShadow(tile.group)
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'
            }}
            onMouseLeave={(e) => {
              if (isDisabled) return
              e.currentTarget.style.boxShadow   = BEVEL
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2.5 rounded-xl border border-white/[0.12]',
              'transition-[box-shadow,border-color,filter] duration-150 ease-out cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-rpx-accent/70',
              isDisabled ? 'opacity-30 cursor-not-allowed' : 'active:brightness-90',
            )}
          >
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-white" strokeWidth={1.75} />
            </div>
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
  )
}
