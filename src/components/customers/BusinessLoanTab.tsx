'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Loader2, MoreHorizontal, Lock, HandCoins, Coins, CreditCard, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { format } from '@/lib/utils/format'
import { colors } from '@/lib/design-tokens'
import { HEADER_GRAD, VIOLET_GRAD, lbl, Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// This tab is the mirror image of the "Loans" tab: Loans is money the
// business advances TO this customer (a receivable — the customer owes us).
// This tab is money the customer/dealer advanced TO the business (a
// liability — we owe them). Same underlying pattern, opposite direction, so
// everything here is deliberately styled and worded around "owe"/"borrowed"
// rather than reusing Loans' "advance"/"outstanding" language, and uses
// violet (a liability/debt color) instead of Loans' green, so the two tabs
// are never mistaken for each other at a glance.

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

interface BusinessLoanTabProps {
  customerId: string
  customerName: string
  userRole: string
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT' },
]

function SHdr({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '5px 10px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <HandCoins style={{ width: 12, height: 12, color: colors.violet }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.violet }}>{title}</span>
      </div>
      <span style={{ fontSize: 10, color: '#6C757D' }}>{subtitle}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: 'active' | 'settled' | 'voided' }) {
  const styles: Record<typeof status, { bg: string; color: string; text: string }> = {
    active: { bg: colors.violetBg, color: colors.violet, text: 'You Owe' },
    settled: { bg: '#DCFCE7', color: '#166534', text: 'Settled' },
    voided: { bg: '#F3F4F6', color: '#6B7280', text: 'Voided' },
  }
  const s = styles[status]
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 2,
        padding: '1px 6px',
        background: s.bg,
        color: s.color,
      }}
    >
      {s.text}
    </span>
  )
}

