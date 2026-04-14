'use client'

import { useState, useEffect } from 'react'
import useSWR, { mutate as swrMutate } from 'swr'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import Decimal from 'decimal.js'
import {
  TrendingUp, ShoppingCart, ArrowRightLeft, DollarSign,
  AlertCircle, CheckCircle2, Clock, Pencil, Check, X,
  Package, Activity,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatCard } from '@/components/ui/StatCard'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ALL_PAGES = [
  { label: 'New Purchase',    href: '/app/purchases/new'   },
  { label: 'New Sale',        href: '/app/sales/new'       },
  { label: 'Payments',        href: '/app/payments'        },
  { label: 'Cash-Up',         href: '/app/cashup'          },
  { label: 'Customers',       href: '/app/customers'       },
  { label: 'Stock',           href: '/app/stock'           },
  { label: 'Expenses',        href: '/app/expenses'        },
  { label: 'Products',        href: '/app/products'        },
  { label: 'Price Groups',    href: '/app/price-groups'    },
  { label: 'Reports',         href: '/app/reports'         },
  { label: 'Loans',           href: '/app/loans'           },
  { label: 'Photos',          href: '/app/photos'          },
  { label: 'Police Register', href: '/app/police-register' },
  { label: 'Stocktake',       href: '/app/stocktake'       },
  { label: 'Casual',          href: '/app/casual'          },
]

const DEFAULT_SHORTCUTS = [
  '/app/purchases/new',
  '/app/sales/new',
  '/app/payments',
  '/app/cashup',
]

const SHORTCUT_BG_COLORS = [
  colors.process,
  colors.action,
  colors.textSecondary,
  colors.warning,
]

