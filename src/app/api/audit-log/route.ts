import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { listAuditLogs } from '@/lib/services/auditLogService'

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

  const from = fromStr ? (() => { const d = new Date(fromStr); d.setHours(0,0,0,0); return d })() : undefined
  const to   = toStr   ? (() => { const d = new Date(toStr);   d.setHours(23,59,59,999); return d })() : undefined

  try {
    const result = await listAuditLogs({
      table,
      action: action as 'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT' | undefined,
      recordId,
      userId,
      from,
      to,
      page,
      pageSize,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'GET /api/audit-log failed')
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
