import { NextResponse } from 'next/server'
import { checkDatabaseConnection } from '@/lib/db/prisma'

// Used by the offline/online detection engine (src/hooks/useOnlineStatus.ts)
// to decide whether to queue mutations locally. Must actually round-trip to
// Postgres, not just confirm this Next.js process is alive — for the
// desktop deployment (Electron pinging its own local child-process server
// at 127.0.0.1), the local process is always reachable even when ITS
// upstream connection to production Postgres is down, so a DB-less check
// would never detect a real internet outage.
export async function GET() {
  const dbOk = await checkDatabaseConnection()
  return NextResponse.json({ ok: dbOk, ts: Date.now() }, {
    status: dbOk ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
