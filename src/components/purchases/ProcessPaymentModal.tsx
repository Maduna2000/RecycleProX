'use client'

import { useState, useEffect } from 'react'
import { CreditCard, AlertCircle, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { SplitPaymentModal, type SplitPayTarget } from './SplitPaymentModal'
import { colors } from '@/lib/design-tokens'
import { Btn, inp, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { useOfflineMutation } from '@/hooks/useOfflineFetch'

export type PayTarget = {
  id: string
  ref: string
  totalAmount: string
  loanDeductionAmount: string
  amountPaid: string
  customerId: string
}

export function ProcessPaymentModal({
  purchase,
  onClose,
  onSuccess,
}: {
  purchase: PayTarget
  onClose: () => void
  onSuccess: () => void
}) {
  const [method,          setMethod]          = useState<'cash' | 'eft'>('cash')
  const [loading,         setLoading]         = useState(false)
  const [showSplit,       setShowSplit]       = useState(false)
  const [outstandingLoan, setOutstandingLoan] = useState('0')
  const [loanLoading,     setLoanLoading]     = useState(true)
  const { mutate: offlineMutate } = useOfflineMutation()

  const totalAmount   = new Decimal(purchase.totalAmount)
  const loanDeduction = new Decimal(purchase.loanDeductionAmount)
  const alreadyPaid   = new Decimal(purchase.amountPaid)
  const remaining     = totalAmount.minus(loanDeduction).minus(alreadyPaid)
  const outstandingDec = new Decimal(outstandingLoan || '0')

  // Fetch customer's outstanding loan on mount
  useEffect(() => {
    async function fetchLoan() {
      try {
        const res = await fetch(`/api/loans/customer/${purchase.customerId}/outstanding`)
        if (res.ok) {
          const data = await res.json() as { outstanding?: string }
          setOutstandingLoan(data.outstanding ?? '0')
        }
      } catch {
        // Silently fail - loan alert just won't show
      } finally {
        setLoanLoading(false)
      }
    }
    fetchLoan()
  }, [purchase.customerId])

  async function handlePay() {
    // Always pay full remaining amount
    const fullAmount = remaining.toFixed(2)
    setLoading(true)
    try {
      const { queued } = await offlineMutate({
        method: 'PATCH',
        url: `/api/purchases/${purchase.id}/mark-paid`,
        body: { amount: fullAmount, paymentMethod: method },
        localId: purchase.id,
      })
      setLoading(false)
      if (queued) {
        toast.success(`Payment saved offline for ${purchase.ref} — will sync when connected`)
      } else {
        toast.success(`Payment processed for ${purchase.ref}`)
      }
      onSuccess()
    } catch (err) {
      setLoading(false)
      toast.error(err instanceof Error ? err.message : 'Failed to process payment')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Process Payment" icon={CreditCard} onClose={onClose} />
        <RpxDialogBody>
        <div className="space-y-4">
          {/* Balance summary */}
          <div className="px-3 py-2.5 rounded-lg space-y-1" style={{ background: '#F8F9FA', border: '1px solid #E0E0E0' }}>
            <p className="font-mono font-medium" style={{ fontSize: 12, color: '#212529' }}>{purchase.ref}</p>
            <div className="flex justify-between" style={{ fontSize: 12, color: '#6C757D' }}>
              <span>Total amount</span>
              <span className="font-mono">R {totalAmount.toFixed(2)}</span>
            </div>
            {loanDeduction.gt(0) && (
              <div className="flex justify-between" style={{ fontSize: 12, color: '#6C757D' }}>
                <span>Loan deduction</span>
                <span className="font-mono">− R {loanDeduction.toFixed(2)}</span>
              </div>
            )}
            {alreadyPaid.gt(0) && (
              <div className="flex justify-between" style={{ fontSize: 12, color: colors.action }}>
                <span>Already paid</span>
                <span className="font-mono">− R {alreadyPaid.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-[#E0E0E0] mt-1" style={{ fontSize: 13 }}>
              <span className="font-semibold" style={{ color: '#C9A020' }}>Remaining balance</span>
              <span className="font-mono font-bold" style={{ color: '#C9A020' }}>R {remaining.toFixed(2)}</span>
            </div>
          </div>

          {/* Loan alert - MANDATORY */}
          {!loanLoading && outstandingDec.greaterThan(0) && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: colors.alertBg, border: `1px solid ${colors.alertBorder}` }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.alertIcon }} />
              <div>
                <p className="text-xs font-medium" style={{ color: colors.alertIcon }}>
                  Outstanding Loan: R {outstandingDec.toFixed(2)}
                </p>
                <p className="text-xs" style={{ color: colors.alertText }}>
                  Use Split Payment to deduct loan from this payment.
                </p>
              </div>
            </div>
          )}

          {/* Amount display - Full payment required */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: '#6C757D' }}>Payment Amount (Full Payment Required)</label>
            </div>
            <div
              className="h-8 flex items-center px-3 rounded border text-[12px] font-mono font-semibold"
              style={{ background: '#F5F5F5', borderColor: '#E0E0E0', color: colors.action }}
            >
              R {remaining.toFixed(2)}
            </div>
          </div>

          {/* Payment method */}
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

          {/* Split Payment button */}
          <button
            type="button"
            onClick={() => setShowSplit(true)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium"
            style={{
              background: '#E3F2FD',
              border: '1px solid #90CAF9',
              color: '#1565C0',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <Split className="w-3.5 h-3.5" />
            Split Payment (Multiple Methods)
          </button>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" icon={CreditCard} loading={loading} onClick={handlePay}>
            Process Full Payment
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>

      {/* Split Payment Modal */}
      {showSplit && (
        <SplitPaymentModal
          purchase={purchase as SplitPayTarget}
          outstandingLoan={outstandingLoan}
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
