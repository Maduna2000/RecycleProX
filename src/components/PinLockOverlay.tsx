'use client'

import { useEffect, useCallback, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { usePinLockStore } from '@/stores/pinLockStore'
import { Lock, Delete, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody } from '@/components/rpx'

// A hung request (dead connection, slow network) must not leave the modal
// stuck forever with no feedback — abort and let the user retry.
const VERIFY_PIN_TIMEOUT_MS = 10_000

const INACTIVITY_MS = 5 * 60 * 1000 // 5 minutes

export function PinLockOverlay({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const { isLocked, failedPinAttempts, lock, unlock, incrementFailedAttempts, updateLastActivity, lastActivity } = usePinLockStore()
  const [verifying, setVerifying] = useState(false)

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
    if (!session?.user?.id || verifying) return

    setVerifying(true)
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), VERIFY_PIN_TIMEOUT_MS)

    try {
      const res = await fetch('/api/users/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        signal: timeout.signal,
      })

      if (res.ok) {
        unlock()
        return
      }

      // A real "wrong PIN" response from the server — this counts toward
      // the 3-attempt auto-logout. Anything else (network error, timeout,
      // 5xx) below is a failed *request*, not a failed *PIN*, and must not
      // count against the user or lock them out for a connectivity blip.
      if (res.status === 401) {
        incrementFailedAttempts()
        if (failedPinAttempts + 1 >= 3) {
          await signOut({ callbackUrl: '/login' })
          return
        }
      } else {
        toast.error('Could not verify PIN — please try again')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Request timed out — please try again')
      } else {
        toast.error('Network error — please check your connection and try again')
      }
    } finally {
      clearTimeout(timer)
      setVerifying(false)
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

            <PinPad onSubmit={handlePin} disabled={verifying} />
          </RpxDialogBody>
        </RpxDialogContent>
      </Dialog>
    </>
  )
}

function PinPad({ onSubmit, disabled }: { onSubmit: (pin: string) => void; disabled?: boolean }) {
  const [localPin, setLocalPin] = useState('')

  // Once submitted, the pin only actually clears when verification finishes
  // (disabled flips back to false) — clearing it eagerly (the old behavior)
  // let the user re-enter and fire a second, concurrent verify-pin request
  // while the first was still in flight, which is exactly what made the
  // modal feel unresponsive under a slow/flaky connection.
  useEffect(() => {
    if (!disabled) setLocalPin('')
  }, [disabled])

  function press(d: string) {
    if (disabled || localPin.length >= 4) return
    const next = localPin + d
    setLocalPin(next)
    if (next.length === 4) {
      setTimeout(() => onSubmit(next), 100)
    }
  }

  function backspace() {
    if (disabled) return
    setLocalPin((p: string) => p.slice(0, -1))
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div>
      <div className="flex justify-center gap-3 mb-4" role="status" aria-label={disabled ? 'Verifying PIN' : `${localPin.length} of 4 digits entered`}>
        {disabled ? (
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: colors.action }} aria-hidden="true" />
        ) : (
          [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                width: 12, height: 12, borderRadius: '50%',
                border: `2px solid ${i < localPin.length ? colors.action : '#D0D0D0'}`,
                background: i < localPin.length ? colors.action : 'transparent',
              }}
            />
          ))
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {digits.map((d, i) => {
          if (d === '') return <div key={i} />
          if (d === 'del') return (
            <Btn key={i} onClick={backspace} disabled={disabled} title="Backspace" style={{ height: 44, justifyContent: 'center' }}>
              <Delete className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">Backspace</span>
            </Btn>
          )
          return (
            <Btn key={i} onClick={() => press(d)} disabled={disabled} style={{ height: 44, fontSize: 15, fontWeight: 700, justifyContent: 'center' }}>
              {d}
            </Btn>
          )
        })}
      </div>
    </div>
  )
}
