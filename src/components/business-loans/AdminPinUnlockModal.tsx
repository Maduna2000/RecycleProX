'use client'

import { useState } from 'react'
import { Lock, Delete } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RpxDialogContent, RpxDialogHeader, RpxDialogBody } from '@/components/rpx'

export type BusinessLoanFullSummary = {
  hasOutstanding: boolean
  totalAdvanced: string
  totalRepaid: string
  outstanding: string
  loans: Array<{ id: string; refNumber: string; principalAmount: string; balanceAmount: string; status: string; createdAt: string }>
}

// Admin-PIN-gated reveal for a hidden business loan balance. Mirrors
// PinLockOverlay's PinPad UI, but wrapped as a one-off dialog rather than a
// full-screen session lock, and never signs anyone out on failure — it just
// reports the wrong PIN and lets the caller try again (server-side lockout
// after 3 failures is enforced by /api/business-loans/verify-pin).
export function AdminPinUnlockModal({
  customerId,
  onClose,
  onUnlocked,
}: {
  customerId: string
  onClose: () => void
  onUnlocked: (summary: BusinessLoanFullSummary) => void
}) {
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(value: string) {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/business-loans/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, pin: value }),
    })
    setLoading(false)
    setPin('')

    if (res.ok) {
      onUnlocked(await res.json())
      return
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    setError(j.error ?? 'Incorrect PIN')
  }

  function press(d: string) {
    if (loading || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) submit(next)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={340}>
        <RpxDialogHeader title="Admin PIN Required" icon={Lock} onClose={onClose} />
        <RpxDialogBody>
          <div className="text-center">
            <p className="text-xs mb-4" style={{ color: '#6C757D' }}>
              This customer has a pending business loan. Enter an admin&apos;s PIN to view the balance
              and complete this split payment.
            </p>

            <div className="flex justify-center gap-3 mb-5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full border-2"
                  style={{
                    background: i < pin.length ? '#059669' : 'transparent',
                    borderColor: i < pin.length ? '#059669' : '#D1D5DB',
                  }}
                />
              ))}
            </div>

            {error && <p className="text-xs mb-3" style={{ color: '#DC3545' }}>{error}</p>}

            <div className="grid grid-cols-3 gap-2 max-w-[220px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((d, i) => {
                if (d === '') return <div key={i} />
                if (d === 'del') {
                  return (
                    <Button key={i} variant="ghost" className="h-12 text-gray-600" disabled={loading} onClick={() => setPin((p) => p.slice(0, -1))}>
                      <Delete className="w-4 h-4" />
                    </Button>
                  )
                }
                return (
                  <Button key={i} variant="outline" className="h-12 text-lg font-semibold" disabled={loading} onClick={() => press(d)}>
                    {d}
                  </Button>
                )
              })}
            </div>
          </div>
        </RpxDialogBody>
      </RpxDialogContent>
    </Dialog>
  )
}
