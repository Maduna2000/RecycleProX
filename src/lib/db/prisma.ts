import { PrismaClient } from '@prisma/client'
import logger from '@/lib/logger'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Audit log middleware — intercepts all writes on User model
prisma.$use(async (params, next) => {
  const writeModels = ['User']
  const writeActions = ['create', 'update', 'delete']

  if (writeModels.includes(params.model ?? '') && writeActions.includes(params.action)) {
    let oldValues: Record<string, unknown> | null = null

    if (params.action === 'update' && params.args.where) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oldValues = await (prisma as any)[params.model!.charAt(0).toLowerCase() + params.model!.slice(1)].findUnique({
          where: params.args.where,
        })
      } catch {
        // best-effort
      }
    }

    const result = await next(params)

    const actionMap: Record<string, string> = {
      create: 'INSERT',
      update: 'UPDATE',
      delete: 'DELETE',
    }

    setImmediate(async () => {
      try {
        await prisma.auditLog.create({
          data: {
            tableName: params.model ?? 'unknown',
            recordId: result?.id ? String(result.id) : 'unknown',
            action: actionMap[params.action] as import('@prisma/client').AuditAction,
            oldValues: oldValues ? (oldValues as object) : undefined,
            newValues: result ? (result as object) : undefined,
            rowHash: '',
          },
        })
      } catch (err) {
        logger.error({ err }, 'Audit log write failed')
      }
    })

    return result
  }

  return next(params)
})

export default prisma
