import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { prisma } from '@/lib/db/prisma'

// ONE-TIME USE — read-only data-integrity check. There is no separate
// casual table — casual customers are Customer rows with
// customerType='casual'. First pass found 264 total, 0 casual, 264
// account. This pass checks the audit trail for actual casual->account
// UPDATE transitions (who/when/how many) to distinguish "always been this
// way" from "something changed it". Delete after use.
export async function GET(req: Request) {
  const { response } = await requireRole(['admin'])
  if (response) return response

  const result = await runWithRequestTenant(req, async () => {
    const totalCustomers = await prisma.customer.count()
    const casualCount = await prisma.customer.count({ where: { customerType: 'casual' } })
    const accountCount = await prisma.customer.count({ where: { customerType: 'account' } })

    const totalCustomerInserts = await prisma.auditLog.count({
      where: { tableName: 'Customer', action: 'INSERT' },
    })

    const customerUpdateLogs = await prisma.auditLog.findMany({
      where: { tableName: 'Customer', action: 'UPDATE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, recordId: true, changedById: true, oldValues: true, newValues: true, createdAt: true },
    })

    type OldNew = { customerType?: string }
    const casualToAccountTransitions = customerUpdateLogs.filter((log) => {
      const oldType = (log.oldValues as OldNew | null)?.customerType
      const newType = (log.newValues as OldNew | null)?.customerType
      return oldType === 'casual' && newType === 'account'
    })

    const userIds = Array.from(new Set(casualToAccountTransitions.map((l) => l.changedById).filter((v): v is string => !!v)))
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, fullName: true } })
      : []
    const userMap = new Map(users.map((u) => [u.id, `${u.username} (${u.fullName})`]))

    const byUser: Record<string, number> = {}
    const byMinute: Record<string, number> = {}
    casualToAccountTransitions.forEach((log) => {
      const label = log.changedById ? (userMap.get(log.changedById) ?? log.changedById) : 'unknown/system'
      byUser[label] = (byUser[label] ?? 0) + 1
      const minuteKey = new Date(log.createdAt).toISOString().slice(0, 16)
      byMinute[minuteKey] = (byMinute[minuteKey] ?? 0) + 1
    })

    const serialize = (log: (typeof casualToAccountTransitions)[number]) => ({
      id: log.id.toString(),
      recordId: log.recordId,
      changedBy: log.changedById ? (userMap.get(log.changedById) ?? log.changedById) : 'unknown/system',
      oldValues: log.oldValues,
      newValues: log.newValues,
      createdAt: log.createdAt,
    })

    return {
      totalCustomers,
      casualCount,
      accountCount,
      totalCustomerInsertAuditLogs: totalCustomerInserts,
      totalCustomerUpdateAuditLogs: customerUpdateLogs.length,
      casualToAccountTransitionCount: casualToAccountTransitions.length,
      casualToAccountByUser: byUser,
      casualToAccountByMinute: byMinute,
      firstFewTransitions: casualToAccountTransitions.slice(0, 5).map(serialize),
      lastFewTransitions: casualToAccountTransitions.slice(-5).map(serialize),
    }
  })

  return NextResponse.json(result)
}
