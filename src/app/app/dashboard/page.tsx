'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import {
  TrendingUp, ShoppingCart, ArrowRightLeft,
  DollarSign, AlertCircle, CheckCircle2, Clock,
  Pencil, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// All available quick-action pages
const ALL_PAGES = [
  { label: 'New Purchase',    href: '/app/purchases/new'  },
  { label: 'New Sale',        href: '/app/sales/new'      },
  { label: 'Payments',        href: '/app/payments'       },
  { label: 'Cash-Up',         href: '/app/cashup'         },
  { label: 'Customers',       href: '/app/customers'      },
  { label: 'Stock',           href: '/app/stock'          },
  { label: 'Expenses',        href: '/app/expenses'       },
  { label: 'Products',        href: '/app/products'       },
  { label: 'Price Groups',    href: '/app/price-groups'   },
  { label: 'Reports',         href: '/app/reports'        },
  { label: 'Loans',           href: '/app/loans'          },
  { label: 'Photos',          href: '/app/photos'         },
  { label: 'Police Register', href: '/app/police-register'},
  { label: 'Stocktake',       href: '/app/stocktake'      },
  { label: 'Casual',          href: '/app/casual'         },
]

const DEFAULT_SHORTCUTS = [
  '/app/purchases/new',
  '/app/sales/new',
  '/app/payments',
  '/app/cashup',
]

const COLORS = [
  'bg-green-600', 'bg-blue-600', 'bg-gray-700', 'bg-orange-600',
]

