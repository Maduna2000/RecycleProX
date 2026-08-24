'use client'

import { useState, useEffect } from 'react'
import { CreditCard, AlertCircle, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { SaleSplitPaymentModal } from './SaleSplitPaymentModal'
import { colors } from '@/lib/design-tokens'
import { Btn, inp, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'
import { useSystemCurrency } from '@/hooks/useSystemCurrency'

export type PayTarget = {
  id: string
  ref: string
  totalAmount: string
  amountPaid: string
  businessLoanDeductionAmount?: string
  customerId?: string | null
}

export function RecordPaymentModal({
  sale,
  onClose,
  onSuccess,
}: {
  sale: PayTarget
  onClose: () => void
  onSuccess: () => void
}) {
  const [method,      setMethod]      = useState<'cash' | 'eft'>('cash')
  const [amount,      setAmount]      = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [showSplit,   setShowSplit]   = useState(false)
  // null = not yet confirmed either way — distinct from a confirmed "false",
  // so a failed/offline check can't silently look like "no loan" and skip
  // the mandatory Split Payment gate below.
  const [hasOutstandingBusinessLoan, setHasOutstandingBusinessLoan] = useState<boolean | null>(null)
  const { mutate: offlineMutate } = useOfflineMutation()
  const { symbol: currSym } = useSystemCurrency()

  const totalAmount = new Decimal(sale.totalAmount)
  const alreadyPaid = new Decimal(sale.amountPaid)
  const remaining   = totalAmount.minus(alreadyPaid)

  // Existence-only — never a figure without going through Split Payment's PIN gate.
  useEffect(() => {
    if (!sale.customerId) return
    let cancelled = false
    fetch(`/api/customers/${sale.customerId}/business-loans`)
      .then((r) => r.json())
      .then((d: { hasOutstanding?: boolean }) => { if (!cancelled) setHasOutstandingBusinessLoan(d.hasOutstanding === true) })
      .catch(() => { if (!cancelled) setHasOutstandingBusinessLoan(null) })
    return () => { cancelled = true }
  }, [sale.customerId])

  // Fail closed, not open: if we could never confirm loan status for this
  // customer (offline, check never succeeded), treat it the same as "has an
  // outstanding loan" for gating purposes — block plain payment rather than
  // silently let a real business-loan deduction get skipped.
  const loanStatusUnknown = sale.customerId != null && hasOutstandingBusinessLoan === null
  const blockPlainPayment = hasOutstandingBusinessLoan === true || loanStatusUnknown

  function validateAmount(raw: string): string | null {
    if (!raw.trim()) return 'Amount is required'
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Enter a valid amount (e.g. 150.00)'
    const d = new Decimal(raw)
    if (d.lt(new Decimal('0.01'))) return `Minimum amount is ${currSym}0.01`
    if (d.gt(remaining)) return `Cannot exceed remaining balance of ${currSym} ${remaining.toFixed(2)}`
    return null
  }

  async function handlePay() {
    const err = validateAmount(amount)
    if (err) { setAmountError(err); return }
    setAmountError(null)
    setLoading(true)
    try {
      const { queued } = await offlineMutate({
        method: 'PATCH',
        url: `/api/sales/${sale.id}/mark-paid`,
        body: { amount, paymentMethod: method },
        localId: sale.id,
      })
      setLoading(false)
      if (queued) {
        toast.success(`Payment saved offline for ${sale.ref} — will sync when connected`)
      } else {
        toast.success(`Payment processed for ${sale.ref}`)
      }
      onSuccess()
    } catch (mutateErr) {
      setLoading(false)
      toast.error(mutateErr instanceof Error ? mutateErr.message : 'Failed to record payment')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={400}>
        <RpxDialogHeader title="Process Payment" icon={CreditCard} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          {/* Balance summary */}
          <div className="px-3 py-2.5 rounded-lg space-y-1" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
            <p className="font-mono font-medium" style={{ fontSize: 12, color: '#212529' }}>{sale.ref}</p>
            <div className="flex justify-between" style={{ fontSize: 12, color: '#6C757D' }}>
              <span>Total amount</span>
              <span className="font-mono">{currSym} {totalAmount.toFixed(2)}</span>
            </div>
            {alreadyPaid.gt(0) && (
              <div className="flex justify-between" style={{ fontSize: 12, color: colors.action }}>
                <span>Already paid</span>
                <span className="font-mono">− {currSym} {alreadyPaid.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-[#E0E0E0] mt-1" style={{ fontSize: 13 }}>
              <span className="font-semibold" style={{ color: '#C9A020' }}>Remaining balance</span>
              <span className="font-mono font-bold" style={{ color: '#C9A020' }}>{currSym} {remaining.toFixed(2)}</span>
            </div>
          </div>

          {/* Business loan alert — existence-only, no figure. Mandatory: this
              sale cannot be settled via plain cash/eft while it's unpaid,
              only through Split Payment (which PIN-gates the actual figure).
              Also blocks when status is unknown (offline, check never
              succeeded) — fail closed rather than silently skip the gate. */}
          {blockPlainPayment && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: colors.alertBg, border: `1px solid ${colors.alertBorder}` }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.alertIcon }} />
              <div>
                <p className="text-xs font-medium" style={{ color: colors.alertIcon }}>
                  {loanStatusUnknown ? 'Business loan status unknown — offline' : 'This customer has a pending business loan'}
                </p>
                <p className="text-xs" style={{ color: colors.alertText }}>
                  {loanStatusUnknown
                    ? 'Could not check for an outstanding business loan while offline. Reconnect to process this payment.'
                    : 'This sale can only be settled via Split Payment until the loan is applied.'}
                </p>
              </div>
            </div>
          )}

          {/* Amount + method — only when there's no business loan to resolve first */}
          {!blockPlainPayment && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium" style={{ color: '#6C757D' }}>Amount Received</label>
                  <button
                    type="button"
                    onClick={() => { setAmount(remaining.toFixed(2)); setAmountError(null) }}
                    className="text-xs underline"
                    style={{ color: colors.action }}
                  >
                    Pay full balance
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountError(null) }}
                  style={{ ...inp, fontFamily: 'monospace', fontSize: 12 }}
                />
                {amountError && (
                  <p className="text-xs mt-1" style={{ color: colors.danger }}>{amountError}</p>
                )}
              </div>

              <div>
                <label className="block mb-1 text-xs font-medium" style={{ color: '#6C757D' }}>Payment Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                  style={inp}
                >
                  <option value="cash">Cash</option>
                  <option value="eft">EFT</option>
                </select>
              </div>
            </>
          )}

          {/* Split Payment button */}
          {sale.customerId && (
            <button
              type="button"
              onClick={() => setShowSplit(true)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium"
              style={{
                background: blockPlainPayment ? '#1565C0' : '#E3F2FD',
                border: '1px solid #90CAF9',
                color: blockPlainPayment ? '#fff' : '#1565C0',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <Split className="w-3.5 h-3.5" />
              Split Payment (Multiple Methods)
            </button>
          )}

        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          {!blockPlainPayment && (
            <Btn variant="primary" icon={CreditCard} loading={loading} onClick={handlePay}>
              Process Payment
            </Btn>
          )}
        </RpxDialogFooter>
      </RpxDialogContent>

      {/* Split Payment Modal */}
      {showSplit && sale.customerId && (
        <SaleSplitPaymentModal
          sale={{
            id:                          sale.id,
            ref:                         sale.ref,
            totalAmount:                 sale.totalAmount,
            businessLoanDeductionAmount: sale.businessLoanDeductionAmount ?? '0',
            amountPaid:                  sale.amountPaid,
            customerId:                  sale.customerId,
          }}
          hasOutstandingBusinessLoan={blockPlainPayment}
          onClose={() => setShowSplit(false)}
          onSuccess={() => {
            setShowSplit(false)
            onSuccess()
          }}
        />
      )}
    </Dialog>
  )
}
