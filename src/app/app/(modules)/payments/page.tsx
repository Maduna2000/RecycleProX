'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Search, Ban, Loader2, X } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from '@/lib/utils/format'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Payment = {
  id: string
  refNumber: string
  amount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null } | null
}

export default function PaymentsPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [search,         setSearch]         = useState('')
  const [paymentMethod,  setPaymentMethod]  = useState('')
  const [from,           setFrom]           = useState('')
  const [to,             setTo]             = useState('')
  const [includeVoided,  setIncludeVoided]  = useState(false)
  const [voidTarget,     setVoidTarget]     = useState<Payment | null>(null)

  const hasFilters = !!(search || paymentMethod || from || to)

  function clearFilters() {
    setSearch(''); setPaymentMethod(''); setFrom(''); setTo('')
  }

  const query = new URLSearchParams({
    ...(search        && { search }),
    ...(paymentMethod && { paymentMethod }),
    ...(from          && { from }),
    ...(to            && { to }),
    ...(includeVoided && { includeVoided: 'true' }),
    pageSize: '100',
  })

  const { data: paymentsData, isLoading: paymentsLoading } = useSWR<{ payments: Payment[]; total: number }>(
    `/api/payments?${query}`,
    fetcher,
  )

  const payments = paymentsData?.payments ?? []

  function revalidate() {
    mutate(`/api/payments?${query}`)
  }

  // ── Payment History columns ───────────────────────────────────────────────
  const paymentColumns: Column<Payment>[] = [
    {
      key: 'refNumber',
      header: 'Ref #',
      width: '140px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>{r.refNumber}</span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={r.customer ? `${r.customer.firstName} ${r.customer.lastName}` : '?'} size={26} />
          <div>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
              {r.customer ? `${r.customer.firstName} ${r.customer.lastName}` : 'Unknown'}
            </p>
            <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.customer?.idNumber ?? '-'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '110px',
      render: (r) => (
        <span className="font-mono font-semibold" style={{ color: colors.textPrimary }}>
          R {new Decimal(r.amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      width: '96px',
      render: (r) => (
        <span className="capitalize" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{r.paymentMethod}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '148px',
      render: (r) => <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{format.datetime(r.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      render: (r) => <StatusBadge status={r.voidedAt ? 'voided' : 'paid'} />,
    },
  ]

  const paymentActions: RowAction<Payment>[] = [
    {
      label:  'Void Payment',
      icon:   Ban,
      danger: true,
      hidden: (r) => !isManager || !!r.voidedAt,
      onClick: (r) => setVoidTarget(r),
    },
  ]

  return (
    <PageShell
      title="Payments"
      subtitle="Payment history"
    >
      <div className="flex gap-2 flex-wrap items-center shrink-0 mb-3">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
            style={{ color: colors.textSecondary }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref or customer..."
            className="pl-7 pr-3 h-7 text-xs rounded border bg-white focus:outline-none w-52 border-[#E0E0E0] focus:border-[#185ABD]"
          />
        </div>
        <select
          className="h-7 border rounded px-2 text-xs bg-white focus:outline-none border-[#E0E0E0] focus:border-[#185ABD]"
          style={{ color: colors.textPrimary }}
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
        >
          <option value="">All Methods</option>
          <option value="cash">Cash</option>
          <option value="eft">EFT</option>
          <option value="cheque">Cheque</option>
        </select>
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
        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer"
          style={{ color: colors.textSecondary }}
        >
          <input
            type="checkbox"
            checked={includeVoided}
            onChange={(e) => setIncludeVoided(e.target.checked)}
            className="rounded"
          />
          Include voided
        </label>
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: '#E0E0E0',
              border: '1px solid #999',
              borderRadius: 2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D0D0D0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#E0E0E0' }}
          >
            <X style={{ width: 9, height: 9 }} /> Clear
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <DataTable
          columns={paymentColumns}
          rows={payments}
          rowKey={(r) => r.id}
          rowActions={paymentActions}
          loading={paymentsLoading}
          emptyMessage="No payments found"
          total={paymentsData?.total}
          pageSize={100}
        />
      </div>

      {voidTarget && (
        <VoidPaymentModal
          payment={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => { revalidate(); setVoidTarget(null) }}
        />
      )}
    </PageShell>
  )
}

// ─── Void Payment Modal ───────────────────────────────────────────────────────
function VoidPaymentModal({ payment, onClose, onSuccess }: { payment: Payment; onClose: () => void; onSuccess: () => void }) {
  const [reason,  setReason]  = useState('')
  const [loading, setLoading] = useState(false)

  async function onConfirm() {
    if (reason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setLoading(true)
    const res = await fetch(`/api/payments/${payment.id}/void`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) { toast.success('Payment voided'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to void payment') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ color: colors.danger }}>Void Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Void{' '}
            <span className="font-semibold" style={{ color: colors.textPrimary }}>{payment.refNumber}</span>
            {' '}(R {new Decimal(payment.amount).toFixed(2)}) to{' '}
            <span className="font-semibold" style={{ color: colors.textPrimary }}>
              {payment.customer ? `${payment.customer.firstName} ${payment.customer.lastName}` : 'Unknown'}
            </span>? This cannot be undone.
          </p>
          <div>
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Min 5 characters"
              className="mt-1"
              disabled={loading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || reason.trim().length < 5}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: colors.danger,
                border: '1px solid #C82333',
                borderRadius: 2,
                color: '#fff',
                cursor: (loading || reason.trim().length < 5) ? 'not-allowed' : 'pointer',
                opacity: (loading || reason.trim().length < 5) ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              onMouseEnter={(e) => { if (!loading && reason.trim().length >= 5) e.currentTarget.style.background = '#A93226' }}
              onMouseLeave={(e) => { if (!loading && reason.trim().length >= 5) e.currentTarget.style.background = colors.danger }}
            >
              {loading ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Voiding…</> : 'Confirm Void'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
