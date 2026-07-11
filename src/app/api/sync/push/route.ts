import { NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { SyncPushSchema } from '@/lib/schemas/sync'
import { validateDeviceToken, DeviceAuthError } from '@/lib/services/deviceAuthClient'
import { applySyncPush } from '@/lib/services/syncService'

// Device-token authenticated (not a NextAuth session — Desktop's background
// sync process has no interactive login for this). See
// src/lib/services/deviceAuthClient.ts for why validation calls back to the
// Portal rather than checking a local Device table.
export async function POST(req: Request) {
  const body = await req.json()
  const parsed = SyncPushSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let license
  try {
    license = await validateDeviceToken(parsed.data.deviceToken)
  } catch (err) {
    if (err instanceof DeviceAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    throw err
  }

  if (!license.allowed || !license.schemaName) {
    return NextResponse.json({ error: license.reason ?? 'Sync not allowed' }, { status: 403 })
  }

  try {
    const results = await applySyncPush(license.schemaName, license.companySlug, parsed.data.records)
    return NextResponse.json({ results })
  } catch (err) {
    logger.error({ err }, 'Sync push failed')
    return NextResponse.json({ error: 'Sync push failed' }, { status: 500 })
  }
}
