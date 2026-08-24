'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

interface SubscriptionGateProps {
  blocked: boolean
  dueDateLabel: string | null
  children: React.ReactNode
}

// The web counterpart of LicenseGate's blocking dialog. Deliberately a
// no-op inside Electron (window.electronAPI defined) — LicenseGate already
// covers this there, from licenseManager.js's offline-cached state, which
// this component's live `blocked` prop (a Server Component's DB read) can't
// match: it fails open on a connectivity hiccup rather than staying locked,
// the opposite of what a lapsed-subscription gate should do offline. Two
// gates independently deciding whether to show a blocking dialog would also
// just stack two modals on top of each other for no benefit.
export function SubscriptionGate({ blocked, dueDateLabel, children }: SubscriptionGateProps) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    setIsElectron(!!window.electronAPI)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/subscription/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.allowed) {
        setError(typeof data.error === 'string' ? data.error : 'Invalid activation key')
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the licensing server — try again shortly')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {children}

      <Dialog open={blocked && !isElectron} modal onOpenChange={() => {}}>
        <RpxDialogContent maxWidth={380} style={{ textAlign: 'center' }}>
          <RpxDialogHeader title="Subscription expired" icon={ShieldAlert} />
          <RpxDialogBody>
            <div
              className="rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ width: 48, height: 48, background: colors.dangerBg }}
            >
              <ShieldAlert style={{ width: 22, height: 22, color: colors.danger }} />
            </div>

            <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
              {dueDateLabel
                ? `Your Renovo Pro subscription expired on ${dueDateLabel} and access is now locked.`
                : 'Your Renovo Pro subscription has expired and access is now locked.'}
              {' '}Enter the activation key your account manager gave you after payment to continue.
            </p>

            <form onSubmit={submit}>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Activation key"
                autoFocus
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  fontSize: 13,
                  textAlign: 'center',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              />
              {error && (
                <p style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}>{error}</p>
              )}
              <Btn
                type="submit"
                variant="primary"
                loading={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <KeyRound style={{ width: 14, height: 14 }} />
                Unlock
              </Btn>
            </form>
          </RpxDialogBody>
          <RpxDialogFooter>
            <p style={{ fontSize: 10, color: colors.textSecondary }}>
              Need a key? Contact your platform account manager to renew.
            </p>
          </RpxDialogFooter>
        </RpxDialogContent>
      </Dialog>
    </>
  )
}
