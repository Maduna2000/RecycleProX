import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { registryPrisma } from '@/lib/db/registryPrisma'
import logger from '@/lib/logger'
import { authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

// Server-to-server only — polled by the Portal's System Health page to
// show whether Web is reachable and how its database is responding.
export async function GET(req: NextRequest) {
  if (!authorizeInternalRequest(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const start = Date.now()
  try {
    const [tenantCount] = await Promise.all([registryPrisma.tenant.count(), registryPrisma.$queryRaw`SELECT 1`])
    return NextResponse.json({ ok: true, dbLatencyMs: Date.now() - start, tenantCount })
  } catch (err) {
    logger.error({ err }, 'Internal health check failed')
    return NextResponse.json({ ok: false, dbLatencyMs: Date.now() - start, tenantCount: null }, { status: 503 })
  }
}
