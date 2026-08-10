'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Loader2, Lock, HandCoins, Coins, CreditCard, Split, Plus, Minus, Trash2, Printer } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'
import { HEADER_GRAD, lbl, Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { fetcher } from '@/lib/swrFetcher'


// This tab is the mirror image of the "Loans" tab: Loans is money the
// business advances TO this customer (a receivable — the customer owes us).
// This tab is money the customer/dealer advanced TO the business (a
// liability — we owe them). Same ledger-per-Fin-Period UI pattern as Loans
// (SHdr, toolbar, chronological DataTable, Amount Due footer), but
// deliberately styled and worded around "owe"/"borrowed" rather than
// reusing Loans' "advance"/"outstanding" language, and uses violet (a
// liability/debt color) instead of Loans' green, so the two tabs are never
// mistaken for each other at a glance.

type BusinessLoan = {
  id: string
  refNumber: string
  principalAmount: string
  balanceAmount: string
  paymentMethod: string
  notes?: string
  status: 'active' | 'settled' | 'voided'
  voidedAt?: string
  voidReason?: string
  createdAt: string
  _count?: { repayments: number }
}

type BusinessLoanSummaryResponse = {
  hasOutstanding: boolean
  totalAdvanced?: string
  totalRepaid?: string
  outstanding?: string
  loans?: BusinessLoan[]
}

type LedgerRow = {
  id:          string
  date:        string
  description: string
  transaction: string
  advance:     string | null
  repayment:   string | null
  balance:     string
}

type LastEntry = {
  kind:        'loan' | 'repayment'
  id:          string
  description: string
  amount:      string
  date:        string
} | null

type StatementResponse = {
  period:         string
  openingBalance: string
  closingBalance: string
  rows:           LedgerRow[]
  lastEntry:      LastEntry
}

interface BusinessLoanTabProps {
  customerId: string
  customerName: string
  userRole: string
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT' },
]

function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <HandCoins style={{ width: 12, height: 12, color: colors.violet }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.violet }}>{title}</span>
      </div>
    </div>
  )
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Positive = the business owes this dealer money (mirror of Loans' negative-
// for-customer-owes-us convention — see businessLoanService.ts's comment).
const moneyColor = (v: string) => (new Decimal(v).gt(0) ? colors.violet : colors.action)

const ledgerColumns: Column<LedgerRow>[] = [
  {
    key: 'description',
    header: 'Description',
    render: (row) => <span style={{ fontWeight: row.id === 'opening' ? 600 : 400 }}>{row.description}</span>,
  },
  {
    key: 'date',
    header: 'Date',
    width: '110px',
    render: (row) => (
      <span style={{ color: '#6C757D' }}>
        {new Date(row.date).toLocaleDateString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit' })}
      </span>
    ),
  },
  {
    key: 'transaction',
    header: 'Transaction',
    width: '120px',
    render: (row) => <span style={{ color: '#6C757D' }}>{row.transaction}</span>,
  },
  {
    key: 'advance',
    header: 'Borrowed',
    width: '110px',
    align: 'right',
    render: (row) => <span style={{ fontFamily: 'monospace' }}>{format.currency(row.advance ?? '0')}</span>,
  },
  {
    key: 'repayment',
    header: 'Repayment',
    width: '110px',
    align: 'right',
    render: (row) => <span style={{ fontFamily: 'monospace' }}>{format.currency(row.repayment ?? '0')}</span>,
  },
  {
    key: 'balance',
    header: 'Balance',
    width: '120px',
    align: 'right',
    render: (row) => (
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: moneyColor(row.balance) }}>
        {format.currency(row.balance)}
      </span>
    ),
  },
]

// ─── BusinessLoanTab ────────────────────────────────────────────────────────

