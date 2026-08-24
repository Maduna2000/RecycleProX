'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CreditCard, KeyRound, ShieldAlert, WifiOff, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

// Polls electron/licenseManager.js's getAccessState() (via preload.js's
// IPC bridge) and surfaces the offline-grace UI states the SaaS plan calls
// for: a dismissible warning banner approaching the grace deadline, a
// dismissible subscription-expiry countdown banner (computed from cached
// data — see licenseManager.js's computeSubscriptionCountdown, no network
// needed), and a blocking overlay once grace has expired or the Portal has
// reported the device as no longer allowed — with an activation-key form
// when that block is a lapsed subscription specifically (canReactivate).
// No-op outside Electron (window.electronAPI is undefined on Web/Vercel),
// so this never affects the Web build — SubscriptionGate.tsx is that
// build's equivalent, reading live from the Tenant row instead.
const POLL_INTERVAL_MS = 60_000

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [graceBannerDismissed, setGraceBannerDismissed] = useState(false)
  const [countdownBannerDismissed, setCountdownBannerDismissed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [code, setCode] = useState('')
  const [reactivating, setReactivating] = useState(false)
  const [reactivateError, setReactivateError] = useState<string | null>(null)

  useEffect(() => {
    // `window` itself is safe to touch here (effects only run client-side),
    // but referencing it in the render body below would throw during Next's
    // server render of this 'use client' component — hence gating render on
    // `status`, which only ever gets set from inside this effect.
    const api = window.electronAPI
    if (!api?.getLicenseStatus) return

    let cancelled = false
    async function check() {
      try {
        const result = await api!.getLicenseStatus()
        if (!cancelled) setStatus(result)
      } catch {
        // IPC call itself failing is not a license verdict — leave status as-is.
      }
    }

    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!status) return <>{children}</>

  const blocking = status.state === 'blocked' || status.state === 'read_only'
  const showCountdownBanner =
    !blocking && !countdownBannerDismissed && status.subscriptionDaysUntilDue != null

  async function submitReactivation(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || !window.electronAPI?.recheckLicense) return
    setReactivating(true)
    setReactivateError(null)
    try {
      const res = await fetch('/api/subscription/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.allowed) {
        setReactivateError(typeof data.error === 'string' ? data.error : 'Invalid activation key')
        return
      }
      // The reactivate call above updates the web-facing Tenant row, but
      // licenseManager's cache only updates via activate()/heartbeat() —
      // force one now so getAccessState() reflects the unlock immediately
      // instead of waiting for the next 8h background heartbeat.
      const fresh = await window.electronAPI.recheckLicense()
      setStatus(fresh)
    } catch {
      setReactivateError('Could not reach the licensing server — try again shortly')
    } finally {
      setReactivating(false)
    }
  }

  return (
    <>
      {children}

      {status.state === 'grace_warning' && !graceBannerDismissed && (
        <div className="fixed top-0 inset-x-0 z-[9998] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Renovo Pro has been offline for {Math.floor(status.daysSinceCheck ?? 0)} day(s).
            Reconnect to the internet within {Math.max(0, Math.ceil((status.offlineGraceDays ?? 7) - (status.daysSinceCheck ?? 0)))} day(s)
            to avoid switching to read-only mode.
          </span>
          <button
            onClick={() => setGraceBannerDismissed(true)}
            className="ml-2 shrink-0 hover:opacity-70"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showCountdownBanner && (
        <div className="fixed top-0 inset-x-0 z-[9997] bg-purple-50 text-purple-800 border-b border-purple-200 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow">
          <CreditCard className="w-4 h-4 shrink-0" />
          <span>
            {status.subscriptionDaysUntilDue === 0
              ? 'Your subscription expires today.'
              : `Your subscription expires in ${status.subscriptionDaysUntilDue} day${status.subscriptionDaysUntilDue === 1 ? '' : 's'}.`}
            {' '}Renew to avoid losing access.
          </span>
          <button
            onClick={() => setCountdownBannerDismissed(true)}
            className="ml-2 shrink-0 hover:opacity-70"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controlled + no-op onOpenChange: this gate must not be dismissable via
       * Escape/outside-click — it only closes once a Retry (or a redeemed
       * activation key) confirms the license is valid again. Using the real
       * Dialog primitive still gets us role="dialog", aria-modal, and a real
       * focus trap for free. */}
      <Dialog open={blocking} modal onOpenChange={() => {}}>
        <RpxDialogContent maxWidth={380} style={{ textAlign: 'center' }}>
          <RpxDialogHeader
            title={status.state === 'blocked' ? 'Access Blocked' : 'Read-Only Mode'}
            icon={status.state === 'blocked' ? ShieldAlert : WifiOff}
          />
          <RpxDialogBody>
            <div
              className="rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ width: 48, height: 48, background: colors.dangerBg }}
            >
              {status.state === 'blocked'
                ? <ShieldAlert style={{ width: 22, height: 22, color: colors.danger }} />
                : <WifiOff style={{ width: 22, height: 22, color: colors.danger }} />}
            </div>

            {status.state === 'blocked' ? (
              <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
                {status.reason ?? 'Your subscription or company account is not currently active.'}
                {status.canReactivate
                  ? ' Enter the activation key your account manager gave you after payment to continue.'
                  : ' Contact your administrator to resolve this.'}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
                Renovo Pro has been offline for over {status.offlineGraceDays ?? 7} days and can no longer
                verify your license. Reconnect to the internet to resume normal operation.
              </p>
            )}

            {status.state === 'blocked' && status.canReactivate ? (
              <form onSubmit={submitReactivation}>
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
                {reactivateError && (
                  <p style={{ fontSize: 11, color: colors.danger, marginBottom: 8 }}>{reactivateError}</p>
                )}
                <Btn
                  type="submit"
                  variant="primary"
                  loading={reactivating}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <KeyRound style={{ width: 14, height: 14 }} />
                  Unlock
                </Btn>
              </form>
            ) : (
              <Btn
                variant="primary"
                loading={retrying}
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={async () => {
                  if (!window.electronAPI?.recheckLicense) return
                  setRetrying(true)
                  try {
                    const result = await window.electronAPI.recheckLicense()
                    setStatus(result)
                  } finally {
                    setRetrying(false)
                  }
                }}
              >
                Retry
              </Btn>
            )}
          </RpxDialogBody>
          {status.state === 'blocked' && status.canReactivate && (
            <RpxDialogFooter>
              <p style={{ fontSize: 10, color: colors.textSecondary }}>
                Need a key? Contact your platform account manager to renew.
              </p>
            </RpxDialogFooter>
          )}
        </RpxDialogContent>
      </Dialog>
    </>
  )
}
