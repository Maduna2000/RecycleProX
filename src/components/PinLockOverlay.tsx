'use client'

import { useEffect, useCallback, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { usePinLockStore } from '@/stores/pinLockStore'
import { Lock, Delete } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

  if (!isLocked) return <>{children}</>

  const attemptsLeft = 3 - failedPinAttempts

  return (
    <>
      {children}
      <div className="fixed inset-0 z-[9999] bg-gray-900/95 backdrop-blur flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-lg">
              {session?.user?.fullName?.charAt(0) ?? '?'}
            </div>
          </div>
          <p className="font-semibold text-gray-900">{session?.user?.fullName}</p>
          <div className="flex items-center justify-center gap-1.5 mt-1 mb-6">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-sm text-gray-500">Session locked</p>
          </div>

          {attemptsLeft < 3 && (
            <p className="text-xs text-red-500 mb-3">{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining</p>
          )}

          <PinPad onSubmit={handlePin} />
        </div>
      </div>
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
      <div className="flex justify-center gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`w-3 h-3 rounded-full border-2 ${i < localPin.length ? 'bg-green-600 border-green-600' : 'border-gray-300'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {digits.map((d, i) => {
          if (d === '') return <div key={i} />
          if (d === 'del') return (
            <Button key={i} variant="ghost" className="h-12 text-gray-600" onClick={backspace}>
              <Delete className="w-4 h-4" />
            </Button>
          )
          return (
            <Button key={i} variant="outline" className="h-12 text-lg font-semibold" onClick={() => press(d)}>
              {d}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
