'use client'

import { useState, useEffect } from 'react'
import { CreditCard, AlertCircle, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SplitPaymentModal, type SplitPayTarget } from './SplitPaymentModal'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

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
    const res = await fetch(`/api/purchases/${purchase.id}/mark-paid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: fullAmount, paymentMethod: method }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(`Payment processed for ${purchase.ref}`)
      onSuccess()
    } else {
      const j = await res.json() as { error?: string }
      toast.error(j.error ?? 'Failed to process payment')
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
              <div className="flex justify-between" style={{ fontSize: 12, color: '#217346' }}>
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
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: '#FFF3E0', border: '1px solid #FFCC80' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E65100' }} />
              <div>
                <p className="text-xs font-medium" style={{ color: '#E65100' }}>
                  Outstanding Loan: R {outstandingDec.toFixed(2)}
                </p>
                <p className="text-xs" style={{ color: '#EF6C00' }}>
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
              style={{ background: '#F5F5F5', borderColor: '#E0E0E0', color: '#217346' }}
            >
              R {remaining.toFixed(2)}
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block mb-1 text-xs font-medium" style={{ color: '#6C757D' }}>Payment Method</label>
            <Select onValueChange={(v) => setMethod(v as typeof method)} defaultValue="cash">
              <SelectTrigger className="h-8 w-full text-xs border-[#E0E0E0]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
              </SelectContent>
            </Select>
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
