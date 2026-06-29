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
  { label: 'Sales',              subtitle: 'Sell Stock',           icon: Tag,           href: '/app/sales',             group: 'blue'  },
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

const GRADIENT: Record<TileGroup, string> = {
  navy:  'from-rpx-navy-light to-rpx-navy',
  blue:  'from-rpx-blue-light to-rpx-blue',
  green: 'from-rpx-green-light to-rpx-green',
  amber: 'from-rpx-amber-light to-rpx-amber',
  grey:  'from-[#4a5568] to-[#374151]',
}

const GRADIENT_HOVER: Record<TileGroup, string> = {
  navy:  'hover:from-rpx-navy-hover hover:to-rpx-navy-light',
  blue:  'hover:from-rpx-blue-hover hover:to-rpx-blue-light',
  green: 'hover:from-rpx-green-hover hover:to-rpx-green-light',
  amber: 'hover:from-rpx-amber-hover hover:to-rpx-amber-light',
  grey:  'hover:from-[#5a6578] hover:to-[#4a5568]',
}

const SUBTITLE_COLOR: Record<TileGroup, string> = {
  navy:  'text-rpx-tabmuted',
  blue:  'text-[#a8c8f0]',
  green: 'text-[#a8d4b8]',
  amber: 'text-[#fde9a0]',
  grey:  'text-white/50',
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
            className={cn(
              'flex flex-col items-center justify-center gap-2.5 rounded-xl border border-white/[0.12]',
              'bg-gradient-to-br transition-all duration-150 ease-out cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-rpx-accent/70',
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
