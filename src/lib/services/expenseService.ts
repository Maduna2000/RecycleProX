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
  const vatAmount = data.includesVat
    ? amount.times(new Decimal('0.15').div(new Decimal('1.15'))).toDecimalPlaces(2)
    : new Decimal(0)

  const expense = await prisma.expense.create({
    data: {
      refNumber,
      expenseTypeId:   data.expenseTypeId,
      description:     data.description,
      amount:          amount.toFixed(2),
      vatAmount:       vatAmount.toFixed(2),
      includesVat:     data.includesVat ?? false,
      paymentMethod:   data.paymentMethod ?? 'cash',
      chequeNo:        data.chequeNo,
      createdByUserId: userId,
    },
    include: { expenseType: true },
  })
  logger.info({ expenseId: expense.id, userId }, 'Expense created')
  return expense
}

export async function listExpenses(filters: {
  status?: string
  from?: Date
  to?: Date
  page?: number
  limit?: number
}) {
  const { status, from, to, page = 1, limit = 30 } = filters
  const where = {
    ...(status && { status: status as 'pending' | 'approved' | 'voided' }),
    ...(from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {}),
  }
  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { expenseType: true },
    }),
    prisma.expense.count({ where }),
  ])
  return { expenses, total, page, totalPages: Math.ceil(total / limit) }
}

export async function getExpense(id: string) {
  return prisma.expense.findUniqueOrThrow({ where: { id }, include: { expenseType: true } })
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
