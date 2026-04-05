import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import type { SetFloatInput } from '@/lib/schemas/float'

export async function setFloat(data: SetFloatInput, userId: string) {
  const floatDate = new Date(data.floatDate)
  floatDate.setHours(0, 0, 0, 0)

  const record = await prisma.cashFloat.upsert({
    where: { floatDate },
    create: {
      floatDate,
      openingAmount:   new Decimal(data.openingAmount).toFixed(2),
      notes:           data.notes,
      createdByUserId: userId,
    },
    update: {
      openingAmount: new Decimal(data.openingAmount).toFixed(2),
      notes:         data.notes,
    },
  })
  logger.info({ floatId: record.id, floatDate: data.floatDate, userId }, 'CashFloat set')
  return record
}

export async function getTodayFloat() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return prisma.cashFloat.findUnique({ where: { floatDate: today } })
}

export async function getFloatForDate(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return prisma.cashFloat.findUnique({ where: { floatDate: d } })
}

export async function listFloats(limit = 30) {
  return prisma.cashFloat.findMany({
    orderBy: { floatDate: 'desc' },
    take: limit,
  })
}
