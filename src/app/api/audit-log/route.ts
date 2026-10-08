import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { parseSASTDateRange } from '@/lib/utils/dayBounds'
import { listAuditLogs } from '@/lib/services/auditLogService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/audit-log
 * Query params: table, action, recordId, userId, from (YYYY-MM-DD), to, page, pageSize
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 })
  }

  const sp       = req.nextUrl.searchParams
  const table    = sp.get('table')    ?? undefined
  const action   = sp.get('action')   ?? undefined
  const recordId = sp.get('recordId') ?? undefined
  const userId   = sp.get('userId')   ?? undefined
  const fromStr  = sp.get('from')     ?? undefined
  const toStr    = sp.get('to')       ?? undefined
  const page     = Math.max(1, parseInt(sp.get('page')     ?? '1',  10))
  const pageSize = Math.min(100, parseInt(sp.get('pageSize') ?? '50', 10))

  const range = parseSASTDateRange(fromStr, toStr)
  if (!range) return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 })
  const { from, to } = range

  try {
    const result = await runWithRequestTenant(req, () => listAuditLogs({
      table,
      action: action as 'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT' | undefined,
      recordId,
      userId,
      from,
      to,
      page,
      pageSize,
    }))
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/audit-log failed')
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
