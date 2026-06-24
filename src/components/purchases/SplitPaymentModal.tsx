'use client'

import { useState, useEffect } from 'react'
import { Loader2, Coins, CreditCard, FileText, Wallet, AlertCircle, Lock } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog, DialogContent, ModalTitleBar } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export type SplitPayTarget = {
  id: string
  ref: string
  totalAmount: string
  loanDeductionAmount: string
  amountPaid: string
  customerId: string
}

function PaymentInput({
  icon,
  label,
  value,
  onChange,
  disabled,
  locked,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  locked?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 flex items-center gap-1.5" style={{ color: highlight ? '#E65100' : '#6C757D' }}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
        {locked && <Lock className="w-3 h-3" style={{ color: '#E65100' }} />}
      </div>
      <div className="flex-1 relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#6C757D' }}>R</span>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || locked}
          className="h-8 text-xs font-mono pl-6"
          style={{
            borderColor: highlight ? '#FFCC80' : undefined,
            background: locked ? '#F5F5F5' : undefined,
          }}
        />
      </div>
    </div>
  )
}

export function SplitPaymentModal({
  purchase,
  outstandingLoan,
  onClose,
  onSuccess,
}: {
  purchase: SplitPayTarget
  outstandingLoan: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [cash,    setCash]    = useState('')
  const [eft,     setEft]     = useState('')
  const [cheque,  setCheque]  = useState('')
  const [loan,    setLoan]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Calculate amounts
  const totalAmount     = new Decimal(purchase.totalAmount)
  const existingLoan    = new Decimal(purchase.loanDeductionAmount || '0')
  const existingPaid    = new Decimal(purchase.amountPaid)
  const pendingAmount   = totalAmount.minus(existingLoan).minus(existingPaid)
  const outstandingDec  = new Decimal(outstandingLoan || '0')

  // Auto-populate and lock loan field when there's outstanding loan (MANDATORY)
  useEffect(() => {
    if (outstandingDec.greaterThan(0)) {
      // Pre-fill with minimum of outstanding loan or pending amount
      const autoLoan = Decimal.min(outstandingDec, pendingAmount)
      setLoan(autoLoan.toFixed(2))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate totals
  const cashAmt   = new Decimal(cash   || '0')
  const eftAmt    = new Decimal(eft    || '0')
  const chequeAmt = new Decimal(cheque || '0')
  const loanAmt   = new Decimal(loan   || '0')
  const paymentTotal = cashAmt.plus(eftAmt).plus(chequeAmt).plus(loanAmt)
  const remaining = pendingAmount.minus(paymentTotal)

  // Validation - FULL PAYMENT REQUIRED
  function validate(): string | null {
    if (paymentTotal.isZero()) return 'Enter at least one payment amount'
    if (paymentTotal.greaterThan(pendingAmount)) return 'Total exceeds pending amount'
    if (loanAmt.greaterThan(outstandingDec)) return 'Loan amount exceeds outstanding loan'
    if (remaining.greaterThan(0)) return `Full payment required. R ${remaining.toFixed(2)} still remaining.`
    return null
  }

  async function handleSubmit() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setLoading(true)

    const res = await fetch(`/api/purchases/${purchase.id}/split-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payments: {
          cash:   cash   || '0',
          eft:    eft    || '0',
          cheque: cheque || '0',
          loan:   loan   || '0',
        },
      }),
    })

    if (res.ok) {
      toast.success(`Split payment processed for ${purchase.ref}`)

      // Auto-print receipt
      try {
        const printRes = await fetch('/api/print/slip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'purchase', id: purchase.id }),
        })
        if (!printRes.ok) {
          toast.warning('Payment saved but receipt print failed')
        }
      } catch {
        toast.warning('Payment saved but receipt print failed')
      }

      setLoading(false)
      onSuccess()
    } else {
      const j = await res.json() as { error?: string }
      toast.error(j.error ?? 'Failed to process payment')
      setLoading(false)
    }
  }

  const hasOutstandingLoan = outstandingDec.greaterThan(0)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Split Payment" onClose={onClose} />

        <div className="space-y-4 mt-2">
          {/* Pending amount banner */}
          <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FFF8E1', border: '1px solid #FFE082' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium" style={{ color: '#F57F17' }}>Amount to Pay (Full Payment Required)</span>
              <span className="font-mono font-bold" style={{ fontSize: 16, color: '#F57F17' }}>
                R {pendingAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Loan alert - MANDATORY */}
          {hasOutstandingLoan && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: '#FFF3E0', border: '1px solid #FFCC80' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E65100' }} />
              <div>
                <p className="text-xs font-medium" style={{ color: '#E65100' }}>
                  Outstanding Loan: R {outstandingDec.toFixed(2)}
                </p>
                <p className="text-xs" style={{ color: '#EF6C00' }}>
                  Loan deduction is mandatory and has been auto-filled.
                </p>
              </div>
            </div>
          )}

          {/* Payment inputs */}
          <div className="space-y-3">
            <PaymentInput
              icon={<Coins className="w-4 h-4" />}
              label="Cash"
              value={cash}
              onChange={setCash}
              disabled={loading}
            />
            <PaymentInput
              icon={<CreditCard className="w-4 h-4" />}
              label="EFT"
              value={eft}
              onChange={setEft}
              disabled={loading}
            />
            <PaymentInput
              icon={<FileText className="w-4 h-4" />}
              label="Cheque"
              value={cheque}
              onChange={setCheque}
              disabled={loading}
            />
            <PaymentInput
              icon={<Wallet className="w-4 h-4" />}
              label="Loan Deduction"
              value={loan}
              onChange={setLoan}
              disabled={loading}
              locked={hasOutstandingLoan}
              highlight={hasOutstandingLoan}
            />
          </div>

          {/* Summary */}
          <div className="border-t pt-3 space-y-1">
            <div className="flex justify-between text-xs" style={{ color: '#6C757D' }}>
              <span>Payment Total</span>
              <span className="font-mono">R {paymentTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium" style={{
              color: remaining.isZero() ? '#217346' : '#DC3545'
            }}>
              <span>{remaining.isZero() ? 'Fully Covered' : remaining.lessThan(0) ? 'Over-payment' : 'Remaining (Must be R 0.00)'}</span>
              <span className="font-mono">{remaining.isZero() ? '✓' : `R ${remaining.abs().toFixed(2)}`}</span>
            </div>
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#DC3545' }}>{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                fontSize: 10, padding: '1px 6px',
                background: '#E0E0E0', border: '1px solid #999',
                borderRadius: 2, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || paymentTotal.isZero() || !remaining.isZero()}
              style={{
                fontSize: 10, padding: '1px 6px',
                background: '#217346', color: '#fff',
                border: '1px solid #1A5A38', borderRadius: 2,
                cursor: (loading || paymentTotal.isZero() || !remaining.isZero()) ? 'not-allowed' : 'pointer',
                opacity: (loading || paymentTotal.isZero() || !remaining.isZero()) ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              {loading && <Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} />}
              Process Full Payment
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
