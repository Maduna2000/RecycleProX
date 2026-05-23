import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import type { CreateScaleProductInput, UpdateScaleProductInput } from '@/lib/schemas/scale'

export class ScaleProductNotFoundError extends Error {
  constructor(id: string) { super(`ScaleProduct "${id}" not found`); this.name = 'ScaleProductNotFoundError' }
}

export class ScaleProductInactiveError extends Error {
  constructor(id: string) { super(`ScaleProduct "${id}" is inactive`); this.name = 'ScaleProductInactiveError' }
}

export async function listProducts(categoryId?: string, includeInactive = false) {
  return prisma.scaleProduct.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { category: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function getProductById(id: string) {
  const p = await prisma.scaleProduct.findUnique({ where: { id }, include: { category: true } })
  if (!p) throw new ScaleProductNotFoundError(id)
  return p
}

export async function createProduct(data: CreateScaleProductInput, userId: string) {
  const product = await prisma.scaleProduct.create({ data, include: { category: true } })
  logger.info({ productId: product.id, userId }, 'scaleProduct.created')
  return product
}

export async function updateProduct(id: string, data: UpdateScaleProductInput, userId: string) {
  await getProductById(id)
  const product = await prisma.scaleProduct.update({ where: { id }, data, include: { category: true } })
  logger.info({ productId: id, userId }, 'scaleProduct.updated')
  return product
}

export async function deactivateProduct(id: string, userId: string) {
  await getProductById(id)
  const product = await prisma.scaleProduct.update({ where: { id }, data: { isActive: false }, include: { category: true } })
  logger.info({ productId: id, userId }, 'scaleProduct.deactivated')
  return product
}
