'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useSession } from 'next-auth/react'
import { Plus, Search, Ban, Loader2, TrendingDown, AlertCircle, HandCoins } from 'lucide-react'
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

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Payment = {
  id: string
  refNumber: string
  amount: string
  paymentMethod: string
  notes?: string
  voidedAt?: string
  createdAt: string
  customer: { id: string; firstName: string; lastName: string; idNumber: string }
}

type AccountBalance = {
  id: string; firstName: string; lastName: string; idNumber: string; phone: string
  totalPurchases: string; totalPaid: string; balance: string
}

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; blacklisted: boolean; priceGroupId?: string | null
}

type PageTab = 'payments' | 'balances'

export default function PaymentsPage() {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const [activeTab,      setActiveTab]      = useState<PageTab>('payments')
  const [search,         setSearch]         = useState('')
  const [includeVoided,  setIncludeVoided]  = useState(false)
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
  const [voidTarget,     setVoidTarget]     = useState<Payment | null>(null)

  const query = new URLSearchParams({
    ...(search        && { search }),
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
      render: (r) => <span className="font-mono text-xs" style={{ color: '#6C757D' }}>{r.refNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${r.customer.firstName} ${r.customer.lastName}`} size={26} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>
              {r.customer.firstName} {r.customer.lastName}
            </p>
            <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.customer.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '110px',
      render: (r) => (
        <span className="font-mono font-semibold" style={{ color: '#212529' }}>
          R {new Decimal(r.amount).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      width: '96px',
      render: (r) => <span className="capitalize" style={{ fontSize: 12, color: '#6C757D' }}>{r.paymentMethod}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      width: '148px',
      render: (r) => <span style={{ fontSize: 11, color: '#6C757D' }}>{format.datetime(r.createdAt)}</span>,
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
            <p style={{ fontSize: 12, fontWeight: 500, color: '#212529' }}>{r.firstName} {r.lastName}</p>
            <p className="font-mono" style={{ fontSize: 10, color: '#6C757D' }}>{r.idNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'totalPurchases',
      header: 'Total Purchases',
      width: '140px',
      render: (r) => (
        <span className="font-mono" style={{ color: '#6C757D' }}>
          R {new Decimal(r.totalPurchases).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'totalPaid',
      header: 'Total Paid',
      width: '120px',
      render: (r) => (
        <span className="font-mono" style={{ color: '#217346' }}>
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
            {isPos && <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#C9A020' }} />}
            <span className="font-mono font-semibold" style={{ color: isPos ? '#C9A020' : '#6C757D' }}>
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

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Payments</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>Customer payouts</p>
      </div>

      {/* Page-level tab bar + actions */}
      <div className="flex items-center justify-between shrink-0 border-b border-[#E0E0E0]">
        <div className="flex items-center gap-0">
          <button
            onClick={() => setActiveTab('payments')}
            className="px-4 py-2 text-xs font-medium border-b-2 transition-colors"
            style={{
              borderColor: activeTab === 'payments' ? '#185ABD' : 'transparent',
              color:       activeTab === 'payments' ? '#185ABD' : '#6C757D',
            }}
          >
            Payment History
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className="px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5"
            style={{
              borderColor: activeTab === 'balances' ? '#185ABD' : 'transparent',
              color:       activeTab === 'balances' ? '#185ABD' : '#6C757D',
            }}
          >
            Account Balances
            {outstandingCount > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-white font-bold" style={{ fontSize: 10, background: '#C0392B', lineHeight: 1.2 }}>
                {outstandingCount}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={() => setNewPaymentOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-white mb-1"
          style={{ background: '#217346' }}
        >
          <Plus className="w-3.5 h-3.5" /> Record Payment
        </button>
      </div>

      {/* Payments tab */}
      {activeTab === 'payments' && (
        <>
          <div className="flex gap-2 items-center shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#6C757D' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ref or customer..."
                className="pl-7 pr-3 py-1 text-xs rounded border border-[#E0E0E0] bg-white focus:outline-none focus:border-[#185ABD] w-64"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: '#6C757D' }}>
              <input
                type="checkbox"
                checked={includeVoided}
                onChange={(e) => setIncludeVoided(e.target.checked)}
                className="rounded"
              />
              Include voided
            </label>
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
    </div>
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
              <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: '#F0FBF4', border: '1px solid #21734630' }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#212529' }}>{customer.firstName} {customer.lastName}</p>
                  <p className="font-mono text-xs" style={{ color: '#6C757D' }}>{customer.idNumber}</p>
                  {balanceData && (
                    <p className="text-xs mt-0.5">
                      Outstanding:{' '}
                      <span className="font-semibold" style={{ color: parseFloat(balanceData.balance) > 0 ? '#C9A020' : '#6C757D' }}>
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: '#FFF8E1', border: '1px solid #C9A02030', color: '#856404' }}>
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
                style={{ color: '#217346' }}
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
            <Label>Notes <span className="font-normal" style={{ color: '#6C757D' }}>(optional)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" disabled={loading} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button style={{ background: '#217346' }} className="hover:opacity-90" onClick={onSubmit} disabled={loading || !customer}>
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
          <DialogTitle style={{ color: '#C0392B' }}>Void Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: '#6C757D' }}>
            Void <span className="font-semibold" style={{ color: '#212529' }}>{payment.refNumber}</span>{' '}
            (R {new Decimal(payment.amount).toFixed(2)}) to{' '}
            <span className="font-semibold" style={{ color: '#212529' }}>
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