export function BusinessLoanTab({ customerId, customerName, userRole }: BusinessLoanTabProps) {
  const [period,           setPeriod]           = useState(currentPeriod())
  const [createOpen,       setCreateOpen]       = useState(false)
  const [repayOpen,        setRepayOpen]        = useState(false)
  const [deleteLastOpen,   setDeleteLastOpen]   = useState(false)
  const [voidTarget,       setVoidTarget]       = useState<BusinessLoan | null>(null)

  const isAdmin = userRole === 'admin'

  const statementKey = `/api/customers/${customerId}/business-loans/statement?period=${period}`
  const { data, isLoading, error } = useSWR<StatementResponse>(isAdmin ? statementKey : null, fetcher)

  // Only needed to target "Add Repayment" at a specific loan and to expose
  // "Void" on a mistaken zero-repayment entry — the ledger above only has
  // per-day rows, not the underlying loan objects.
  const summaryKey = `/api/customers/${customerId}/business-loans`
  const { data: summary } = useSWR<BusinessLoanSummaryResponse>(isAdmin ? summaryKey : null, fetcher)
  const activeLoans = (summary?.loans ?? []).filter((l) => l.status === 'active')

  function revalidate() {
    mutate(statementKey)
    mutate(summaryKey)
  }

  const closingBalance = data ? new Decimal(data.closingBalance) : new Decimal(0)

  if (isLoading) {
    return (
      <div>
        <SHdr title="Business Loan" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 12, gap: 8 }}>
          <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
          Loading...
        </div>
      </div>
    )
  }

  // Manager (or any non-admin) view: existence-only, no figures, no actions.
  if (!isAdmin) {
    return (
      <div>
        <SHdr title="Business Loan" />
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 4,
              background: '#F3F4F6',
              border: '1px solid #E5E7EB',
            }}
          >
            <Lock style={{ width: 13, height: 13, color: '#9CA3AF' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
              The amount owed is only visible to a system admin
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SHdr title="Business Loan" />

      {/* Toolbar — mirrors the Loans tab exactly: actions on the left,
          period picker + print on the right. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid #E0E0E0',
          background: '#FAFAFA',
          flexWrap: 'wrap',
        }}
      >
        <Btn size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>Record Money Borrowed</Btn>
        <Btn
          size="sm"
          icon={Plus}
          disabled={activeLoans.length === 0}
          onClick={() => setRepayOpen(true)}
          title={activeLoans.length === 0 ? 'Nothing outstanding to repay' : undefined}
        >
          Add Repayment
        </Btn>
        <Btn
          size="sm"
          icon={Trash2}
          variant="danger"
          disabled={!data?.lastEntry}
          onClick={() => setDeleteLastOpen(true)}
          title={data?.lastEntry ? 'Undo the most recent loan or repayment entry' : 'No loan activity to delete'}
        >
          Delete Last
        </Btn>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.textSecondary, fontWeight: 600 }}>
          Fin Period
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #ABABAB', borderRadius: 3, background: '#fff' }}
          />
        </label>
        <Btn
          size="sm"
          icon={Printer}
          onClick={() => window.open(`/api/customers/${customerId}/business-loans/statement/pdf?period=${period}`, '_blank')}
        >
          Print Statement
        </Btn>
      </div>

      {/* Ledger */}
      <div style={{ padding: 10 }}>
        <DataTable
          columns={ledgerColumns}
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          error={error instanceof Error ? error.message : !!error}
          emptyMessage="No loan activity for this period"
        />
      </div>

      {/* Footer — You Owe */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '8px 12px',
          borderTop: '1px solid #E0E0E0',
          background: '#FAFAFA',
        }}
      >
        <span style={lbl}>You Owe {customerName}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: moneyColor(closingBalance.toString()) }}>
          {format.currency(closingBalance.toString())}
        </span>
      </div>

      {createOpen && (
        <CreateBusinessLoanDialog
          customerId={customerId}
          customerName={customerName}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { revalidate(); setCreateOpen(false) }}
        />
      )}

      {repayOpen && activeLoans.length > 0 && (
        <RecordBusinessLoanRepaymentDialog
          loans={activeLoans}
          customerName={customerName}
          onClose={() => setRepayOpen(false)}
          onSuccess={() => { revalidate(); setRepayOpen(false) }}
        />
      )}

      {deleteLastOpen && data?.lastEntry && (
        <DeleteLastDialog
          lastEntry={data.lastEntry}
          onClose={() => setDeleteLastOpen(false)}
          onSuccess={() => { revalidate(); setDeleteLastOpen(false) }}
        />
      )}

      {voidTarget && (
        <VoidBusinessLoanDialog
          loan={voidTarget}
          customerName={customerName}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => { revalidate(); setVoidTarget(null) }}
        />
      )}
    </div>
  )
}

