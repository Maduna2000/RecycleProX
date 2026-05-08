import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import type {
  CreateProductInput,
  UpdateProductInput,
  BulkPriceUpdateInput,
  CreatePriceGroupInput,
  UpdatePriceGroupInput,
  SetGroupOverridesInput,
} from '@/lib/schemas/product'

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class DuplicateProductCodeError extends Error {
  constructor(code: string) {
    super(`Product with code "${code}" already exists`)
    this.name = 'DuplicateProductCodeError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product "${id}" not found`)
    this.name = 'ProductNotFoundError'
  }
}

export class PriceGroupNotFoundError extends Error {
  constructor(id: string) {
    super(`Price group "${id}" not found`)
    this.name = 'PriceGroupNotFoundError'
  }
}

export class DuplicatePriceGroupNameError extends Error {
  constructor(name: string) {
    super(`Price group "${name}" already exists`)
    this.name = 'DuplicatePriceGroupNameError'
  }
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

export async function createProduct(data: CreateProductInput, createdById?: string) {
  const existing = await prisma.product.findUnique({ where: { code: data.code } })
  if (existing) throw new DuplicateProductCodeError(data.code)

  const product = await prisma.product.create({
    data: {
      code: data.code,
      name: data.name,
      category: data.category,
      unit: data.unit ?? 'kg',
      defaultBuyPrice: new Decimal(data.defaultBuyPrice),
      defaultSellPrice: new Decimal(data.defaultSellPrice),
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  })

  logger.info({ productId: product.id, code: product.code, createdById }, 'product.created')
  return product
}

export async function updateProduct(id: string, data: UpdateProductInput, updatedById?: string) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new ProductNotFoundError(id)

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.unit !== undefined && { unit: data.unit }),
      ...(data.defaultBuyPrice !== undefined && { defaultBuyPrice: new Decimal(data.defaultBuyPrice) }),
      ...(data.defaultSellPrice !== undefined && { defaultSellPrice: new Decimal(data.defaultSellPrice) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  })

  // Record price history if prices changed
  const buyChanged = data.defaultBuyPrice !== undefined &&
    !new Decimal(data.defaultBuyPrice).equals(existing.defaultBuyPrice)
  const sellChanged = data.defaultSellPrice !== undefined &&
    !new Decimal(data.defaultSellPrice).equals(existing.defaultSellPrice)

  if (buyChanged || sellChanged) {
    await prisma.priceHistory.create({
      data: {
        productId: id,
        buyPrice: updated.defaultBuyPrice,
        sellPrice: updated.defaultSellPrice,
        changedById: updatedById,
      },
    })
  }

  logger.info({ productId: id, updatedById }, 'product.updated')
  return updated
}

export async function listProducts(opts?: { category?: string; isActive?: boolean; search?: string }) {
  return prisma.product.findMany({
    where: {
      ...(opts?.category && { category: opts.category as never }),
      ...(opts?.isActive !== undefined && { isActive: opts.isActive }),
      ...(opts?.search && {
        OR: [
          { name: { contains: opts.search, mode: 'insensitive' } },
          { code: { contains: opts.search, mode: 'insensitive' } },
        ],
      }),
    },
    orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }, { name: 'asc' }],
  })
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { priceHistory: { orderBy: { createdAt: 'desc' }, take: 20 } },
  })
  if (!product) throw new ProductNotFoundError(id)
  return product
}

// ─── Bulk Price Update ────────────────────────────────────────────────────────

export async function bulkUpdatePrices(data: BulkPriceUpdateInput, updatedById?: string) {
  const results = await prisma.$transaction(async (tx) => {
    const updated = []
    for (const item of data.updates) {
      const existing = await tx.product.findUnique({ where: { id: item.productId } })
      if (!existing) throw new ProductNotFoundError(item.productId)

      const product = await tx.product.update({
        where: { id: item.productId },
        data: {
          defaultBuyPrice: new Decimal(item.defaultBuyPrice),
          defaultSellPrice: new Decimal(item.defaultSellPrice),
        },
      })

      await tx.priceHistory.create({
        data: {
          productId: item.productId,
          buyPrice: new Decimal(item.defaultBuyPrice),
          sellPrice: new Decimal(item.defaultSellPrice),
          changedById: updatedById,
          reason: item.reason,
        },
      })

      updated.push(product)
    }
    return updated
  })

  logger.info({ count: results.length, updatedById }, 'product.bulkPriceUpdate')
  return results
}

// ─── Price Resolution ─────────────────────────────────────────────────────────

