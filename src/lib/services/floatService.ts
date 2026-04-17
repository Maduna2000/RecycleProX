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

/**
 * Returns the most recent CashFloat record strictly before the given date.
 * Used to carry forward the previous day's closing amount when no float is
 * manually set for today.
 */
export async function getMostRecentFloatBefore(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  return prisma.cashFloat.findFirst({
    where: { floatDate: { lt: d } },
    orderBy: { floatDate: 'desc' },
  })
}

/**
 * Write the closing amount on the CashFloat record for the given date.
 * Called by cashUpService.approveCashUp to record the declared cash as the closing balance.
 */
export async function updateClosingAmount(date: Date, amount: Decimal) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  // Only update if a float record exists for this date
  const existing = await prisma.cashFloat.findUnique({ where: { floatDate: d } })
  if (!existing) return

  await prisma.cashFloat.update({
    where: { floatDate: d },
    data:  { closingAmount: amount.toFixed(2) },
  })
  logger.info({ floatDate: d.toISOString(), closingAmount: amount.toFixed(2) }, 'CashFloat closing amount updated')
}