type TodayStats = {
  date:         string
  sales:        { total: string; count: number }
  purchases:    { total: string; count: number }
  netFlow:      string
  cashUpStatus: 'open' | 'submitted' | 'approved' | null
  cashUpId:     string | null
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const userId    = session?.user?.id

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

  const savedShortcutsStr = JSON.stringify(savedShortcuts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(savedShortcuts) }, [savedShortcutsStr])

  async function saveShortcuts(newShortcuts: string[]) {
    if (!shortcutKey) return
    const res = await fetch('/api/settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [shortcutKey]: JSON.stringify(newShortcuts) }),
    })
    if (res.ok) {
      await swrMutate('/api/settings')
      toast.success('Shortcuts saved')
      setEditOpen(false)
    } else {
      toast.error('Failed to save shortcuts')
    }
  }

  const name      = session?.user?.name ?? session?.user?.username ?? 'there'
  const netFlow   = data ? new Decimal(data.netFlow) : null
  const netIsPos  = netFlow?.gte(0) ?? true

  return (
    <PageShell
      title="Dashboard"
      subtitle={`Welcome back, ${name} · ${new Date().toLocaleDateString('en-ZA', { dateStyle: 'full' })}`}
    >
      <div className="space-y-5 pb-4">

        {isLoading && (
          <p className="text-sm" style={{ color: colors.textSecondary }}>Loading today&apos;s stats…</p>
        )}

        {data && (
          <>
            {/* ── Stat cards (4 per spec) ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <StatCard
                label="Today's Purchases"
                value={`R ${new Decimal(data.purchases.total).toFixed(2)}`}
                icon={ShoppingCart}
                iconColor={colors.process}
                trend={data.purchases.count > 0 ? 'up' : 'neutral'}
                trendText={`${data.purchases.count} transaction${data.purchases.count !== 1 ? 's' : ''}`}
              />
              <StatCard
                label="Today's Sales"
                value={`R ${new Decimal(data.sales.total).toFixed(2)}`}
                icon={TrendingUp}
                iconColor={colors.action}
                trend={data.sales.count > 0 ? 'up' : 'neutral'}
                trendText={`${data.sales.count} transaction${data.sales.count !== 1 ? 's' : ''}`}
              />
              <StatCard
                label="Net Flow"
                value={`R ${netFlow?.toFixed(2) ?? '0.00'}`}
                sub="Sales minus purchases"
                icon={ArrowRightLeft}
                iconColor={netIsPos ? colors.action : colors.danger}
                trend={netIsPos ? 'up' : 'down'}
                trendText={netIsPos ? 'Positive' : 'Negative'}
              />
              <StatCard
                label="Cash-Up"
                value={
                  data.cashUpStatus === 'approved'  ? 'Approved' :
                  data.cashUpStatus === 'submitted' ? 'Awaiting' :
                  data.cashUpStatus === 'open'      ? 'Open' : 'Not Started'
                }
                sub={
                  data.cashUpStatus === 'approved'  ? 'Session closed' :
                  data.cashUpStatus === 'submitted' ? 'Pending sign-off' :
                  data.cashUpStatus === 'open'      ? 'In progress' : 'No session yet'
                }
                icon={DollarSign}
                iconColor={
                  data.cashUpStatus === 'approved'  ? colors.action :
                  data.cashUpStatus === 'submitted' ? colors.process : colors.textSecondary
                }
              />
            </div>

            {/* ── Status banners ── */}
            {isManager && data.cashUpStatus === 'submitted' && data.cashUpId && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
                style={{ background: colors.processBg, border: `1px solid ${colors.process}30`, color: colors.process }}
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>A cash-up is waiting for your approval.</span>
                <Link href="/app/cashup" className="ml-auto font-semibold hover:underline text-xs">Review →</Link>
              </div>
            )}
            {!data.cashUpStatus && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
                style={{ background: colors.warningBg, border: `1px solid ${colors.warning}30`, color: '#856404' }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>No cash-up session open for today.</span>
                <Link href="/app/cashup" className="ml-auto font-semibold hover:underline text-xs">Open session →</Link>
              </div>
            )}
            {data.cashUpStatus === 'approved' && (
              <div
                className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
                style={{ background: colors.actionBg, border: `1px solid ${colors.action}30`, color: colors.action }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Today&apos;s cash-up has been approved.</span>
              </div>
            )}
          </>
        )}

        {/* ── Quick Actions ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: colors.textSecondary }}
            >
              Quick Actions
            </h2>
            {userId && (
              <button
                onClick={() => { setDraft(savedShortcuts); setEditOpen(true) }}
                className="flex items-center gap-1 text-xs transition-colors"
                style={{ color: colors.textSecondary }}
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
                  className="text-white text-sm font-semibold rounded-lg px-4 py-3 text-center hover:opacity-90 transition-opacity"
                  style={{ background: SHORTCUT_BG_COLORS[i] ?? colors.textSecondary }}
                >
                  {page.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* ── Lower two-column ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Recent Activity</h3>
            </div>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {data ? `${data.purchases.count} purchases · ${data.sales.count} sales today` : 'Loading…'}
            </p>
            <Link
              href="/app/purchases"
              className="mt-2 inline-block text-xs font-medium hover:underline"
              style={{ color: colors.process }}
            >
              View all transactions →
            </Link>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: colors.border }}>
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4" style={{ color: colors.textSecondary }} />
              <h3 className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Stock Overview</h3>
            </div>
            <p className="text-xs" style={{ color: colors.textSecondary }}>Track on-hand stock levels in the Stock tab.</p>
            <Link
              href="/app/stock"
              className="mt-2 inline-block text-xs font-medium hover:underline"
              style={{ color: colors.process }}
            >
              Go to Stock →
            </Link>
          </div>
        </div>

        {isManager && (
          <Link
            href="/app/reports"
            className="text-sm font-medium hover:underline"
            style={{ color: colors.action }}
          >
            View detailed reports →
          </Link>
        )}

        {/* ── Customise dialog ── */}
        {editOpen && (
          <Dialog open onOpenChange={(o) => { if (!o) setEditOpen(false) }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Customise Quick Actions</DialogTitle></DialogHeader>
              <p className="text-sm" style={{ color: colors.textSecondary }}>Select up to 4 pages to show as shortcuts.</p>
              <div className="space-y-1 max-h-72 overflow-y-auto mt-2">
                {ALL_PAGES.map((page) => {
                  const isSelected = draft.includes(page.href)
                  const idx        = draft.indexOf(page.href)
                  return (
                    <label
                      key={page.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.neutralBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
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
                      <span className="text-sm" style={{ color: colors.textPrimary }}>{page.label}</span>
                      {isSelected && (
                        <span
                          className="ml-auto text-xs font-mono"
                          style={{ color: colors.textSecondary, fontSize: fontSize.xs }}
                        >
                          #{idx + 1}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
              <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{draft.length}/4 selected</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
                </Button>
                <Button style={{ background: colors.action }} className="hover:opacity-90 text-white" onClick={() => saveShortcuts(draft)}>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </PageShell>
  )
}
