import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

export const UNKNOWN_EXPENSE_CATEGORY = 'Unknown category'

export interface ExpenseTypeRef {
  id: string
  name: string
  parentId: string | null
  isActive: boolean
  parent: { name: string } | null
}

/**
 * Resolves expense categories for a batch of expenses separately from the
 * expense query. A required `include: { expenseType }` makes Prisma throw
 * ("Inconsistent query result") for the WHOLE list when a single expense's
 * category can't be read (e.g. it belongs to another tenant, so row-level
 * security hides it) — one bad row would blank the entire page/report.
 * Missing categories resolve to a placeholder instead and are logged.
 */
export async function resolveExpenseTypes<T extends { id: string; expenseTypeId: string }>(
  expenses: T[],
): Promise<Array<T & { expenseType: ExpenseTypeRef }>> {
  const ids = Array.from(new Set(expenses.map((e) => e.expenseTypeId)))
  const found = ids.length
    ? await prisma.expenseType.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, parentId: true, isActive: true, parent: { select: { name: true } } },
      })
    : []
  const byId = new Map(found.map((t) => [t.id, t]))

  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) {
    logger.error(
      { missingExpenseTypeIds: missing, expenseIds: expenses.filter((e) => missing.includes(e.expenseTypeId)).map((e) => e.id) },
      'Expenses reference an expense category that cannot be read (wrong tenant or missing)',
    )
  }

  return expenses.map((e) => ({
    ...e,
    expenseType: byId.get(e.expenseTypeId) ?? {
      id: e.expenseTypeId, name: UNKNOWN_EXPENSE_CATEGORY, parentId: null, isActive: false, parent: null,
    },
  }))
}
