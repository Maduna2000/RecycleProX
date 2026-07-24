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