export async function resolvePrice(productId: string, priceGroupId?: string | null) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) throw new ProductNotFoundError(productId)

  if (!priceGroupId) {
    return {
      buyPrice: product.defaultBuyPrice,
      sellPrice: product.defaultSellPrice,
      source: 'default' as const,
    }
  }

  const override = await prisma.priceGroupProductOverride.findUnique({
    where: { priceGroupId_productId: { priceGroupId, productId } },
  })

  if (override) {
    return {
      buyPrice: override.buyPrice,
      sellPrice: override.sellPrice,
      source: 'group_override' as const,
    }
  }

  return {
    buyPrice: product.defaultBuyPrice,
    sellPrice: product.defaultSellPrice,
    source: 'default' as const,
  }
}

// ─── Price Groups ─────────────────────────────────────────────────────────────

export async function createPriceGroup(data: CreatePriceGroupInput, createdById?: string) {
  const existing = await prisma.priceGroup.findUnique({ where: { name: data.name } })
  if (existing) throw new DuplicatePriceGroupNameError(data.name)

  // If isDefault, clear other defaults first
  if (data.isDefault) {
    await prisma.priceGroup.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  }

  const group = await prisma.priceGroup.create({
    data: {
      name: data.name,
      description: data.description,
      isDefault: data.isDefault ?? false,
    },
  })

  logger.info({ priceGroupId: group.id, name: group.name, createdById }, 'priceGroup.created')
  return group
}

export async function updatePriceGroup(id: string, data: UpdatePriceGroupInput, updatedById?: string) {
  const existing = await prisma.priceGroup.findUnique({ where: { id } })
  if (!existing) throw new PriceGroupNotFoundError(id)

  if (data.name && data.name !== existing.name) {
    const nameConflict = await prisma.priceGroup.findUnique({ where: { name: data.name } })
    if (nameConflict) throw new DuplicatePriceGroupNameError(data.name)
  }

  if (data.isDefault) {
    await prisma.priceGroup.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } })
  }

  const updated = await prisma.priceGroup.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  })

  logger.info({ priceGroupId: id, updatedById }, 'priceGroup.updated')
  return updated
}

export async function listPriceGroups() {
  return prisma.priceGroup.findMany({
    where: { isActive: true },
    include: {
      _count: { select: { customers: true, overrides: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

export async function getPriceGroupWithOverrides(id: string) {
  const group = await prisma.priceGroup.findUnique({
    where: { id },
    include: {
      overrides: {
        include: { product: true },
        orderBy: { product: { name: 'asc' } },
      },
    },
  })
  if (!group) throw new PriceGroupNotFoundError(id)
  return group
}

export async function setGroupOverrides(groupId: string, data: SetGroupOverridesInput, updatedById?: string) {
  const group = await prisma.priceGroup.findUnique({ where: { id: groupId } })
  if (!group) throw new PriceGroupNotFoundError(groupId)

  await prisma.$transaction(async (tx) => {
    // Remove overrides not in the new set
    const incomingProductIds = data.overrides.map((o) => o.productId)
    await tx.priceGroupProductOverride.deleteMany({
      where: { priceGroupId: groupId, productId: { notIn: incomingProductIds } },
    })

    for (const override of data.overrides) {
      await tx.priceGroupProductOverride.upsert({
        where: { priceGroupId_productId: { priceGroupId: groupId, productId: override.productId } },
        create: {
          priceGroupId: groupId,
          productId: override.productId,
          buyPrice: new Decimal(override.buyPrice),
          sellPrice: new Decimal(override.sellPrice),
        },
        update: {
          buyPrice: new Decimal(override.buyPrice),
          sellPrice: new Decimal(override.sellPrice),
        },
      })
    }
  })

  logger.info({ priceGroupId: groupId, count: data.overrides.length, updatedById }, 'priceGroup.overridesUpdated')
}

// ─── Copy Default Prices to a Price Group ─────────────────────────────────────

export async function copyDefaultsToPriceGroup(
  priceGroupId: string,
  productIds?: string[]
) {
  const group = await prisma.priceGroup.findUnique({ where: { id: priceGroupId } })
  if (!group) throw new PriceGroupNotFoundError(priceGroupId)

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(productIds?.length ? { id: { in: productIds } } : {}),
    },
    select: { id: true, defaultBuyPrice: true, defaultSellPrice: true },
  })

  const upserted = await prisma.$transaction(async (tx) => {
    let count = 0
    for (const product of products) {
      await tx.priceGroupProductOverride.upsert({
        where:  { priceGroupId_productId: { priceGroupId, productId: product.id } },
        create: { priceGroupId, productId: product.id, buyPrice: product.defaultBuyPrice, sellPrice: product.defaultSellPrice },
        update: { buyPrice: product.defaultBuyPrice, sellPrice: product.defaultSellPrice },
      })
      count++
    }
    return count
  })

  logger.info({ priceGroupId, upserted }, 'price-group.defaults-copied')
  return upserted
}
