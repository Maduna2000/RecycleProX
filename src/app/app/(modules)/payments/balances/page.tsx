'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { AlertCircle, TrendingDown, Loader2, HandCoins } from 'lucide-react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { DataTable, Avatar, type Column, type RowAction } from '@/components/ui/DataTable'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CustomerLookupWidget } from '@/components/CustomerLookupWidget'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type AccountBalance = {
  id: string
  firstName: string
  lastName: string
  idNumber: string
  phone: string
  totalPurchases: string
  totalPaid: string
  balance: string
}

type SelectedCustomer = {
  id: string
  firstName: string
  lastName: string
  idNumber: string | null
  phone: string
  blacklisted: boolean
  priceGroupId?: string | null
}

export default function AccountBalancesPage() {
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<AccountBalance | null>(null)

  const { data: balancesData, isLoading: balancesLoading } = useSWR<{ balances: AccountBalance[] }>(
    '/api/payments/balances',
    fetcher,
  )

  const balances = balancesData?.balances ?? []
  const outstandingCount = balances.filter((b) => new Decimal(b.balance).gt(0)).length
  const totalOutstanding = balances.reduce((sum, b) => sum.plus(new Decimal(b.balance).gt(0) ? new Decimal(b.balance) : new Decimal(0)), new Decimal(0))

  function revalidate() {
    mutate('/api/payments/balances')
  }

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
      onClick: (r) => {
        setSelectedCustomer(r)
        setNewPaymentOpen(true)
      },
    },
  ]

  return (
    <PageShell
      title="Account Balances"
      subtitle={outstandingCount > 0 ? `${outstandingCount} with outstanding balance · R ${totalOutstanding.toFixed(2)} total` : 'Customer account balances'}
    >
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

      {newPaymentOpen && (
        <NewPaymentModal
          preselectedCustomer={selectedCustomer}
          onClose={() => { setNewPaymentOpen(false); setSelectedCustomer(null) }}
          onSuccess={() => { revalidate(); setNewPaymentOpen(false); setSelectedCustomer(null) }}
        />
      )}
    </PageShell>
  )
}

// ─── New Payment Modal ────────────────────────────────────────────────────────
function NewPaymentModal({
  preselectedCustomer,
  onClose,
  onSuccess,
}: {
  preselectedCustomer: AccountBalance | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [customer, setCustomer] = useState<SelectedCustomer | null>(
    preselectedCustomer
      ? {
          id: preselectedCustomer.id,
          firstName: preselectedCustomer.firstName,
          lastName: preselectedCustomer.lastName,
          idNumber: preselectedCustomer.idNumber,
          phone: preselectedCustomer.phone,
          blacklisted: false,
        }
      : null
  )
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, amount, paymentMethod, notes: notes || undefined }),
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
                className="p-3 rounded flex items-center justify-between"
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
                <button
                  onClick={() => setCustomer(null)}
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
                  Change
                </button>
              </div>
            )}
          </div>

          {customer && hasOutstandingLoan && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded text-xs"
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
              onClick={onSubmit}
              disabled={loading || !customer}
              style={{
                fontSize: 10,
                padding: '1px 6px',
                background: '#E0E0E0',
                border: '1px solid #999',
                borderRadius: 2,
                cursor: (loading || !customer) ? 'not-allowed' : 'pointer',
                opacity: (loading || !customer) ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
              onMouseEnter={(e) => { if (!loading && customer) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading && customer) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {loading ? <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Record Payment'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
