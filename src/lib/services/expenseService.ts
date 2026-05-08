import { prisma } from '@/lib/db/prisma'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import type { CreateExpenseInput, CreateExpenseTypeInput } from '@/lib/schemas/expense'

// ─── Ref number ───────────────────────────────────────────────────────────────

async function nextRef(): Promise<string> {
  const count = await prisma.expense.count()
  return `EXP-${String(count + 1).padStart(5, '0')}`
}

// ─── Expense Types ────────────────────────────────────────────────────────────

export async function createExpenseType(data: CreateExpenseTypeInput, userId: string) {
  const type = await prisma.expenseType.create({
    data: { ...data, },
  })
  logger.info({ expenseTypeId: type.id, userId }, 'ExpenseType created')
  return type
}

export async function listExpenseTypes() {
  // Return tree: parents first, then children nested
  const all = await prisma.expenseType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return all
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function createExpense(data: CreateExpenseInput, userId: string) {
  const refNumber = await nextRef()
  const amount = new Decimal(data.amount)

  // Read VAT rate from SystemSettings; fall back to 15%
  const vatSetting = await prisma.systemSettings.findUnique({ where: { key: 'vatRate' } })
  const vatRate = vatSetting ? new Decimal(vatSetting.value).div(100) : new Decimal('0.15')
  const vatAmount = data.includesVat
    ? amount.times(vatRate.div(vatRate.plus(1))).toDecimalPlaces(2)
    : new Decimal(0)

  // Link to today's open/submitted cash-up session if one exists
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const openSession = await prisma.cashUp.findFirst({
    where: { sessionDate: today, status: { in: ['open', 'submitted'] } },
  })

  const expense = await prisma.expense.create({
    data: {
      refNumber,
      expenseTypeId:   data.expenseTypeId,
      description:     data.description,
      amount:          amount,
      vatAmount:       vatAmount,
      includesVat:     data.includesVat ?? false,
      paymentMethod:   data.paymentMethod ?? 'cash',
      chequeNo:        data.chequeNo,
      cashUpId:        openSession?.id ?? null,
      createdByUserId: userId,
    },
    include: { expenseType: true },
  })
  logger.info({ expenseId: expense.id, userId, cashUpId: openSession?.id }, 'Expense created')
  return expense
}

export async function listExpenses(filters: {
  status?: string
  from?: Date
  to?: Date
  search?: string
  page?: number
  limit?: number
}) {
  const { status, from, to, search, page = 1, limit = 30 } = filters
  const where = {
    ...(status && { status: status as 'pending' | 'approved' | 'voided' }),
    ...(from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
    ...(search && {
      OR: [
        { refNumber:   { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
        { expenseType: { name: { contains: search, mode: 'insensitive' as const } } },
      ],
    }),
  }
  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { expenseType: true, _count: { select: { attachments: true } } },
    }),
    prisma.expense.count({ where }),
  ])
  return { expenses, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getExpense(id: string) {
  return prisma.expense.findUniqueOrThrow({
    where: { id },
    include: { expenseType: true, attachments: { orderBy: { uploadedAt: 'desc' } } },
  })
}

export async function approveExpense(id: string, userId: string) {
  const expense = await prisma.expense.update({
    where: { id },
    data: { status: 'approved', approvedById: userId, approvedAt: new Date() },
    include: { expenseType: true },
  })
  logger.info({ expenseId: id, userId }, 'Expense approved')
  return expense
}

export async function voidExpense(id: string, userId: string) {
  const expense = await prisma.expense.update({
    where: { id },
    data: { status: 'voided' },
    include: { expenseType: true },
  })
  logger.info({ expenseId: id, userId }, 'Expense voided')
  return expense
}

export async function getExpenseTotalsForDate(date: Date): Promise<Decimal> {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end   = new Date(date); end.setHours(23, 59, 59, 999)
  const result = await prisma.expense.aggregate({
    where: { status: 'approved', createdAt: { gte: start, lte: end } },
    _sum: { amount: true },
  })
  return new Decimal(result._sum.amount?.toString() ?? '0')
}

// ─── Expense Attachments ──────────────────────────────────────────────────────

export async function listExpenseAttachments(expenseId: string) {
  return prisma.expenseAttachment.findMany({
    where:   { expenseId },
    orderBy: { uploadedAt: 'desc' },
  })
}

export async function addExpenseAttachment(
  expenseId: string,
  data: { r2Key: string; fileName: string; notes?: string },
  uploadedByUserId: string
) {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId }, select: { id: true } })
  if (!expense) throw new Error(`Expense "${expenseId}" not found`)

  const attachment = await prisma.expenseAttachment.create({
    data: { expenseId, r2Key: data.r2Key, fileName: data.fileName, notes: data.notes, uploadedByUserId },
  })
  logger.info({ attachmentId: attachment.id, expenseId, uploadedByUserId }, 'expense.attachment.added')
  return attachment
}

export async function deleteExpenseAttachment(
  expenseId: string,
  attachId: string,
  deletedByUserId: string
) {
  const attachment = await prisma.expenseAttachment.findUnique({ where: { id: attachId } })
  if (!attachment || attachment.expenseId !== expenseId) throw new Error('Attachment not found')

  const { deleteR2Object } = await import('@/lib/r2')
  await deleteR2Object(attachment.r2Key)
  await prisma.expenseAttachment.delete({ where: { id: attachId } })
  logger.info({ attachId, expenseId, deletedByUserId }, 'expense.attachment.deleted')
}

export async function getExpensesByCategory(from: Date, to: Date) {
  const expenses = await prisma.expense.findMany({
    where: {
      status: 'approved',
      createdAt: { gte: from, lte: to },
    },
    include: { expenseType: { select: { name: true } } },
  })

  const byCategory: Record<string, Decimal> = {}
  for (const e of expenses) {
    const cat = e.expenseType.name
    byCategory[cat] = (byCategory[cat] ?? new Decimal(0)).plus(new Decimal(e.amount.toString()))
  }
  return Object.entries(byCategory).map(([name, total]) => ({ name, total: total.toFixed(2) }))
}
