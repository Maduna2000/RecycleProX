'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Oswald, IBM_Plex_Sans } from 'next/font/google'
import { cn } from '@/lib/utils'

const oswald  = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-oswald' })
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans' })

// ─── Types ────────────────────────────────────────────────────────────────────

type TileGroup = 'blue' | 'yellow' | 'rust' | 'moss' | 'ink'

interface Tile {
  label:       string
  subtitle:    string
  icon:        React.ReactNode
  href:        string
  group:       TileGroup
  comingSoon?: boolean
}

// ─── Yard-specific icon set ───────────────────────────────────────────────────
// Each icon depicts the actual object/action, not a generic glyph — a scrap
// cube for buying scrap, a truck for outbound sales, a cash drawer for
// cash-up, etc. Rendered white-on-enamel, so stroke is fixed, not per-group.

const ICON_PROPS = { viewBox: '0 0 24 24', fill: 'none', stroke: '#F4F1E9', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const Icons = {
  accounts: (
    <svg {...ICON_PROPS}><rect x="3" y="5" width="18" height="13" rx="1.5"/><path d="M3 8h18"/><circle cx="8" cy="13" r="1.6" fill="#F4F1E9" stroke="none"/><path d="M12.5 13h5M12.5 15.5h3.5"/></svg>
  ),
  casual: (
    <svg {...ICON_PROPS}><path d="M7 20c.5-3 1.8-4.6 3-4.6s2.5 1.6 3 4.6"/><ellipse cx="10" cy="7" rx="2.4" ry="2.8"/><path d="M15.5 9.5l1.8 1.8-2.3 3.4M16.5 13l1.6 1.6-2 3"/></svg>
  ),
  purchases: (
    <svg {...ICON_PROPS}><path d="M4 8l8-3.5L20 8v8l-8 3.5L4 16z"/><path d="M4 8l8 3.5M12 11.5L20 8M12 11.5V19.5"/><path d="M8 6.3l8 3.5" strokeDasharray="1.4 1.6"/></svg>
  ),
  unpaid: (
    <svg {...ICON_PROPS}><path d="M6 4h11l2 2.2V20l-3-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 18.4z"/><path d="M9 9h6M9 12.5h4"/><path d="M17 4.2l2 2.2-2.4.5z" fill="#F4F1E9" stroke="none"/></svg>
  ),
  sales: (
    <svg {...ICON_PROPS}><path d="M3 7h9v8H3z"/><path d="M12 11h4l3 2.6V15h-7z"/><circle cx="7" cy="17.3" r="1.5"/><circle cx="16.5" cy="17.3" r="1.5"/><path d="M5 9.3h5M5 11.6h5" strokeDasharray="1.2 1.4"/></svg>
  ),
  payments: (
    <svg {...ICON_PROPS}><rect x="3" y="6" width="18" height="12" rx="1.6"/><path d="M3 10h18"/><rect x="6" y="13" width="4" height="2.3" rx="0.5"/></svg>
  ),
  photos: (
    <svg {...ICON_PROPS}><path d="M4 8h3.2l1.3-2h6.4l1.3 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.3" r="3.2"/></svg>
  ),
  weighbridge: (
    <svg {...ICON_PROPS}><path d="M5 10h9v4H5z"/><path d="M9 10V8.5a2 2 0 0 1 2-2h1.5"/><circle cx="7.5" cy="15" r="1.3"/><circle cx="12.5" cy="15" r="1.3"/><path d="M2 18.5h20"/><path d="M4 18.5v-1.6M20 18.5v-1.6"/></svg>
  ),
  stock: (
    <svg {...ICON_PROPS}><rect x="4" y="13" width="6" height="6"/><rect x="11" y="13" width="6" height="6"/><rect x="7.5" y="6.5" width="6" height="6"/></svg>
  ),
  products: (
    <svg {...ICON_PROPS}><path d="M12 3l8 8-9 9-8-8V4h9z"/><circle cx="9" cy="7.5" r="1.3" fill="#F4F1E9" stroke="none"/></svg>
  ),
  prices: (
    <svg {...ICON_PROPS}><path d="M4 16l5-6 4 3 6-7"/><path d="M15 6h4v4"/></svg>
  ),
  reports: (
    <svg {...ICON_PROPS}><rect x="5" y="4" width="14" height="17" rx="1.2"/><path d="M9 4V3h6v1"/><path d="M8 12v5M12 9v8M16 13v4"/></svg>
  ),
  cashup: (
    <svg {...ICON_PROPS}><rect x="3" y="10" width="18" height="9" rx="1"/><path d="M3 10l2.5-6h13L21 10"/><rect x="10" y="13.3" width="4" height="2.4" rx="0.4"/></svg>
  ),
  expenses: (
    <svg {...ICON_PROPS}><path d="M7 3.5h10v17l-2.5-1.6L12 20.5l-2.5-1.6L7 20.5z"/><path d="M9.3 9h5.4M9.3 12.2h3.6"/></svg>
  ),
  float: (
    <svg {...ICON_PROPS}><ellipse cx="12" cy="7" rx="6.4" ry="2.4"/><path d="M5.6 7v5c0 1.3 2.9 2.4 6.4 2.4s6.4-1.1 6.4-2.4V7"/><path d="M5.6 12v5c0 1.3 2.9 2.4 6.4 2.4s6.4-1.1 6.4-2.4v-5"/></svg>
  ),
  settings: (
    <svg {...ICON_PROPS}><circle cx="12" cy="12" r="2.8"/><path d="M12 3.5v2M12 18.5v2M4.9 6.9l1.4 1.4M17.7 15.7l1.4 1.4M3.5 12h2M18.5 12h2M4.9 17.1l1.4-1.4M17.7 8.3l1.4-1.4"/></svg>
  ),
}

// ─── Tile registry ────────────────────────────────────────────────────────────

const TILES: Tile[] = [
  { label: 'Accounts',           subtitle: 'Customers & Dealers',  icon: Icons.accounts,    href: '/app/customers',        group: 'blue'   },
  { label: 'Casual Details',     subtitle: 'Walk-in Sellers',      icon: Icons.casual,      href: '/app/casual',           group: 'blue'   },
  { label: 'Purchases',          subtitle: 'Buy Scrap',            icon: Icons.purchases,   href: '/app/purchases/new',    group: 'yellow' },
  { label: 'Unpaid Purchases',   subtitle: 'Outstanding Balances', icon: Icons.unpaid,      href: '/app/purchases/unpaid', group: 'rust'   },
  { label: 'Sales',              subtitle: 'Sell Stock',           icon: Icons.sales,       href: '/app/sales/new',        group: 'rust'   },
  { label: 'Sales Payments',     subtitle: 'Record Payments',      icon: Icons.payments,    href: '/app/payments',         group: 'rust'   },
  { label: 'Photo Viewer',       subtitle: 'ID & Purchase Photos', icon: Icons.photos,      href: '/app/photos',           group: 'rust'   },
  { label: 'Weighbridge',        subtitle: 'Scale Integration',    icon: Icons.weighbridge, href: '/app/weighbridge',      group: 'rust',  comingSoon: true },
  { label: 'Stock Level Grid',   subtitle: 'Inventory View',       icon: Icons.stock,       href: '/app/stock',            group: 'moss'   },
  { label: 'Products',           subtitle: 'Catalogue & Pricing',  icon: Icons.products,    href: '/app/products',         group: 'moss'   },
  { label: 'Top Product Prices', subtitle: 'Price Groups',         icon: Icons.prices,      href: '/app/price-groups',     group: 'moss'   },
  { label: 'Reports',            subtitle: 'Analytics & Exports',  icon: Icons.reports,     href: '/app/reports',          group: 'moss'   },
  { label: 'Cash Up',            subtitle: 'Daily Reconciliation', icon: Icons.cashup,      href: '/app/cashup',           group: 'yellow' },
  { label: 'Expenses',           subtitle: 'Record & Approve',     icon: Icons.expenses,    href: '/app/expenses',         group: 'yellow' },
  { label: 'Float',              subtitle: 'Opening & Closing',    icon: Icons.float,       href: '/app/float',            group: 'yellow' },
  { label: 'Settings',           subtitle: 'System Configuration', icon: Icons.settings,    href: '/app/settings',         group: 'ink'    },
]

// ─── Yard Floor material ──────────────────────────────────────────────────────
// Brushed galvanized-steel plates: light-catching bevel top-left, shadow
// falling away bottom-right, punched rivets at the corners. Group colour is
// an enamel-paint disc set into the icon badge, not the whole tile.

const GROUP_ACCENT: Record<TileGroup, string> = {
  blue:   '#3D6E8F',
  yellow: '#B8860B',
  rust:   '#A8471E',
  moss:   '#4E6E45',
  ink:    '#52565C',
}

const PLATE_BG =
  'repeating-linear-gradient(115deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, rgba(0,0,0,0.02) 1px, rgba(0,0,0,0.02) 2px, transparent 2px, transparent 4px),' +
  'linear-gradient(160deg, #D6D9DB 0%, #B7BBBE 60%, #92969A 100%)'
const PLATE_SHADOW    = 'inset 0 1.5px 0 rgba(255,255,255,0.65), inset 0 -2px 3px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.14)'
const PLATE_SHADOW_HOVER = 'inset 0 1.5px 0 rgba(255,255,255,0.75), inset 0 -2px 3px rgba(0,0,0,0.18), 0 4px 8px rgba(0,0,0,0.22)'
const RIVET = 'linear-gradient(160deg, #E4E7E9 0%, #6E7377 55%, #575B5E 100%)'

function Rivet({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const vertical   = pos[0] === 't' ? { top: 7 } : { bottom: 7 }
  const horizontal = pos[1] === 'l' ? { left: 7 } : { right: 7 }
  return (
    <span
      style={{
        position: 'absolute', width: 6, height: 6, borderRadius: '50%',
        background: RIVET, boxShadow: '0 1px 1px rgba(0,0,0,0.35), inset 0 0.5px 0 rgba(255,255,255,0.8)',
        ...vertical, ...horizontal,
      }}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('denied') === '1') {
      toast.error("You don't have access to that module", {
        description: 'Contact an admin or manager if you believe this is a mistake.',
      })
      router.replace('/app/dashboard')
    }
  }, [searchParams, router])

  return (
    <main
      className={cn(oswald.variable, plexSans.variable, 'flex-1 min-h-0 p-3 grid gap-3')}
      style={{
        gridTemplateColumns: 'repeat(4, 1fr)',
        gridTemplateRows: 'repeat(4, 1fr)',
        fontFamily: 'var(--font-plex-sans), system-ui, sans-serif',
        backgroundColor: '#9EA3A8',
        backgroundImage:
          'linear-gradient(160deg, #C9CCCF 0%, #9EA3A8 55%, #C9CCCF 100%),' +
          'repeating-linear-gradient(115deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, rgba(0,0,0,0.035) 1px, rgba(0,0,0,0.035) 2px, transparent 2px, transparent 4px)',
      }}
    >
      {TILES.map((tile) => {
        const isDisabled = !!tile.comingSoon
        const accent = GROUP_ACCENT[tile.group]

        return (
          <button
            key={tile.label}
            onClick={() => !isDisabled && router.push(tile.href)}
            disabled={isDisabled}
            aria-label={isDisabled ? `${tile.label} — Coming Soon` : tile.label}
            style={{ background: PLATE_BG, boxShadow: PLATE_SHADOW, borderColor: '#6E7377' }}
            onMouseEnter={(e) => { if (!isDisabled) e.currentTarget.style.boxShadow = PLATE_SHADOW_HOVER }}
            onMouseLeave={(e) => { if (!isDisabled) e.currentTarget.style.boxShadow = PLATE_SHADOW }}
            className={cn(
              'relative flex flex-col items-center justify-center gap-3 rounded border',
              'transition-transform duration-150 ease-out cursor-pointer',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5C0A]/70',
              isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-0.5 active:translate-y-0',
            )}
          >
            <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />
            <span
              className="w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 [&_svg]:w-6 [&_svg]:h-6"
              style={{
                background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.5), transparent 45%), ${accent}`,
                border: '2px solid #D6D9DB',
                boxShadow: '0 0 0 1px #6E7377, inset 0 1px 2px rgba(0,0,0,0.3), inset 0 -1px 1px rgba(255,255,255,0.15)',
              }}
            >
              {tile.icon}
            </span>
            <div className="text-center px-3 leading-tight">
              <p
                className="text-[13px] font-semibold tracking-wide"
                style={{ fontFamily: 'var(--font-oswald), sans-serif', color: '#23262A' }}
              >
                {tile.label}
              </p>
              <p className="text-[10.5px] mt-1" style={{ color: '#52565C', fontStyle: isDisabled ? 'italic' : 'normal' }}>
                {isDisabled ? '— Coming Soon —' : tile.subtitle}
              </p>
            </div>
          </button>
        )
      })}
    </main>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  )
}
