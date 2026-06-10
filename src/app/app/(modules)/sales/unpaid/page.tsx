'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useRouter } from 'next/navigation'
import { Search, Printer, Ban, CreditCard, Loader2, X } from 'lucide-react'
import Decimal from 'decimal.js'
import { DataTable, Avatar, type Column, type RowAction } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageShell } from '@/components/layout/PageShell'
import { ProcessPaymentModal, type PayTarget } from '@/components/sales/ProcessPaymentModal'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { format } from '@/lib/utils/format'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Sale = {
  id: string
  refNumber: string
  totalAmount: string
  amountPaid?: string
  buyerName: string
  buyerIdNumber?: string
  customerId?: string
  createdAt: string
  lines: { id: string }[]
}

type SaleLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  product: { id: string; code: string; name: string; unit: string }
}

type SaleDetail = {
  id: string
  refNumber: string
  totalAmount: string
  amountPaid?: string
  buyerName: string
  buyerIdNumber?: string
  notes?: string
  createdAt: string
  lines: SaleLine[]
}

function outstanding(s: { totalAmount: string; amountPaid?: string }): Decimal {
  return new Decimal(s.totalAmount).minus(new Decimal(s.amountPaid ?? '0'))
}

export default function UnpaidSalesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search,     setSearch]     = useState('')
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [payTarget,  setPayTarget]  = useState<PayTarget | null>(null)
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null)

  const hasFilters = !!(search || from || to)
  function clearFilters() { setSearch(''); setFrom(''); setTo('') }

  const query = new URLSearchParams({ status: 'pending', pageSize: '200' })
  if (search) query.set('search', search)
  if (from)   query.set('from',   from)
  if (to)     query.set('to',     to)

  const KEY = `/api/sales?${query}`
  const { data, isLoading } = useSWR<{ sales: Sale[] }>(KEY, fetcher)
  const sales = data?.sales ?? []

  const { data: detail, isLoading: detailLoading } = useSWR<SaleDetail>(
    selectedId ? `/api/sales/${selectedId}` : null,
    fetcher,
  )

  const grandTotal = sales.reduce((acc, s) => acc.plus(outstanding(s)), new Decimal(0))
  const subtitle   = !isLoading
    ? `${sales.length} unpaid sale${sales.length !== 1 ? 's' : ''}`
    : 'Deferred payment sales'

  const columns: Column<Sale>[] = [
    {
      key:    'refNumber',
      header: 'Ref #',
      width:  '140px',
      render: (row) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{row.refNumber}</span>
      ),
    },
    {
      key:    'buyerName',
      header: 'Buyer',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={row.buyerName} size={26} />
          <div>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
              {row.buyerName}
            </p>
            {row.buyerIdNumber && (
              <p className="font-mono" style={{ fontSize: 10, color: colors.textSecondary }}>{row.buyerIdNumber}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key:    'lines',
      header: 'Items',
      width:  '60px',
      render: (row) => <span style={{ color: colors.textSecondary }}>{row.lines.length}</span>,
    },
    {
      key:    'totalAmount',
      header: 'Total',
      width:  '110px',
      render: (row) => (
        <span className="font-mono font-semibold" style={{ color: colors.textPrimary }}>
          R {new Decimal(row.totalAmount).toFixed(2)}
        </span>
      ),
    },
    {
      key:    'amountPaid',
      header: 'Paid',
      width:  '110px',
      render: (row) => {
        const paid = new Decimal(row.amountPaid ?? '0')
        return (
          <span className="font-mono" style={{ color: paid.gt(0) ? colors.action : colors.textSecondary }}>
            {paid.gt(0) ? `R ${paid.toFixed(2)}` : '—'}
          </span>
        )
      },
    },
    {
      key:    'balance',
      header: 'Balance',
      width:  '110px',
      render: (row) => (
        <span className="font-mono font-semibold" style={{ color: colors.warning }}>
          R {outstanding(row).toFixed(2)}
        </span>
      ),
    },
    {
      key:    'createdAt',
      header: 'Date',
      width:  '148px',
      render: (row) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(row.createdAt)}</span>
      ),
    },
  ]

  const rowActions: RowAction<Sale>[] = [
    {
      label:   'Process Payment',
      icon:    CreditCard,
      onClick: (row) => setPayTarget({
        id:          row.id,
        ref:         row.refNumber,
        totalAmount: row.totalAmount,
        amountPaid:  row.amountPaid ?? '0',
      }),
    },
    {
      label:   'Print Receipt',
      icon:    Printer,
      onClick: (row) => window.open(`/api/sales/${row.id}/receipt?format=pdf`, '_blank'),
    },
    {
      label:   'Reverse Sale',
      icon:    Ban,
      danger:  true,
      hidden:  () => !isManager,
      onClick: (row) => setVoidTarget(row),
    },
  ]

  return (
    <PageShell title="Unpaid Sales" subtitle={subtitle}>

      {/* Grand total banner */}
      {!isLoading && sales.length > 0 && (
        <div
          className="flex items-center gap-4 px-4 py-3 shrink-0"
          style={{ background: colors.alertBg, border: `1px solid ${colors.alertBorder}` }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.alertIcon }}>
              Total Outstanding
            </p>
            <p className="font-mono font-bold" style={{ fontSize: fontSize['2xl'], color: colors.alertText }}>
              R {grandTotal.toFixed(2)}
            </p>
          </div>
          <p className="ml-4 text-xs" style={{ color: colors.alertIcon }}>
            {sales.length} unpaid sale{sales.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap shrink-0 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, buyer or ID..."
            className="pl-7 pr-3 h-7 text-xs rounded border bg-white focus:outline-none w-56 border-[#E0E0E0] focus:border-[#185ABD]"
          />
        </div>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: from ? colors.textPrimary : colors.textSecondary }}
          title="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: to ? colors.textPrimary : colors.textSecondary }}
          title="To date"
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="h-7 px-2.5 text-xs flex items-center gap-1 border rounded hover:bg-[#F1F3F4] transition-colors"
            style={{ borderColor: colors.border, color: colors.textSecondary }}
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={sales}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          selectedKey={selectedId}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage="No unpaid sales — all sales are settled."
          emptyAction={{ label: '+ New Sale', onClick: () => router.push('/app/sales/new') }}
        />
      </div>

      {/* Inline detail panel */}
      <InlineDetailPanel
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={
          detail
            ? `${detail.refNumber} · ${detail.buyerName}`
            : 'Sale Detail'
        }
        height={300}
      >
        {detailLoading || !detail ? (
          <div className="flex items-center gap-2" style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex gap-6 h-full">
            <div className="w-44 shrink-0 space-y-3">
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: colors.textSecondary }}>Buyer</p>
                <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {detail.buyerName}
                </p>
                {detail.buyerIdNumber && (
                  <p className="font-mono" style={{ fontSize: 10, color: colors.textSecondary }}>{detail.buyerIdNumber}</p>
                )}
              </div>
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: colors.textSecondary }}>Balance Due</p>
                <p className="font-mono font-bold" style={{ fontSize: fontSize.base, color: colors.warning }}>
                  R {outstanding(detail).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: colors.textSecondary }}>Date</p>
                <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(detail.createdAt)}</p>
              </div>
              {detail.notes && (
                <div>
                  <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: colors.textSecondary }}>Notes</p>
                  <p style={{ fontSize: fontSize.xs, color: colors.textPrimary }}>{detail.notes}</p>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full" style={{ fontSize: fontSize.sm, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    {['Product', 'Qty', 'Unit Price', 'Line Total'].map((h) => (
                      <th key={h} className="text-left pb-1" style={{ fontSize: 10, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textSecondary }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: `1px solid ${colors.bg}` }}>
                      <td style={{ padding: '4px 0' }}>
                        <p style={{ fontWeight: fontWeight.medium, color: colors.textPrimary }}>{line.product.name}</p>
                        <p className="font-mono" style={{ fontSize: 10, color: colors.textSecondary }}>{line.product.code}</p>
                      </td>
                      <td className="font-mono" style={{ padding: '4px 12px 4px 0', color: colors.textSecondary }}>
                        {new Decimal(line.quantity).toFixed(2)} {line.product.unit}
                      </td>
                      <td className="font-mono" style={{ padding: '4px 12px 4px 0', color: colors.textSecondary }}>
                        R {new Decimal(line.unitPrice).toFixed(2)}
                      </td>
                      <td className="font-mono font-semibold" style={{ padding: '4px 0', color: colors.textPrimary }}>
                        R {new Decimal(line.lineTotal).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                    <td colSpan={3} className="text-right font-semibold" style={{ padding: '6px 12px 0 0', color: colors.textSecondary }}>Total</td>
                    <td className="font-mono font-bold" style={{ padding: '6px 0 0', fontSize: fontSize.base, color: colors.textPrimary }}>
                      R {new Decimal(detail.totalAmount).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </InlineDetailPanel>

      {payTarget && (
        <ProcessPaymentModal
          sale={payTarget}
          onClose={() => setPayTarget(null)}
          onSuccess={() => { mutate(KEY); setPayTarget(null) }}
        />
      )}

      {voidTarget && (
        <VoidDialog
          sale={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => { mutate(KEY); setVoidTarget(null); setSelectedId(null) }}
        />
      )}

    </PageShell>
  )
}

// ─── Void Dialog ──────────────────────────────────────────────────────────────

function VoidDialog({
  sale,
  onClose,
  onSuccess,
}: {
  sale:      Sale
  onClose:   () => void
  onSuccess: () => void
}) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/sales/${sale.id}/void`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Sale reversed'); onSuccess() }
    else { const j = await res.json() as { error?: string }; toast.error(j.error ?? 'Failed to reverse sale') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Reverse Sale" onClose={onClose} />
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            You are about to reverse{' '}
            <span className="font-semibold" style={{ color: colors.textPrimary }}>{sale.refNumber}</span>
            {' '}(R {new Decimal(sale.totalAmount).toFixed(2)}). This cannot be undone.
          </p>
          <div>
            <Label>Reason for reversal</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason (min 5 characters)"
              className="mt-1"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <ModalBtn onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn variant="danger" onClick={onConfirm} disabled={loading || reason.trim().length < 5} loading={loading}>
              Confirm Reversal
            </ModalBtn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
