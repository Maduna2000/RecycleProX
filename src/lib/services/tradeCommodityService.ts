import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import type {
  CreateTradeCommodityCategoryInput,
  UpdateTradeCommodityCategoryInput,
  ReorderTradeCommodityCategoriesInput,
} from '@/lib/schemas/tradeCommodity'

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class DuplicateCategoryError extends Error {
  constructor(name: string) {
    super(`A trade commodity category named "${name}" already exists`)
    this.name = 'DuplicateCategoryError'
  }
}

export class CategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Trade commodity category with ID "${id}" not found`)
    this.name = 'CategoryNotFoundError'
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function listTradeCommodityCategories(includeInactive = false) {
  return prisma.tradeCommodityCategory.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function getTradeCommodityCategory(id: string) {
  const category = await prisma.tradeCommodityCategory.findUnique({ where: { id } })
  if (!category) throw new CategoryNotFoundError(id)
  return category
}

export async function createTradeCommodityCategory(
  data: CreateTradeCommodityCategoryInput,
  userId: string,
) {
  const existing = await prisma.tradeCommodityCategory.findUnique({
    where: { name: data.name },
  })
  if (existing) throw new DuplicateCategoryError(data.name)

  // Auto-assign sortOrder if not provided (put at end)
  let sortOrder = data.sortOrder
  if (sortOrder === 0 || sortOrder === undefined) {
    const lastCategory = await prisma.tradeCommodityCategory.findFirst({
      orderBy: { sortOrder: 'desc' },
    })
    sortOrder = (lastCategory?.sortOrder ?? 0) + 1
  }

  const category = await prisma.tradeCommodityCategory.create({
    data: { ...data, sortOrder },
  })

  logger.info({ categoryId: category.id, userId }, 'Trade commodity category created')
  return category
}

export async function updateTradeCommodityCategory(
  id: string,
  data: UpdateTradeCommodityCategoryInput,
  userId: string,
) {
  const existing = await prisma.tradeCommodityCategory.findUnique({ where: { id } })
  if (!existing) throw new CategoryNotFoundError(id)

  // Check for duplicate name if name is being changed
  if (data.name && data.name !== existing.name) {
    const duplicate = await prisma.tradeCommodityCategory.findUnique({
      where: { name: data.name },
    })
    if (duplicate) throw new DuplicateCategoryError(data.name)
  }

  const category = await prisma.tradeCommodityCategory.update({
    where: { id },
    data,
  })

  logger.info({ categoryId: category.id, userId }, 'Trade commodity category updated')
  return category
}

export async function deleteTradeCommodityCategory(id: string, userId: string) {
  const existing = await prisma.tradeCommodityCategory.findUnique({ where: { id } })
  if (!existing) throw new CategoryNotFoundError(id)

  // Soft delete by setting isActive = false
  const category = await prisma.tradeCommodityCategory.update({
    where: { id },
    data: { isActive: false },
  })

  logger.info({ categoryId: category.id, userId }, 'Trade commodity category deactivated')
  return category
}

export async function reorderTradeCommodityCategories(
  data: ReorderTradeCommodityCategoriesInput,
  userId: string,
) {
  const updates = data.orderedIds.map((id, index) =>
    prisma.tradeCommodityCategory.update({
      where: { id },
      data: { sortOrder: index },
    }),
  )

  await prisma.$transaction(updates)

  logger.info({ count: data.orderedIds.length, userId }, 'Trade commodity categories reordered')
  return listTradeCommodityCategories(true)
}
