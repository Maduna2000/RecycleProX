'use client'

import { useState } from 'react'
import { X, Info, CheckCircle2, AlertTriangle, ShieldAlert, CreditCard, Wrench } from 'lucide-react'
import type { ActiveBanner } from '@/lib/services/bannerClient'

const STYLES: Record<ActiveBanner['type'], { bg: string; fg: string; icon: React.ElementType }> = {
  info:        { bg: 'bg-blue-50 border-blue-200',       fg: 'text-blue-800',    icon: Info },
  success:     { bg: 'bg-emerald-50 border-emerald-200', fg: 'text-emerald-800', icon: CheckCircle2 },
  warning:     { bg: 'bg-amber-50 border-amber-200',     fg: 'text-amber-800',   icon: AlertTriangle },
  danger:      { bg: 'bg-red-50 border-red-200',         fg: 'text-red-800',     icon: ShieldAlert },
  billing:     { bg: 'bg-purple-50 border-purple-200',   fg: 'text-purple-800',  icon: CreditCard },
  maintenance: { bg: 'bg-gray-50 border-gray-200',       fg: 'text-gray-800',    icon: Wrench },
}

// Renders whatever the Portal's platform admins have published for this
// company (see bannerClient.ts) — a subscription-status nudge, a
// maintenance notice, etc. Dismissal is per-session only (component state,
// no persistence); these are meant to be seen again next login, not
// permanently suppressed.
export function BannerBar({ banners }: { banners: ActiveBanner[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // LicenseGate already renders its own subscription-expiry countdown
  // banner inside Electron (computed offline from licenseManager.js's
  // cache) — this one comes from a live Server Component DB read, so
  // showing both here would just duplicate it.
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI
  const visible = banners.filter((b) => !dismissed.has(b.id) && !(isElectron && b.id === 'subscription-expiry-countdown'))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col shrink-0">
      {visible.map((b) => {
        const s = STYLES[b.type]
        return (
          <div key={b.id} className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${s.bg} ${s.fg}`}>
            <s.icon className="w-4 h-4 shrink-0" />
            <span className="font-medium">{b.title}</span>
            <span className="opacity-80">{b.message}</span>
            {b.ctaText && b.ctaLink && (
              <a href={b.ctaLink} target="_blank" rel="noreferrer" className="ml-2 shrink-0 underline">
                {b.ctaText}
              </a>
            )}
            {b.isDismissible && (
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(b.id))}
                className="ml-auto shrink-0 hover:opacity-70"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
