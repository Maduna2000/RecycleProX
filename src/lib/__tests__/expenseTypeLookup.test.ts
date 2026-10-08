/**
 * resolveExpenseTypes — one expense whose category can't be read (e.g. hidden
 * by tenant RLS) must not break the whole list; it gets a placeholder instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/db/prisma', () => ({ prisma: { expenseType: { findMany: (a: unknown) => findMany(a) } } }))
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { resolveExpenseTypes, UNKNOWN_EXPENSE_CATEGORY } from '@/lib/services/expenseTypeLookup'

beforeEach(() => findMany.mockReset())

describe('resolveExpenseTypes', () => {
  it('attaches readable categories and a placeholder for unreadable ones', async () => {
    findMany.mockResolvedValue([{ id: 't1', name: 'Fuel', parentId: null, isActive: true, parent: null }])
    const out = await resolveExpenseTypes([
      { id: 'e1', expenseTypeId: 't1' },
      { id: 'e2', expenseTypeId: 'gone' },
    ])
    expect(out[0]!.expenseType.name).toBe('Fuel')
    expect(out[1]!.expenseType.name).toBe(UNKNOWN_EXPENSE_CATEGORY)
    expect(out[1]!.expenseType.id).toBe('gone')
  })

  it('does not query when there are no expenses', async () => {
    expect(await resolveExpenseTypes([])).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})
