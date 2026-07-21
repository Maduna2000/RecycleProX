'use client'

import { useState } from 'react'
import { Coins, CreditCard, Wallet, Lock, Split } from 'lucide-react'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { AdminPinUnlockModal, type BusinessLoanFullSummary } from '@/components/business-loans/AdminPinUnlockModal'

export type SaleSplitPayTarget = {
  id: string
  ref: string
  totalAmount: string
  businessLoanDeductionAmount: string
  amountPaid: string
  customerId: string | null
}

function PaymentInput({
  icon,
  label,
  value,
  onChange,
  disabled,
  locked,
  onUnlockClick,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
  locked?: boolean
  onUnlockClick?: () => void
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 flex items-center gap-1.5" style={{ color: highlight ? '#E65100' : '#6C757D' }}>
        {icon}
        <span className="text-xs font-medium">{label}</span>
        {locked && <Lock className="w-3 h-3" style={{ color: '#E65100' }} />}
      </div>
      <div className="flex-1 relative">
        {locked ? (
          <button
            type="button"
            onClick={onUnlockClick}
            className="w-full h-8 text-xs rounded border text-left px-2"
            style={{ background: '#F5F5F5', borderColor: '#FFCC80', color: '#E65100' }}
          >
            Enter admin PIN to unlock
          </button>
        ) : (
          <>
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#6C757D' }}>R</span>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="h-8 text-xs font-mono pl-6"
              style={{ borderColor: highlight ? '#FFCC80' : undefined }}
            />
          </>
        )}
      </div>
    </div>
  )
}

export function SaleSplitPaymentModal({
  sale,
  hasOutstandingBusinessLoan,
  onClose,
  onSuccess,
}: {
  sale: SaleSplitPayTarget
  hasOutstandingBusinessLoan: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [cash, setCash] = useState('')
  const [eft, setEft] = useState('')
  const [businessLoan, setBusinessLoan] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [unlockedSummary, setUnlockedSummary] = useState<BusinessLoanFullSummary | null>(null)

  const totalAmount        = new Decimal(sale.totalAmount)
  const existingDeduction  = new Decimal(sale.businessLoanDeductionAmount || '0')
  const existingPaid       = new Decimal(sale.amountPaid)
  const pendingAmount      = totalAmount.minus(existingDeduction).minus(existingPaid)

  const cashAmt         = new Decimal(cash || '0')
  const eftAmt           = new Decimal(eft  || '0')
  const businessLoanAmt = new Decimal(businessLoan || '0')
  const paymentTotal     = cashAmt.plus(eftAmt).plus(businessLoanAmt)
  const remaining        = pendingAmount.minus(paymentTotal)

  // Everyone — including an admin — must enter a PIN to reveal and use this
  // leg. The figure is sensitive regardless of who happens to be at the
  // till right now.
  const showBusinessLoanLeg = hasOutstandingBusinessLoan && !!sale.customerId
  const isLocked = showBusinessLoanLeg && !unlockedSummary
  const maxLoanDeduction = unlockedSummary
    ? Decimal.min(new Decimal(unlockedSummary.outstanding), pendingAmount)
    : new Decimal(0)

  function validate(): string | null {
    if (paymentTotal.isZero()) return 'Enter at least one payment amount'
    if (paymentTotal.greaterThan(pendingAmount)) return 'Total exceeds pending amount'
    if (businessLoanAmt.greaterThan(maxLoanDeduction)) return 'Business loan deduction exceeds outstanding balance'
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

    const res = await fetch(`/api/sales/${sale.id}/split-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payments: {
          cash:         cash || '0',
          eft:          eft  || '0',
          businessLoan: businessLoan || '0',
        },
      }),
    })

    setLoading(false)
    if (res.ok) {
      toast.success(`Split payment processed for ${sale.ref}`)
      onSuccess()
    } else {
      const j = await res.json() as { error?: string }
      toast.error(j.error ?? 'Failed to process payment')
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <RpxDialogContent maxWidth={480}>
          <RpxDialogHeader title="Split Payment" icon={Split} onClose={onClose} />
          <RpxDialogBody>
            <div className="space-y-4">
              <div className="px-3 py-2.5 rounded-lg" style={{ background: '#FFF8E1', border: '1px solid #FFE082' }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium" style={{ color: '#F57F17' }}>Amount to Pay (Full Payment Required)</span>
                  <span className="font-mono font-bold" style={{ fontSize: 16, color: '#F57F17' }}>
                    R {pendingAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {showBusinessLoanLeg && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: '#FFF3E0', border: '1px solid #FFCC80' }}>
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E65100' }} />
                  <div>
                    <p className="text-xs font-medium" style={{ color: '#E65100' }}>
                      This customer has a pending business loan
                    </p>
                    <p className="text-xs" style={{ color: '#EF6C00' }}>
                      {unlockedSummary
                        ? `Outstanding: R ${new Decimal(unlockedSummary.outstanding).toFixed(2)} — you may apply some or all of this sale toward it.`
                        : 'Enter an admin PIN to view the balance and apply it toward this sale.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <PaymentInput icon={<Coins className="w-4 h-4" />} label="Cash" value={cash} onChange={setCash} disabled={loading} />
                <PaymentInput icon={<CreditCard className="w-4 h-4" />} label="EFT" value={eft} onChange={setEft} disabled={loading} />
                {showBusinessLoanLeg && (
                  <PaymentInput
                    icon={<Wallet className="w-4 h-4" />}
                    label="Business Loan"
                    value={businessLoan}
                    onChange={setBusinessLoan}
                    disabled={loading}
                    locked={isLocked}
                    highlight={showBusinessLoanLeg}
                    onUnlockClick={() => setPinModalOpen(true)}
                  />
                )}
              </div>

              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-xs" style={{ color: '#6C757D' }}>
                  <span>Payment Total</span>
                  <span className="font-mono">R {paymentTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium" style={{ color: remaining.isZero() ? '#217346' : '#DC3545' }}>
                  <span>{remaining.isZero() ? 'Fully Covered' : remaining.lessThan(0) ? 'Over-payment' : 'Remaining (Must be R 0.00)'}</span>
                  <span className="font-mono">{remaining.isZero() ? '✓' : `R ${remaining.abs().toFixed(2)}`}</span>
                </div>
              </div>

              {error && <p className="text-xs" style={{ color: '#DC3545' }}>{error}</p>}
            </div>
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={loading}
              disabled={paymentTotal.isZero() || !remaining.isZero() || isLocked && businessLoanAmt.greaterThan(0)}
              onClick={handleSubmit}
            >
              Process Full Payment
            </Btn>
          </RpxDialogFooter>
        </RpxDialogContent>
      </Dialog>

      {pinModalOpen && sale.customerId && (
        <AdminPinUnlockModal
          customerId={sale.customerId}
          onClose={() => setPinModalOpen(false)}
          onUnlocked={(summary) => {
            setUnlockedSummary(summary)
            const suggested = Decimal.min(new Decimal(summary.outstanding), pendingAmount)
            setBusinessLoan(suggested.toFixed(2))
            setPinModalOpen(false)
          }}
        />
      )}
    </>
  )
}
