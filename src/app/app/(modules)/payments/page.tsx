'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Search, Ban, Loader2, TrendingDown, AlertCircle, HandCoins, X } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { DataTable, Avatar, StatusBadge, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from '@/lib/utils/format'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'
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
  customer: { id: string; firstName: string; lastName: string; idNumber: string | null }
}

type AccountBalance = {
  id: string; firstName: string; lastName: string; idNumber: string; phone: string
  totalPurchases: string; totalPaid: string; balance: string
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string | null
  phone: string; blacklisted: boolean; priceGroupId?: string | null
}

type PageTab = 'payments' | 'balances'

export default function PaymentsPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [activeTab,      setActiveTab]      = useState<PageTab>('payments')
  const [search,         setSearch]         = useState('')
  const [paymentMethod,  setPaymentMethod]  = useState('')
  const [from,           setFrom]           = useState('')
  const [to,             setTo]             = useState('')
  const [includeVoided,  setIncludeVoided]  = useState(false)
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
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
  const { data: balancesData, isLoading: balancesLoading } = useSWR<{ balances: AccountBalance[] }>(
    '/api/payments/balances',
    fetcher,
  )

  const payments = paymentsData?.payments ?? []
  const balances = balancesData?.balances ?? []
  const outstandingCount = balances.filter((b) => new Decimal(b.balance).gt(0)).length

  function revalidate() {
    mutate(`/api/payments?${query}`)
    mutate('/api/payments/balances')
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
          <Avatar name={`${r.customer.firstName} ${r.customer.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
              {r.customer.firstName} {r.customer.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.customer.idNumber}</p>
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

  // ── Account Balances columns ──────────────────────────────────────────────
  const balanceColumns: Column<AccountBalance>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${r.firstName} ${r.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
              {r.firstName} {r.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>{r.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'totalPurchases',
      header: 'Total Purchases',
      width: '140px',
      render: (r) => (
        <span className="font-mono" style={{ color: colors.textSecondary }}>
          R {new Decimal(r.totalPurchases).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'totalPaid',
      header: 'Total Paid',
      width: '120px',
      render: (r) => (
        <span className="font-mono" style={{ color: colors.action }}>
          R {new Decimal(r.totalPaid).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Outstanding',
      width: '140px',
      render: (r) => {
        const outstanding = new Decimal(r.balance)
        const isPos = outstanding.gt(0)
        return (
          <div className="flex items-center gap-1.5">
            {isPos && <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: colors.warning }} />}
            <span className="font-mono font-semibold" style={{ color: isPos ? colors.warning : colors.textSecondary }}>
              R {outstanding.toFixed(2)}
            </span>
          </div>
        )
      },
    },
  ]

  const balanceActions: RowAction<AccountBalance>[] = [
    {
      label:  'Pay Out',
      icon:   TrendingDown,
      hidden: (r) => !new Decimal(r.balance).gt(0),
      onClick: () => setNewPaymentOpen(true),
    },
  ]

  const pageTabs = [
    { value: 'payments', label: 'Payment History' },
    {
      value: 'balances',
      label: 'Account Balances',
      count: outstandingCount > 0 ? outstandingCount : undefined,
    },
  ]

  return (
    <PageShell
      title="Payments"
      subtitle="Customer payouts"
      tabs={pageTabs}
      activeTab={activeTab}
      onTabChange={(v) => setActiveTab(v as PageTab)}
    >
      {/* Payments tab */}
      {activeTab === 'payments' && (
        <>
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
                className="pl-7 pr-3 py-1 text-xs rounded border bg-white focus:outline-none w-52 border-rpx-border focus:border-rpx-blue"
              />
            </div>
            <select
              className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
              style={{ color: colors.textPrimary }}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">All Methods</option>
              <option value="cash">Cash</option>
              <option value="eft">EFT</option>
              <option value="cheque">Cheque</option>
              <option value="amplopay">AmploPay</option>
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
              style={{ color: from ? colors.textPrimary : colors.textSecondary }}
              title="From date"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded px-2 py-1 text-xs bg-white focus:outline-none border-rpx-border focus:border-rpx-blue"
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
                className="flex items-center gap-1 text-xs hover:text-[#212529] transition-colors"
                style={{ color: colors.textSecondary }}
              >
                <X className="w-3 h-3" /> Clear
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
        </>
      )}

      {/* Balances tab */}
      {activeTab === 'balances' && (
        <div className="flex-1 min-h-0">
          <DataTable
            columns={balanceColumns}
            rows={balances}
            rowKey={(r) => r.id}
            rowActions={balanceActions}
            loading={balancesLoading}
            emptyMessage="No customer balances found"
          />
        </div>
      )}

      {newPaymentOpen && (
        <NewPaymentModal
          onClose={() => setNewPaymentOpen(false)}
          onSuccess={() => { revalidate(); setNewPaymentOpen(false) }}
        />
      )}
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

// ─── New Payment Modal ────────────────────────────────────────────────────────
function NewPaymentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [customer,      setCustomer]      = useState<SelectedCustomer | null>(null)
  const [amount,        setAmount]        = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque' | 'amplopay'>('cash')
  const [notes,         setNotes]         = useState('')
  const [loading,       setLoading]       = useState(false)

  const { data: balanceData } = useSWR(
    customer ? `/api/customers/${customer.id}/balance` : null,
    fetcher,
  )
  const { data: loanData } = useSWR<{ summary: { outstanding: string; hasOutstanding: boolean } }>(
    customer ? `/api/customers/${customer.id}/loans?pageSize=1` : null,
    fetcher,
  )
  const hasOutstandingLoan = loanData?.summary?.hasOutstanding ?? false
  const outstandingLoanAmt = loanData?.summary?.outstanding ?? '0'

  async function onSubmit() {
    if (!customer) { toast.error('Select a customer'); return }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return }
    setLoading(true)
    const res = await fetch('/api/payments', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ customerId: customer.id, amount, paymentMethod, notes: notes || undefined }),
    })
    setLoading(false)
    if (res.ok) {
      const data = await res.json()
      toast.success(`Payment ${data.refNumber} recorded`)
      onSuccess()
    } else {
      const j = await res.json()
      toast.error(j.error ?? 'Failed to record payment')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="mb-2 block">Customer</Label>
            {!customer ? (
              <CustomerLookupWidget onSelect={(c) => setCustomer(c)} />
            ) : (
              <div
                className="p-3 rounded-lg flex items-center justify-between"
                style={{ background: colors.actionBg, border: `1px solid ${colors.action}30` }}
              >
                <div>
                  <p className="font-semibold text-sm" style={{ color: colors.textPrimary }}>
                    {customer.firstName} {customer.lastName}
                  </p>
                  <p className="font-mono text-xs" style={{ color: colors.textSecondary }}>{customer.idNumber}</p>
                  {balanceData && (
                    <p className="text-xs mt-0.5">
                      Outstanding:{' '}
                      <span
                        className="font-semibold"
                        style={{ color: parseFloat(balanceData.balance) > 0 ? colors.warning : colors.textSecondary }}
                      >
                        R {Number(balanceData.balance).toFixed(2)}
                      </span>
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setCustomer(null)}>Change</Button>
              </div>
            )}
          </div>

          {customer && hasOutstandingLoan && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{ background: colors.warningBg, border: `1px solid ${colors.warning}30`, color: '#856404' }}
            >
              <HandCoins className="w-4 h-4 shrink-0" />
              <span>Outstanding loan: <strong>R {new Decimal(outstandingLoanAmt).toFixed(2)}</strong></span>
              <a href="/app/loans" className="ml-auto font-semibold hover:underline shrink-0">View →</a>
            </div>
          )}

          <div>
            <Label>Amount (R)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 font-mono"
              disabled={loading}
            />
            {balanceData && parseFloat(balanceData.balance) > 0 && (
              <button
                type="button"
                className="text-xs hover:underline mt-1"
                style={{ color: colors.action }}
                onClick={() => setAmount(Number(balanceData.balance).toFixed(2))}
              >
                Use full balance (R {Number(balanceData.balance).toFixed(2)})
              </button>
            )}
          </div>

          <div>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="amplopay">AmploPay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>
              Notes{' '}
              <span className="font-normal" style={{ color: colors.textSecondary }}>(optional)</span>
            </Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" disabled={loading} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button
              style={{ background: colors.action }}
              className="hover:opacity-90"
              onClick={onSubmit}
              disabled={loading || !customer}
            >
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Record Payment'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
              {payment.customer.firstName} {payment.customer.lastName}
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
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={loading || reason.trim().length < 5}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Voiding…</> : 'Confirm Void'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
