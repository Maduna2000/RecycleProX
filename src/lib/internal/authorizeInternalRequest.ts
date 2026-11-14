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
export type ReleaseUploadAuthReason =
  | 'ok'
  | 'not-configured'   // DESKTOP_RELEASE_UPLOAD_SECRET is empty/unset on THIS deployment
  | 'same-as-shared'   // equal to INTERNAL_API_SHARED_SECRET — refused on purpose
  | 'missing-header'   // the caller sent no x-release-secret
  | 'mismatch'         // sent, but not equal to the configured value

export interface ReleaseUploadAuthCheck {
  ok: boolean
  reason: ReleaseUploadAuthReason
  // Lengths only (never the values) so a log line can tell "pasted with a
  // trailing space / line break" or "wrong value" apart without exposing a secret.
  providedLength: number
  expectedLength: number
}

// Both sides are trimmed: HTTP clients and servers strip leading/trailing
// whitespace from header values, so a secret that was pasted into the Vercel
// dashboard or the GitHub secret with a trailing space or line break could
// otherwise never match the header that actually arrives.
export function checkReleaseUploadRequest(req: NextRequest): ReleaseUploadAuthCheck {
  const provided = (req.headers.get('x-release-secret') ?? '').trim()
  const expected = (process.env.DESKTOP_RELEASE_UPLOAD_SECRET ?? '').trim()
  const result = (ok: boolean, reason: ReleaseUploadAuthReason): ReleaseUploadAuthCheck => ({
    ok, reason, providedLength: provided.length, expectedLength: expected.length,
  })

  if (!expected) return result(false, 'not-configured')
  if (expected === (process.env.INTERNAL_API_SHARED_SECRET ?? '').trim()) return result(false, 'same-as-shared')
  if (!provided) return result(false, 'missing-header')
  if (provided.length !== expected.length) return result(false, 'mismatch')
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ? result(true, 'ok')
    : result(false, 'mismatch')
}

export function authorizeReleaseUploadRequest(req: NextRequest): boolean {
  return checkReleaseUploadRequest(req).ok
}
