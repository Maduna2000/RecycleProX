'use client'

import { useState } from 'react'
import { Delete, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RpxDialogContent, RpxDialogHeader, RpxDialogBody } from '@/components/rpx'

type User = { id: string; fullName: string; username: string }

// Two-step enter-then-confirm PIN pad — a typo in a 4-digit PIN is otherwise
// invisible (it's hashed immediately, never shown back), so a mismatch here
// catches it before it's saved rather than after someone can't unlock with it.
export function SetPinModal({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(confirmedPin: string) {
    setLoading(true)
    const res = await fetch(`/api/users/${user.id}/set-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: confirmedPin }),
    })
    setLoading(false)
    if (res.ok) {
      toast.success(`Personal PIN set for ${user.fullName}`)
      onSuccess()
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setError(j.error ?? 'Failed to set PIN')
      setStep('enter')
      setFirstPin('')
      setPin('')
    }
  }

  function press(d: string) {
    if (loading || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length < 4) return

    if (step === 'enter') {
      setFirstPin(next)
      setPin('')
      setStep('confirm')
      setError(null)
      return
    }

    // step === 'confirm'
    if (next !== firstPin) {
      setError('PINs did not match — try again')
      setStep('enter')
      setFirstPin('')
      setPin('')
      return
    }
    submit(next)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={340}>
        <RpxDialogHeader title={`Set PIN — ${user.username}`} icon={KeyRound} onClose={onClose} />
        <RpxDialogBody>
          <div className="text-center">
            <p className="text-xs mb-4" style={{ color: '#6C757D' }}>
              {step === 'enter'
                ? `Enter a new 4-digit PIN for ${user.fullName}.`
                : 'Re-enter the PIN to confirm.'}
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