// ─── Create Business Loan Dialog ────────────────────────────────────────────
function CreateBusinessLoanDialog({
  customerId,
  customerName,
  onClose,
  onSuccess,
}: {
  customerId: string
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (!amount) return
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/business-loans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principalAmount: amount,
        paymentMethod: method,
        notes: notes || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(`Recorded — the business now owes ${customerName}`)
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string | { formErrors?: string[] } }
      const msg =
        typeof j.error === 'string'
          ? j.error
          : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed to record business loan'
      toast.error(msg)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title={`Record Money Borrowed From ${customerName}`} icon={HandCoins} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <p className="text-xs" style={{ color: '#6C757D' }}>
              {customerName} advanced cash to the business (e.g. to fund a stock purchase). This
              creates a liability — it&apos;s settled by deducting it from a future sale to{' '}
              {customerName} (via Split Payment in the Sales module).
            </p>
            <div>
              <Label>Amount Borrowed (R) *</Label>
              <Input
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                type="number"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <Label>How It Was Received *</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes <span className="font-normal text-gray-400">(optional)</span></Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" maxLength={500} />
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" onClick={onSubmit} disabled={!amount} loading={loading}>Record Loan</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Void Business Loan Dialog ──────────────────────────────────────────────
// Reachable only via "Delete Last" when the last ledger entry is a loan
// advance — voidBusinessLoan itself still enforces zero repayments.
function VoidBusinessLoanDialog({
  loan,
  customerName,
  onClose,
  onSuccess,
}: {
  loan: BusinessLoan
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (reason.length < 5) return
    setLoading(true)
    const res = await fetch(`/api/business-loans/${loan.id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('Entry voided')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string }
      toast.error(j.error ?? 'Failed to void entry')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Void Business Loan Entry" onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <div className="rounded p-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="font-medium" style={{ color: '#DC2626' }}>{customerName} — {loan.refNumber}</p>
              <p className="text-xs mt-1" style={{ color: '#DC2626' }}>
                This removes the record that the business borrowed {format.currency(loan.principalAmount)}
                {' '}from {customerName}. Use this only to correct a mistaken entry — this action cannot be undone.
              </p>
            </div>
            <div>
              <Label>Reason for Void *</Label>
              <Textarea
                placeholder="Enter a reason (min 5 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1"
                maxLength={500}
              />
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onSubmit} disabled={reason.length < 5} loading={loading}>Void Entry</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Record Payment Dialog ───────────────────────────────────────────────────
// Loan-specific (unlike Loans tab's customer-level FIFO "Add Repayment") —
// a business loan is a discrete debt the dealer may want tracked separately
// from any other one, so payment always settles a named loan. When there's
// only one active loan, the picker is skipped and it's chosen automatically.

function RepayPaymentInput({
  icon,
  label,
  value,
  onChange,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 flex items-center gap-1.5" style={{ color: '#6C757D' }}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex-1 relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#6C757D' }}>R</span>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-8 text-xs font-mono pl-6"
        />
      </div>
    </div>
  )
}

function RecordBusinessLoanRepaymentDialog({
  loans,
  customerName,
  onClose,
  onSuccess,
}: {
  loans: BusinessLoan[]
  customerName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [loanId, setLoanId] = useState(loans[0]!.id)
  const [cash, setCash] = useState('')
  const [eft, setEft] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loan = loans.find((l) => l.id === loanId) ?? loans[0]!
  const balance = new Decimal(loan.balanceAmount)
  const cashAmt = new Decimal(cash || '0')
  const eftAmt = new Decimal(eft || '0')
  const paymentTotal = cashAmt.plus(eftAmt)
  const remaining = balance.minus(paymentTotal)

  function validate(): string | null {
    if (paymentTotal.isZero()) return 'Enter at least one payment amount'
    if (paymentTotal.greaterThan(balance)) return 'Total exceeds the outstanding balance'
    return null
  }

  async function onSubmit() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setLoading(true)
    const res = await fetch(`/api/business-loans/${loan.id}/repay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payments: { cash: cash || '0', eft: eft || '0' },
        notes: notes || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(remaining.isZero() ? `Loan settled in full — ${loan.refNumber}` : `Payment recorded for ${loan.refNumber}`)
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string | { formErrors?: string[] } }
      const msg =
        typeof j.error === 'string'
          ? j.error
          : (j.error as { formErrors?: string[] })?.formErrors?.[0] ?? 'Failed to record payment'
      toast.error(msg)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={480}>
        <RpxDialogHeader title={`Record Payment To ${customerName}`} icon={Split} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            {loans.length > 1 && (
              <div>
                <Label>Which Loan? *</Label>
                <Select value={loanId} onValueChange={(v) => v && setLoanId(v)}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {loans.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.refNumber} — R {new Decimal(l.balanceAmount).toFixed(2)} outstanding
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="px-3 py-2.5 rounded-lg" style={{ background: colors.violetBg, border: `1px solid ${colors.violet}` }}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium" style={{ color: colors.violet }}>
                  {loan.refNumber} — Still Owed
                </span>
                <span className="font-mono font-bold" style={{ fontSize: 16, color: colors.violet }}>
                  R {balance.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <RepayPaymentInput icon={<Coins className="w-4 h-4" />} label="Cash" value={cash} onChange={setCash} disabled={loading} />
              <RepayPaymentInput icon={<CreditCard className="w-4 h-4" />} label="EFT" value={eft} onChange={setEft} disabled={loading} />
            </div>

            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-xs" style={{ color: '#6C757D' }}>
                <span>Payment Total</span>
                <span className="font-mono">R {paymentTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs font-medium" style={{ color: remaining.isZero() ? '#217346' : '#6C757D' }}>
                <span>{remaining.isZero() ? 'Loan Fully Settled' : 'Balance Remaining After This Payment'}</span>
                <span className="font-mono">{remaining.isZero() ? '✓' : `R ${remaining.toFixed(2)}`}</span>
              </div>
            </div>

            <div>
              <Label>Notes <span className="font-normal text-gray-400">(optional)</span></Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" maxLength={500} />
            </div>

            {error && <p className="text-xs" style={{ color: '#DC3545' }}>{error}</p>}
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" onClick={onSubmit} disabled={paymentTotal.isZero() || paymentTotal.greaterThan(balance)} loading={loading}>
            Record Payment
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Delete Last Dialog ─────────────────────────────────────────────────────
// Undoes whichever entry is actually last: void (loan advance, only legal
// when it has zero repayments — voidBusinessLoan's own existing rule) or
// reverse (repayment — writes an offsetting negative entry, never deletes).
function DeleteLastDialog({
  lastEntry,
  onClose,
  onSuccess,
}: {
  lastEntry: NonNullable<LastEntry>
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
    if (reason.trim().length < 5) return
    setLoading(true)
    const url = lastEntry.kind === 'loan'
      ? `/api/business-loans/${lastEntry.id}/void`
      : `/api/business-loans/repayments/${lastEntry.id}/reverse`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(lastEntry.kind === 'loan' ? 'Loan advance deleted' : 'Repayment reversed')
      onSuccess()
    } else {
      const j = (await res.json()) as { error?: string }
      toast.error(j.error ?? 'Failed to delete last entry')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Delete Last Entry" icon={Minus} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <div className="rounded p-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="font-medium" style={{ color: '#DC2626' }}>
                {lastEntry.description} of {format.currency(lastEntry.amount)} on{' '}
                {new Date(lastEntry.date).toLocaleDateString('en-ZA')}
              </p>
              <p className="text-xs mt-1" style={{ color: '#DC2626' }}>
                {lastEntry.kind === 'loan'
                  ? 'This will delete the loan advance. Only possible while nothing has been repaid against it yet.'
                  : 'This will reverse the repayment, restoring the loan balance it paid down. The original entry stays on record.'}
              </p>
            </div>
            <div>
              <Label>Reason *</Label>
              <Textarea
                placeholder="Enter a reason (min 5 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1"
                maxLength={500}
              />
            </div>
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="danger" onClick={onSubmit} disabled={reason.trim().length < 5} loading={loading}>
            Delete Last
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
