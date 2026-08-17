import { prisma } from '@/lib/db/prisma'

export interface AuditLogFilter {
  table?:    string
  action?:   'INSERT' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT'
  recordId?: string
  userId?:   string
  from?:     Date
  to?:       Date
  page?:     number
  pageSize?: number
}

export async function listAuditLogs(filter: AuditLogFilter = {}) {
  const { table, action, recordId, userId, from, to, page = 1, pageSize = 30 } = filter

  const where = {
    ...(table    && { tableName:   { equals: table, mode: 'insensitive' as const } }),
    ...(action   && { action }),
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
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  const userIds = Array.from(new Set(items.map((i) => i.changedById).filter(Boolean))) as string[]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, username: true } })
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.fullName || u.username]))

  const serialized = items.map((item) => ({
    ...item,
    id:            item.id.toString(),
    changedByName: item.changedById ? (userMap[item.changedById] ?? null) : null,
  }))

  return { items: serialized, total, page, pageSize }
}
