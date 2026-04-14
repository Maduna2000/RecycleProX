import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/audit-log
 * Query params:
 *   table     — filter by tableName
 *   action    — INSERT | UPDATE | DELETE | VOID | LOGIN | LOGOUT
 *   recordId  — filter by specific record UUID
 *   userId    — filter by changedById
 *   from      — YYYY-MM-DD
 *   to        — YYYY-MM-DD
 *   page      — default 1
 *   pageSize  — default 50, max 100
 *
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
    const where = {
      ...(table    && { tableName:   table }),
      ...(action   && { action:      action as 'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT' }),
      ...(recordId && { recordId }),
      ...(userId   && { changedById: userId }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: from }),
          ...(to   && { lte: to }),
        },
      }),
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * pageSize,
        take:  pageSize,
      }),
      prisma.auditLog.count({ where }),
    ])

    // Resolve user names for all changedById values in one batch query
    const userIds = Array.from(new Set(items.map((i) => i.changedById).filter(Boolean))) as string[]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, username: true } })
      : []
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.fullName || u.username]))

    // Serialize BigInt id to string and attach user name
    const serialized = items.map((item) => ({
      ...item,
      id:             item.id.toString(),
      changedByName:  item.changedById ? (userMap[item.changedById] ?? null) : null,
    }))

    return NextResponse.json({ items: serialized, total, page, pageSize })
  } catch (err) {
    logger.error({ err }, 'GET /api/audit-log failed')
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
