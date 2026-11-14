import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

// Shared by every route under src/app/api/internal/* — these are
// server-to-server only (called by the Renovo Pro SaaS Portal), never
// reachable from a browser session, so they're shared-secret authenticated
// instead of session-based. Constant-time comparison to avoid a timing
// side-channel on the secret.
export function authorizeInternalRequest(req: NextRequest): boolean {
  const provided = req.headers.get('x-internal-secret') ?? ''
  const expected = process.env.INTERNAL_API_SHARED_SECRET ?? ''
  if (!expected || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

// Dedicated secret for the KPI export route (called by the sibling
// "golden-key-control-tower" app), kept separate from
// INTERNAL_API_SHARED_SECRET so that app's access is independently
// revocable/rotatable without affecting the Portal's. Same header name and
// constant-time comparison as authorizeInternalRequest for consistency.
export function authorizeKpiExportRequest(req: NextRequest): boolean {
  const provided = req.headers.get('x-internal-secret') ?? ''
  const expected = process.env.KPI_EXPORT_SHARED_SECRET ?? ''
  if (!expected || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

// Dedicated secret for publishing desktop installers to the update feed
// (POST /api/internal/desktop-release). Deliberately NOT INTERNAL_API_SHARED_SECRET:
// that one is also handed to every activated till (it ends up in each till's
// desktop.env), so any customer PC could otherwise publish an "update" that
// every other till would then download and run. This secret lives only in the
// CI environment (GitHub Actions) and in this app's server env — it must never
// be included in any runtimeConfig sent to a device. Different header name
// too, so the shared secret can never be accepted here by accident, and a
// configuration where both secrets are the same value is refused outright.
export function authorizeReleaseUploadRequest(req: NextRequest): boolean {
  const provided = req.headers.get('x-release-secret') ?? ''
  const expected = process.env.DESKTOP_RELEASE_UPLOAD_SECRET ?? ''
  if (!expected || expected === (process.env.INTERNAL_API_SHARED_SECRET ?? '')) return false
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}
