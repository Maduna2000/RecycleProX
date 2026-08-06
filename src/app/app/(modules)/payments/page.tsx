'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Search, Ban, X } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { format } from '@/lib/utils/format'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { fetcher } from '@/lib/swrFetcher'
import {
  inp, Btn, Field, PortalPage, FilterBar,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'


type Payment = {
  id: string
  refNumber: string
  amount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  createdAt: string
  source: 'sale' | 'purchase'
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null } | null
  sale: { refNumber: string } | null
  purchase: { refNumber: string } | null
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

  // Sales payments only — purchase-direction settlements are handled from
  // the Purchases module (edit transaction / process payment) instead.
  const query = new URLSearchParams({
    source: 'sale',
    ...(search        && { search }),
    ...(paymentMethod && { paymentMethod }),
    ...(from          && { from }),
    ...(to            && { to }),
    ...(includeVoided && { includeVoided: 'true' }),
    pageSize: '100',
  })

  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useSWR<{
    payments: Payment[]; total: number; totalReceived: string; totalPaidOut: string
  }>(
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
      key: 'reference',
      header: 'Reference',
      width: '120px',
      render: (r) => (
        <span className="font-mono text-xs" style={{ color: colors.textSecondary }}>
          {r.sale?.refNumber ?? r.purchase?.refNumber ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '110px',
      align: 'right',
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
    <PortalPage title="Sales Payments">
      <FilterBar>
        <Field label="Search" width={200}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: colors.textSecondary }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref or customer..."
              style={{ ...inp, paddingLeft: 24 }}
            />
          </div>
        </Field>
        <Field label="Method" width={130}>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={inp}>
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="eft">EFT</option>
          </select>
        </Field>
        <Field label="From" width={145}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} title="From date" />
        </Field>
        <Field label="To" width={145}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} title="To date" />
        </Field>
        <label
          className="flex items-center gap-1.5 cursor-pointer"
          style={{ fontSize: 11, color: colors.textSecondary, paddingBottom: 8 }}
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
          <Btn size="sm" icon={X} onClick={clearFilters}>Clear</Btn>
        )}
      </FilterBar>
      <div className="flex items-center gap-3" style={{ padding: '0 10px' }}>
        <div
          className="flex-1 rounded-lg px-3 py-2"
          style={{ background: colors.actionBg, border: `1px solid ${colors.border}` }}
        >
          <p style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Total Received</p>
          <p className="font-mono font-semibold" style={{ fontSize: fontSize.md, color: colors.action }}>
            R {new Decimal(paymentsData?.totalReceived ?? '0').toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0" style={{ padding: 10 }}>
        <DataTable
          columns={paymentColumns}
          rows={payments}
          rowKey={(r) => r.id}
          rowActions={paymentActions}
          loading={paymentsLoading}
          error={paymentsError instanceof Error ? paymentsError.message : !!paymentsError}
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
    </PortalPage>
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
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Void Payment" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
            Void{' '}
            <span className="font-semibold" style={{ color: colors.textPrimary }}>{payment.refNumber}</span>
            {' '}(R {new Decimal(payment.amount).toFixed(2)}) to{' '}
            <span className="font-semibold" style={{ color: colors.textPrimary }}>
              {payment.customer ? `${payment.customer.firstName} ${payment.customer.lastName}` : 'Unknown'}
            </span>? This cannot be undone.
          </p>
          <Field label="Reason">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Min 5 characters"
              disabled={loading}
            />
          </Field>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn
            variant="danger"
            onClick={onConfirm}
            disabled={loading || reason.trim().length < 5}
            loading={loading}
          >
            Confirm Void
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
