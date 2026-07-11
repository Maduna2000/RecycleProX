import logger from '@/lib/logger'

export class DeviceAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'DeviceAuthError' }
}

export interface DeviceLicenseStatus {
  allowed: boolean
  reason?: string
  companySlug: string
  schemaName: string | null
  companyStatus: string
  subscriptionStatus: string | null
}

// Sync requests carry a deviceToken issued by the SaaS Portal (device
// activation lives entirely there — see the Portal's deviceService.ts).
// Web has no local copy of device state, so every sync call validates the
// token by calling back to the Portal's existing check-license endpoint
// rather than duplicating device rows here. This is a deliberate first-cut
// design: sync is a periodic background batch, not a page-load-latency-
// sensitive path, so the extra network hop is an acceptable trade-off for
// Phase 1 — flagged in the SaaS plan as a nuance worth revisiting once
// real device/sync load is observed.
export async function validateDeviceToken(deviceToken: string): Promise<DeviceLicenseStatus> {
  const baseUrl = process.env.RENOVO_PORTAL_BASE_URL
  const secret = process.env.INTERNAL_API_SHARED_SECRET
  if (!baseUrl || !secret) {
    throw new DeviceAuthError('RENOVO_PORTAL_BASE_URL / INTERNAL_API_SHARED_SECRET not configured')
  }

  const res = await fetch(`${baseUrl}/api/desktop/check-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceToken }),
  })

  if (!res.ok) {
    logger.warn({ status: res.status }, 'Device token validation failed')
    throw new DeviceAuthError('Invalid or unrecognised device token')
  }

  return res.json()
}
