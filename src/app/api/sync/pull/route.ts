import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from '@/lib/logger'
import { validateDeviceToken, DeviceAuthError } from '@/lib/services/deviceAuthClient'
import { pullChanges } from '@/lib/services/syncService'

export async function GET(req: NextRequest) {
  const deviceToken = req.nextUrl.searchParams.get('deviceToken')
  const tableName = req.nextUrl.searchParams.get('tableName')
  const since = req.nextUrl.searchParams.get('since')

  if (!deviceToken || !tableName) {
    return NextResponse.json({ error: 'deviceToken and tableName are required' }, { status: 400 })
  }

  let license
  try {
    license = await validateDeviceToken(deviceToken)
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
    const sinceDate = since ? new Date(since) : new Date(0)
    const records = await pullChanges(license.schemaName, license.companySlug, tableName, sinceDate)
    return NextResponse.json({ records, cursor: new Date().toISOString() })
  } catch (err) {
    logger.error({ err }, 'Sync pull failed')
    return NextResponse.json({ error: 'Sync pull failed' }, { status: 500 })
  }
}
