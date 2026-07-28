'use client'

import { useEffect, useCallback, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { usePinLockStore } from '@/stores/pinLockStore'
import { Lock, Delete } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody } from '@/components/rpx'

const INACTIVITY_MS = 5 * 60 * 1000 // 5 minutes

export function PinLockOverlay({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const { isLocked, failedPinAttempts, lock, unlock, incrementFailedAttempts, updateLastActivity, lastActivity } = usePinLockStore()

  // Track activity
  const resetTimer = useCallback(() => {
    updateLastActivity()
  }, [updateLastActivity])

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, resetTimer))
  }, [resetTimer])

  // Check inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLocked && Date.now() - lastActivity > INACTIVITY_MS) {
        lock()
      }
    }, 10_000)
    return () => clearInterval(interval)
  }, [isLocked, lastActivity, lock])

  async function handlePin(pin: string) {
    if (!session?.user?.id) return

    const res = await fetch('/api/users/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })

    if (res.ok) {
      unlock()
    } else {
      incrementFailedAttempts()
      if (failedPinAttempts + 1 >= 3) {
        await signOut({ callbackUrl: '/login' })
      }
    }
  }

  const attemptsLeft = 3 - failedPinAttempts

  return (
    <>
      {children}
      {/* Controlled + no-op onOpenChange: this dialog must not be dismissable
       * via Escape/outside-click — it only closes via a correct PIN (unlock()).
       * Using the real Dialog primitive still gets us role="dialog", aria-modal,
       * and a real focus trap for free, which the old hand-rolled fixed div did not. */}
      <Dialog open={isLocked} modal onOpenChange={() => {}}>
        <RpxDialogContent maxWidth={320} style={{ textAlign: 'center' }}>
          <RpxDialogHeader title="Session Locked" icon={Lock} />
          <RpxDialogBody>
            <div
              className="rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ width: 48, height: 48, background: colors.actionBg }}
            >
              <div
                className="rounded-full flex items-center justify-center text-white font-bold"
                style={{ width: 34, height: 34, background: colors.action, fontSize: 15 }}
              >
                {session?.user?.fullName?.charAt(0) ?? '?'}
              </div>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{session?.user?.fullName}</p>
            <p style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, marginBottom: 16 }}>
              Enter your PIN to continue
            </p>

            {attemptsLeft < 3 && (
              <p style={{ fontSize: 11, color: colors.danger, marginBottom: 10 }}>
                {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
              </p>
            )}

            <PinPad onSubmit={handlePin} />
          </RpxDialogBody>
        </RpxDialogContent>
      </Dialog>
    </>
  )
}

function PinPad({ onSubmit }: { onSubmit: (pin: string) => void }) {
  const [localPin, setLocalPin] = useState('')

  function press(d: string) {
    if (localPin.length >= 4) return
    const next = localPin + d
    setLocalPin(next)
    if (next.length === 4) {
      setTimeout(() => { onSubmit(next); setLocalPin('') }, 100)
    }
  }

  function backspace() {
    setLocalPin((p: string) => p.slice(0, -1))
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div>
      <div className="flex justify-center gap-3 mb-4" role="status" aria-label={`${localPin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              width: 12, height: 12, borderRadius: '50%',
              border: `2px solid ${i < localPin.length ? colors.action : '#D0D0D0'}`,
              background: i < localPin.length ? colors.action : 'transparent',
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {digits.map((d, i) => {
          if (d === '') return <div key={i} />
          if (d === 'del') return (
            <Btn key={i} onClick={backspace} title="Backspace" style={{ height: 44, justifyContent: 'center' }}>
              <Delete className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">Backspace</span>
            </Btn>
          )
          return (
            <Btn key={i} onClick={() => press(d)} style={{ height: 44, fontSize: 15, fontWeight: 700, justifyContent: 'center' }}>
              {d}
            </Btn>
          )
        })}
      </div>
    </div>
  )
}
