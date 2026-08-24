'use client'

import { WifiOff } from 'lucide-react'
import { useOfflineStore } from '@/stores/offlineStore'
import { colors } from '@/lib/design-tokens'

/**
 * Shown on any page currently reading from the offline replica instead of a
 * live response, so a real-but-possibly-stale number is never mistaken for
 * live truth. Renders nothing while online — cheap to drop into any page
 * unconditionally. See the "Desktop offline mode" plan.
 */
export function OfflineDataBadge({ label = 'Offline — showing last-synced data' }: { label?: string }) {
  const isOnline = useOfflineStore((s) => s.isOnline)
  if (isOnline) return null

  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: colors.warningBg, color: colors.warning, border: `1px solid ${colors.warning}40`,
      }}
    >
      <WifiOff style={{ width: 11, height: 11 }} />
      {label}
    </span>
  )
}

/** Formats a response's `_offlineCachedAt` (set by responseCache.ts) as "as of HH:MM". */
export function formatCachedAtLabel(cachedAt: string | undefined): string | null {
  if (!cachedAt) return null
  const d = new Date(cachedAt)
  if (Number.isNaN(d.getTime())) return null
  return `as of ${d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
}
