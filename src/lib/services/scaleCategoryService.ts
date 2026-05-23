import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import type { CreateScaleCategoryInput, UpdateScaleCategoryInput } from '@/lib/schemas/scale'

export class ScaleCategoryNotFoundError extends Error {
  constructor(id: string) { super(`ScaleCategory "${id}" not found`); this.name = 'ScaleCategoryNotFoundError' }
}

export class ScaleCategoryNameConflictError extends Error {
  constructor(name: string) { super(`A category named "${name}" already exists`); this.name = 'ScaleCategoryNameConflictError' }
}

export async function listCategories(includeInactive = false) {
  return prisma.scaleCategory.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function getCategoryById(id: string) {
  const cat = await prisma.scaleCategory.findUnique({ where: { id } })
  if (!cat) throw new ScaleCategoryNotFoundError(id)
  return cat
}

export async function createCategory(data: CreateScaleCategoryInput, userId: string) {
  const existing = await prisma.scaleCategory.findUnique({ where: { name: data.name } })
  if (existing) throw new ScaleCategoryNameConflictError(data.name)

  const cat = await prisma.scaleCategory.create({
    data: { ...data, createdAt: new Date(), updatedAt: new Date() },
  })
  logger.info({ categoryId: cat.id, userId }, 'scaleCategory.created')
  return cat
}

export async function updateCategory(id: string, data: UpdateScaleCategoryInput, userId: string) {
  await getCategoryById(id)
  if (data.name) {
    const conflict = await prisma.scaleCategory.findFirst({ where: { name: data.name, NOT: { id } } })
    if (conflict) throw new ScaleCategoryNameConflictError(data.name)
  }
  const cat = await prisma.scaleCategory.update({ where: { id }, data })
  logger.info({ categoryId: id, userId }, 'scaleCategory.updated')
  return cat
}

export async function deactivateCategory(id: string, userId: string) {
  await getCategoryById(id)
  const cat = await prisma.scaleCategory.update({ where: { id }, data: { isActive: false } })
  logger.info({ categoryId: id, userId }, 'scaleCategory.deactivated')
  return cat
}
