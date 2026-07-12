'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

      {blocking && (
        <div className="fixed inset-0 z-[9999] bg-gray-900/95 backdrop-blur flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              {status.state === 'blocked'
                ? <ShieldAlert className="w-7 h-7 text-red-600" />
                : <WifiOff className="w-7 h-7 text-red-600" />}
            </div>

            {status.state === 'blocked' ? (
              <>
                <p className="font-semibold text-gray-900">Access blocked</p>
                <p className="text-sm text-gray-500 mt-1 mb-6">
                  {status.reason ?? 'Your subscription or company account is not currently active.'}
                  {' '}Contact your administrator to resolve this.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900">Read-only mode</p>
                <p className="text-sm text-gray-500 mt-1 mb-6">
                  Renovo Pro has been offline for over {status.offlineGraceDays ?? 7} days and can no longer
                  verify your license. Reconnect to the internet to resume normal operation.
                </p>
              </>
            )}

            <Button
              className="w-full"
              onClick={async () => {
                if (!window.electronAPI?.getLicenseStatus) return
                const result = await window.electronAPI.getLicenseStatus()
                setStatus(result)
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
