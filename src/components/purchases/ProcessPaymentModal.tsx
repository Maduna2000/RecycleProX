'use client'

import { useState, useEffect } from 'react'
import { Loader2, CreditCard, AlertCircle, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog, DialogContent, ModalTitleBar } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { SplitPaymentModal, type SplitPayTarget } from './SplitPaymentModal'

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
  const [method,          setMethod]          = useState<'cash' | 'eft' | 'cheque'>('cash')
  const [amount,          setAmount]          = useState('')
  const [amountError,     setAmountError]     = useState<string | null>(null)
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

  function validateAmount(raw: string): string | null {
    if (!raw.trim()) return 'Amount is required'
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Enter a valid amount (e.g. 150.00)'
    const d = new Decimal(raw)
    if (d.lt(new Decimal('0.01'))) return 'Minimum amount is R0.01'
    if (d.gt(remaining)) return `Cannot exceed remaining balance of R ${remaining.toFixed(2)}`
    return null
  }

  async function handlePay() {
    const err = validateAmount(amount)
    if (err) { setAmountError(err); return }
    setAmountError(null)
    setLoading(true)
    const res = await fetch(`/api/purchases/${purchase.id}/mark-paid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, paymentMethod: method }),
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
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <ModalTitleBar title="Process Payment" onClose={onClose} />
        <div className="space-y-4 mt-2">
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

          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium" style={{ color: '#6C757D' }}>Payment Amount</label>
              <button
                type="button"
                onClick={() => { setAmount(remaining.toFixed(2)); setAmountError(null) }}
                className="text-xs underline"
                style={{ color: '#217346' }}
              >
                Pay full balance
              </button>
            </div>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountError(null) }}
              className="h-8 text-[12px] font-mono"
            />
            {amountError && (
              <p className="text-xs mt-1" style={{ color: '#DC3545' }}>{amountError}</p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block mb-1 text-xs font-medium" style={{ color: '#6C757D' }}>Payment Method</label>
            <Select onValueChange={(v) => setMethod(v as typeof method)} defaultValue="cash">
              <SelectTrigger className="h-8 text-xs border-[#E0E0E0]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
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

          <div className="flex justify-end gap-2 pt-1">
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
                color: '#212529',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
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
                color: '#212529',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#E0E0E0' }}
            >
              {loading ? <Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> : <CreditCard style={{ width: 9, height: 9 }} />}
              Process Payment
            </button>
          </div>
        </div>
      </DialogContent>

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
