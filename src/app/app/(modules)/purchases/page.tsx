'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as swrMutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Search, Ban, Printer, FileText, Loader2, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { DataTable, StatusBadge, Avatar, type Column, type RowAction, type SortDir } from '@/components/ui/DataTable'
import { InlineDetailPanel } from '@/components/ui/InlineDetailPanel'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from '@/lib/utils/format'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Purchase = {
  id: string
  refNumber: string
  status: 'completed' | 'voided' | 'pending'
  totalAmount: string
  paymentMethod: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null }
  lines: { id: string }[]
}

type PurchaseLine = {
  id: string
  quantity: string
  unitPrice: string
  lineTotal: string
  product: { id: string; code: string; name: string; unit: string }
}

type PurchaseDetail = {
  id: string
  refNumber: string
  status: string
  totalAmount: string
  loanDeductionAmount?: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  voidReason?: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string; phone: string }
  lines: PurchaseLine[]
}

export default function PurchasesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search,        setSearch]        = useState('')
  const [status,        setStatus]        = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [from,          setFrom]          = useState('')
  const [to,            setTo]            = useState('')
  const [page,          setPage]          = useState(1)
  const [sortKey,       setSortKey]       = useState<string | null>(null)
  const [sortDir,       setSortDir]       = useState<SortDir>(null)
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [voidTarget,    setVoidTarget]    = useState<Purchase | null>(null)

  const hasFilters = !!(search || status || paymentMethod || from || to)

  function clearFilters() {
    setSearch(''); setStatus(''); setPaymentMethod(''); setFrom(''); setTo(''); setPage(1)
  }

  const query = new URLSearchParams({
    ...(search        && { search }),
    ...(status        && { status }),
    ...(paymentMethod && { paymentMethod }),
    ...(from          && { from }),
    ...(to            && { to }),
    ...(sortKey && sortDir && { sortKey, sortDir }),
    page:     String(page),
    pageSize: '50',
  })

  const { data, isLoading, error } = useSWR<{ purchases: Purchase[]; total: number }>(
    `/api/purchases?${query}`,
    fetcher,
  )
  const purchases = data?.purchases ?? []

  const { data: detail, isLoading: detailLoading } = useSWR<PurchaseDetail>(
    selectedId ? `/api/purchases/${selectedId}` : null,
    fetcher,
  )

  const handleSort = useCallback((key: string, dir: SortDir) => {
    setSortKey(dir ? key : null)
    setSortDir(dir)
  }, [])

  const columns: Column<Purchase>[] = [
    {
      key: 'refNumber',
      header: 'Ref #',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{row.refNumber}</span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${row.customer.firstName} ${row.customer.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
              {row.customer.firstName} {row.customer.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: 10, color: colors.textSecondary }}>{row.customer.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'lines',
      header: 'Lines',
      width: '56px',
      render: (row) => <span style={{ color: colors.textSecondary }}>{row.lines.length}</span>,
    },
    {
      key: 'totalAmount',
      header: 'Total',
      width: '110px',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-semibold" style={{ color: colors.textPrimary }}>
          R {new Decimal(row.totalAmount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Payment',
      width: '96px',
      render: (row) => (
        <span className="capitalize" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{row.paymentMethod}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '148px',
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(row.createdAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ]

  const rowActions: RowAction<Purchase>[] = [
    {
      label:   'Print Slip',
      icon:    Printer,
      onClick: (row) => window.open(`/api/purchases/${row.id}/receipt?format=pdf`, '_blank'),
    },
    {
      label:   'Download VAT264',
      icon:    FileText,
      onClick: (row) => window.open(`/api/purchases/${row.id}/vat264`, '_blank'),
    },
    {
      label:   'Reverse Purchase',
      icon:    Ban,
      danger:  true,
      hidden:  (row) => !isManager || row.status === 'voided',
      onClick: (row) => setVoidTarget(row),
    },
  ]

  return (
    <PageShell
      title="Purchases"
      subtitle={`${data?.total ?? 0} total records`}
    >
      {/* Filters */}
      <div className="flex gap-2 flex-wrap shrink-0 mb-3 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search ref, customer or ID..."
            className="pl-7 pr-3 h-7 text-xs rounded border bg-white focus:outline-none w-56 border-[#E0E0E0] focus:border-[#185ABD]"
          />
        </div>
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: colors.textPrimary }}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </select>
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: colors.textPrimary }}
          value={paymentMethod}
          onChange={(e) => { setPaymentMethod(e.target.value); setPage(1) }}
        >
          <option value="">All Methods</option>
          <option value="cash">Cash</option>
          <option value="eft">EFT</option>
          <option value="cheque">Cheque</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => { setFrom(e.target.value); setPage(1) }}
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: from ? colors.textPrimary : colors.textSecondary }}
          title="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => { setTo(e.target.value); setPage(1) }}
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

      {/* Table — grows to fill available height */}
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={purchases}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id === selectedId ? null : r.id)}
          selectedKey={selectedId}
          rowActions={rowActions}
          loading={isLoading}
          error={error}
          emptyMessage="No purchases found"
          emptyAction={{ label: '+ New Purchase', onClick: () => router.push('/app/purchases/new') }}
          total={data?.total}
          page={page}
          pageSize={50}
          onPageChange={setPage}
          onSort={handleSort}
          sortKey={sortKey}
          sortDir={sortDir}
        />
      </div>

      {/* Inline detail panel — slides up from bottom */}
      <InlineDetailPanel
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={
          detail
            ? `${detail.refNumber} · ${detail.customer.firstName} ${detail.customer.lastName}`
            : 'Purchase Detail'
        }
        height={300}
      >
        {detailLoading || !detail ? (
          <div className="flex items-center gap-2" style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-3 h-full">

            {/* Voided banner */}
            {detail.status === 'voided' && (
              <div className="flex items-start gap-2 px-3 py-2 rounded shrink-0" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#DC2626' }} />
                <div>
                  <p style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: '#DC2626' }}>Reversed Purchase</p>
                  {detail.voidReason && (
                    <p style={{ fontSize: fontSize.xs, color: '#B91C1C' }}>{detail.voidReason}</p>
                  )}
                  {detail.voidedAt && (
                    <p style={{ fontSize: 10, color: '#B91C1C' }}>{format.datetime(detail.voidedAt)}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-6 flex-1 min-h-0">

            {/* Left: meta */}
            <div className="w-44 shrink-0 space-y-3">
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: colors.textSecondary }}>Customer</p>
                <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {detail.customer.firstName} {detail.customer.lastName}
                </p>
                <p className="font-mono" style={{ fontSize: 10, color: colors.textSecondary }}>{detail.customer.idNumber}</p>
                {detail.customer.phone && (
                  <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{detail.customer.phone}</p>
                )}
              </div>
              <div>
                <p className="uppercase tracking-wide font-semibold mb-0.5" style={{ fontSize: 10, color: colors.textSecondary }}>Payment</p>
                <p className="capitalize" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{detail.paymentMethod}</p>
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

            {/* Right: lines */}
            <div className="flex-1 overflow-auto">
              <table className="w-full" style={{ fontSize: fontSize.sm, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    {['Product', 'Qty', 'Unit Price', 'Line Total'].map((h) => (
                      <th
                        key={h}
                        className="text-left pb-1"
                        style={{ fontSize: 10, fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textSecondary }}
                      >
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
                  {detail.loanDeductionAmount && new Decimal(detail.loanDeductionAmount).greaterThan(0) ? (
                    <>
                      <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                        <td colSpan={3} className="text-right" style={{ padding: '5px 12px 0 0', fontSize: fontSize.xs, color: colors.textSecondary }}>Gross Payout</td>
                        <td className="font-mono" style={{ padding: '5px 0 0', fontSize: fontSize.xs, color: colors.textSecondary }}>R {new Decimal(detail.totalAmount).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="text-right" style={{ padding: '2px 12px 0 0', fontSize: fontSize.xs, color: colors.textSecondary }}>Loan Deduction</td>
                        <td className="font-mono" style={{ padding: '2px 0 0', fontSize: fontSize.xs, color: colors.textSecondary }}>- R {new Decimal(detail.loanDeductionAmount).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="text-right font-semibold" style={{ padding: '2px 12px 0 0', color: colors.textSecondary }}>Cash Paid Out</td>
                        <td className="font-mono font-bold" style={{ padding: '2px 0 0', fontSize: fontSize.base, color: colors.textPrimary }}>
                          R {new Decimal(detail.totalAmount).minus(new Decimal(detail.loanDeductionAmount)).toFixed(2)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td colSpan={3} className="text-right font-semibold" style={{ padding: '6px 12px 0 0', color: colors.textSecondary }}>Total Payout</td>
                      <td className="font-mono font-bold" style={{ padding: '6px 0 0', fontSize: fontSize.base, color: colors.textPrimary }}>
                        R {new Decimal(detail.totalAmount).toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
            </div>
          </div>
        )}
      </InlineDetailPanel>

      {/* Void dialog */}
      {voidTarget && (
        <VoidDialog
          purchase={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => {
            swrMutate(`/api/purchases?${query}`)
            if (selectedId === voidTarget.id) setSelectedId(null)
            setVoidTarget(null)
          }}
        />
      )}
    </PageShell>
  )
}

// ─── Void Dialog ──────────────────────────────────────────────────────────────

function VoidDialog({
  purchase,
  onClose,
  onSuccess,
}: {
  purchase: Purchase
  onClose:  () => void
  onSuccess: () => void
}) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/void`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Purchase voided')
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to void purchase')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Reverse Purchase" onClose={onClose} />
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            You are about to void{' '}
            <span className="font-semibold" style={{ color: colors.textPrimary }}>{purchase.refNumber}</span>
            {' '}(R {new Decimal(purchase.totalAmount).toFixed(2)}). This cannot be undone.
          </p>
          <div>
            <Label>Reason for void</Label>
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
              Confirm Void
            </ModalBtn>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
