'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, WifiOff, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody } from '@/components/rpx'

// Polls electron/licenseManager.js's getAccessState() (via preload.js's
// IPC bridge) and surfaces the three offline-grace UI states the SaaS plan
// calls for: a dismissible warning banner approaching the grace deadline,
// and a blocking overlay once grace has expired or the Portal has reported
// the device as no longer allowed. No-op outside Electron (window.electronAPI
// is undefined on Web/Vercel), so this never affects the Web build.
const POLL_INTERVAL_MS = 60_000

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [retrying, setRetrying] = useState(false)

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

  return (
    <>
      {children}

      {status.state === 'grace_warning' && !bannerDismissed && (
        <div className="fixed top-0 inset-x-0 z-[9998] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Renovo Pro has been offline for {Math.floor(status.daysSinceCheck ?? 0)} day(s).
            Reconnect to the internet within {Math.max(0, Math.ceil((status.offlineGraceDays ?? 7) - (status.daysSinceCheck ?? 0)))} day(s)
            to avoid switching to read-only mode.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="ml-2 shrink-0 hover:opacity-70"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controlled + no-op onOpenChange: this gate must not be dismissable via
       * Escape/outside-click — it only closes once a Retry confirms the license
       * is valid again. Using the real Dialog primitive still gets us
       * role="dialog", aria-modal, and a real focus trap for free. */}
      <Dialog open={blocking} modal onOpenChange={() => {}}>
        <RpxDialogContent maxWidth={360} style={{ textAlign: 'center' }}>
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
                {' '}Contact your administrator to resolve this.
              </p>
            ) : (
              <p style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 16 }}>
                Renovo Pro has been offline for over {status.offlineGraceDays ?? 7} days and can no longer
                verify your license. Reconnect to the internet to resume normal operation.
              </p>
            )}

            <Btn
              variant="primary"
              loading={retrying}
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={async () => {
                if (!window.electronAPI?.getLicenseStatus) return
                setRetrying(true)
                try {
                  const result = await window.electronAPI.getLicenseStatus()
                  setStatus(result)
                } finally {
                  setRetrying(false)
                }
              }}
            >
              Retry
            </Btn>
          </RpxDialogBody>
        </RpxDialogContent>
      </Dialog>
    </>
  )
}