type TodayStats = {
  date:         string
  sales:        { total: string; count: number }
  purchases:    { total: string; count: number }
  netFlow:      string
  cashUpStatus: 'open' | 'submitted' | 'approved' | null
  cashUpId:     string | null
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'gray',
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: 'green' | 'red' | 'blue' | 'gray'
}) {
  const colors = {
    green: 'text-green-600 bg-green-50',
    red:   'text-red-600 bg-red-50',
    blue:  'text-blue-600 bg-blue-50',
    gray:  'text-gray-600 bg-gray-50',
  }
  return (
    <div className="bg-white rounded-xl border p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const userId = session?.user?.id

  const { data, isLoading } = useSWR<TodayStats>('/api/reports/today', fetcher, {
    refreshInterval: 30_000,
  })

  const settingsKey = userId ? '/api/settings' : null
  const { data: settings } = useSWR<Record<string, string>>(settingsKey, fetcher)

  const shortcutKey = userId ? `user:${userId}:shortcuts` : null
  const savedShortcuts: string[] = shortcutKey && settings?.[shortcutKey]
    ? JSON.parse(settings[shortcutKey]) as string[]
    : DEFAULT_SHORTCUTS

  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft]       = useState<string[]>(savedShortcuts)

  // Sync draft whenever saved shortcuts change
  useEffect(() => { setDraft(savedShortcuts) }, [JSON.stringify(savedShortcuts)])

  async function saveShortcuts(newShortcuts: string[]) {
    if (!shortcutKey) return
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [shortcutKey]: JSON.stringify(newShortcuts) }),
    })
    if (res.ok) {
      await swrMutate('/api/settings')
      toast.success('Shortcuts saved')
      setEditOpen(false)
    } else {
      toast.error('Failed to save shortcuts')
    }
  }

  const name = session?.user?.name ?? session?.user?.username ?? 'there'

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Welcome back, {name} ·{' '}
          {new Date().toLocaleDateString('en-ZA', { dateStyle: 'full' })}
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-gray-400">Loading today&apos;s stats...</div>
      )}

      {data && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              icon={TrendingUp}
              label="Today's Sales"
              value={`R ${new Decimal(data.sales.total).toFixed(2)}`}
              sub={`${data.sales.count} transaction${data.sales.count !== 1 ? 's' : ''}`}
              color="green"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Today's Purchases"
              value={`R ${new Decimal(data.purchases.total).toFixed(2)}`}
              sub={`${data.purchases.count} transaction${data.purchases.count !== 1 ? 's' : ''}`}
              color="red"
            />
            <KpiCard
              icon={ArrowRightLeft}
              label="Net Flow"
              value={`R ${new Decimal(data.netFlow).toFixed(2)}`}
              sub="Sales minus purchases"
              color={new Decimal(data.netFlow).gte(0) ? 'green' : 'red'}
            />
            <KpiCard
              icon={DollarSign}
              label="Cash-Up"
              value={
                data.cashUpStatus === 'approved'  ? 'Approved' :
                data.cashUpStatus === 'submitted' ? 'Awaiting' :
                data.cashUpStatus === 'open'      ? 'Open' :
                'Not Started'
              }
              sub={
                data.cashUpStatus === 'approved'  ? 'Session closed' :
                data.cashUpStatus === 'submitted' ? 'Pending manager sign-off' :
                data.cashUpStatus === 'open'      ? 'Session in progress' :
                'Open a session to begin'
              }
              color={
                data.cashUpStatus === 'approved'  ? 'green' :
                data.cashUpStatus === 'submitted' ? 'blue' :
                'gray'
              }
            />
          </div>

          {/* Cash-up alert banner */}
          {isManager && data.cashUpStatus === 'submitted' && data.cashUpId && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800">
              <Clock className="w-4 h-4 shrink-0" />
              <span>A cash-up is waiting for your approval.</span>
              <Link href="/app/cashup" className="ml-auto font-semibold underline-offset-2 hover:underline">
                Review →
              </Link>
            </div>
          )}

          {!data.cashUpStatus && (
            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-100 rounded-xl px-4 py-3 text-sm text-yellow-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>No cash-up session open for today.</span>
              <Link href="/app/cashup" className="ml-auto font-semibold underline-offset-2 hover:underline">
                Open session →
              </Link>
            </div>
          )}

          {data.cashUpStatus === 'approved' && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Today&apos;s cash-up has been approved.</span>
            </div>
          )}
        </>
      )}

      {/* Configurable Quick Actions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Quick Actions</h2>
          {userId && (
            <button
              onClick={() => { setDraft(savedShortcuts); setEditOpen(true) }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Pencil className="w-3 h-3" /> Customise
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {savedShortcuts.slice(0, 4).map((href, i) => {
            const page = ALL_PAGES.find((p) => p.href === href)
            if (!page) return null
            return (
              <Link
                key={href}
                href={href}
                className={`${COLORS[i] ?? 'bg-gray-600'} text-white text-sm font-semibold rounded-xl px-4 py-3 text-center hover:opacity-90 transition-opacity`}
              >
                {page.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Edit shortcuts dialog */}
      {editOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setEditOpen(false) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Customise Quick Actions</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500">Select up to 4 pages to show as quick shortcuts.</p>
            <div className="space-y-1 max-h-72 overflow-y-auto mt-2">
              {ALL_PAGES.map((page) => {
                const isSelected = draft.includes(page.href)
                const idx        = draft.indexOf(page.href)
                return (
                  <label key={page.href} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (draft.length < 4) setDraft([...draft, page.href])
                          else toast.warning('Maximum 4 shortcuts allowed')
                        } else {
                          setDraft(draft.filter((h) => h !== page.href))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-800">{page.label}</span>
                    {isSelected && (
                      <span className="ml-auto text-xs text-gray-400 font-mono">#{idx + 1}</span>
                    )}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-gray-400">{draft.length}/4 selected</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
              </Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => saveShortcuts(draft)}>
                <Check className="w-3.5 h-3.5 mr-1.5" /> Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Reports link (managers only) */}
      {isManager && (
        <div className="text-sm">
          <Link href="/app/reports" className="text-green-700 font-medium hover:underline">
            View detailed reports →
          </Link>
        </div>
      )}
    </div>
  )
}