export function BusinessLoanTab({ customerId, customerName, userRole }: BusinessLoanTabProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<BusinessLoan | null>(null)
  const [repayTarget, setRepayTarget] = useState<BusinessLoan | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  const { data, isLoading } = useSWR<BusinessLoanSummaryResponse>(
    `/api/customers/${customerId}/business-loans`, fetcher)

  const isAdmin = userRole === 'admin'
  const loans = data?.loans ?? []

  function revalidate() {
    mutate(`/api/customers/${customerId}/business-loans`)
  }

  function canVoidLoan(loan: BusinessLoan): boolean {
    return isAdmin && loan.status === 'active' && (loan._count?.repayments ?? 0) === 0
  }

  function canRecordPayment(loan: BusinessLoan): boolean {
    return isAdmin && loan.status === 'active' && new Decimal(loan.balanceAmount).gt(0)
  }

  const owed = data?.outstanding ? new Decimal(data.outstanding) : new Decimal(0)

  if (isLoading) {
    return (
      <div>
        <SHdr title="Business Loan" subtitle="Money the business borrowed from this dealer" />
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
        <SHdr title="Business Loan" subtitle="Money the business borrowed from this dealer" />
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 4,
              background: data?.hasOutstanding ? colors.violetBg : '#F3F4F6',
              border: `1px solid ${data?.hasOutstanding ? '#C4B5FD' : '#E5E7EB'}`,
            }}
          >
            <Lock style={{ width: 13, height: 13, color: data?.hasOutstanding ? colors.violet : '#9CA3AF' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: data?.hasOutstanding ? colors.violet : '#6B7280' }}>
              {data?.hasOutstanding ? 'The business owes this dealer money' : 'The business owes this dealer nothing'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>
            The amount owed is only visible to a system admin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SHdr title="Business Loan" subtitle="Money the business borrowed from this dealer" />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid #E0E0E0',
          background: '#FAFAFA',
        }}
      >
        <div>
          <span style={lbl}>You Owe {customerName}</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: owed.gt(0) ? colors.violet : colors.action,
            }}
          >
            {format.currency(owed.toString())}
          </span>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            fontSize: 11,
            padding: '4px 12px',
            borderRadius: 2,
            cursor: 'pointer',
            background: VIOLET_GRAD,
            border: `1px solid ${colors.violet}`,
            color: '#fff',
            fontWeight: 600,
          }}
        >
          + Record Money Borrowed
        </button>
      </div>

      {loans.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 12 }}>
            The business has never borrowed money from this dealer
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: 2,
              cursor: 'pointer',
              background: VIOLET_GRAD,
              border: `1px solid ${colors.violet}`,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            + Record Money Borrowed
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0' }}>
                {['Reference', 'Borrowed', 'Still Owed', 'Status', 'Date', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '5px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: '#6C757D',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loans.map((loan, i) => (
                <tr
                  key={loan.id}
                  style={{
                    borderBottom: '1px solid #F0F0F0',
                    background: i % 2 === 0 ? '#fff' : '#FAFAFA',
                    opacity: loan.status === 'voided' ? 0.5 : 1,
                  }}
                >
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 11 }}>{loan.refNumber}</td>
                  <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>{format.currency(loan.principalAmount)}</td>
                  <td
                    style={{
                      padding: '5px 10px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: new Decimal(loan.balanceAmount).gt(0) ? colors.violet : colors.action,
                    }}
                  >
                    {format.currency(loan.balanceAmount)}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    <StatusBadge status={loan.status} />
                  </td>
                  <td style={{ padding: '5px 10px', color: '#6C757D' }}>
                    {new Date(loan.createdAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}
                  </td>
                  <td style={{ padding: '5px 10px', width: 40, position: 'relative' }}>
                    {(canRecordPayment(loan) || canVoidLoan(loan)) && (
                      <button
                        onClick={(e) => {
                          if (menuOpenId === loan.id) { setMenuOpenId(null); setMenuPos(null); return }
                          const rect = e.currentTarget.getBoundingClientRect()
                          setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right })
                          setMenuOpenId(loan.id)
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 2 }}
                      >
                        <MoreHorizontal style={{ width: 14, height: 14, color: '#6C757D' }} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fixed-position row menu — rendered outside the scrollable table so it
          never gets clipped by the tab panel's inner scroller */}
      {menuOpenId && menuPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => { setMenuOpenId(null); setMenuPos(null) }} />
          <div
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 50,
              background: '#fff',
              border: '1px solid #E0E0E0',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              minWidth: 130,
            }}
          >
            {(() => {
              const loan = loans.find((l) => l.id === menuOpenId)
              if (!loan) return null
              return (
                <>
                  {canRecordPayment(loan) && (
                    <button
                      onClick={() => {
                        setRepayTarget(loan)
                        setMenuOpenId(null)
                        setMenuPos(null)
                      }}
                      style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: colors.violet }}
                    >
                      Record Payment
                    </button>
                  )}
                  {canVoidLoan(loan) && (
                    <button
                      onClick={() => {
                        setVoidTarget(loan)
                        setMenuOpenId(null)
                        setMenuPos(null)
                      }}
                      style={{ display: 'block', width: '100%', padding: '6px 12px', fontSize: 11, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}
                    >
                      Void Entry
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}

      {createOpen && (
        <CreateBusinessLoanDialog
          customerId={customerId}
          customerName={customerName}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => { revalidate(); setCreateOpen(false) }}
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

      {repayTarget && (
        <RecordBusinessLoanRepaymentDialog
          loan={repayTarget}
          customerName={customerName}
          onClose={() => setRepayTarget(null)}
          onSuccess={() => { revalidate(); setRepayTarget(null) }}
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
// The mirror image of the Purchases module's Split Payment modal: that one
// pays a pending purchase balance UP to exactly zero (mandatory full
// settlement); this one pays a business loan's balanceAmount DOWN, and a
// partial amount is fine — the business can chip away at what it owes a
// dealer over more than one visit. Same split-across-methods mechanic (cash
// + EFT in one action) and the same PaymentInput row styling.

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
  const [cash, setCash] = useState('')
  const [eft, setEft] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
