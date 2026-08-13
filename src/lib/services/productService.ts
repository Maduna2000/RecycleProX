import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { ciContains } from '@/lib/db/queryHelpers'
import type {
  CreateProductInput,
  UpdateProductInput,
  BulkPriceUpdateInput,
  CreatePriceGroupInput,
  UpdatePriceGroupInput,
  SetGroupOverridesInput,
  CreateCategoryInput,
  UpdateCategoryInput,
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

export class PriceGroupInUseError extends Error {
  constructor(public customerCount: number) {
    super(`Price group is assigned to ${customerCount} customer${customerCount === 1 ? '' : 's'} and cannot be deleted`)
    this.name = 'PriceGroupInUseError'
  }
}

export class DefaultPriceGroupDeleteError extends Error {
  constructor() {
    super('The default price group cannot be deleted — set another group as default first')
    this.name = 'DefaultPriceGroupDeleteError'
  }
}

export class PriceGroupHasPriceListsError extends Error {
  constructor(public priceListCount: number) {
    super(`Price group has ${priceListCount} price list${priceListCount === 1 ? '' : 's'} and cannot be deleted`)
    this.name = 'PriceGroupHasPriceListsError'
  }
}

export class ProductInUseError extends Error {
  constructor(public counts: { purchases: number; sales: number; stock: number }) {
    super('Product is referenced by existing transactions')
    this.name = 'ProductInUseError'
  }
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

export async function createProduct(data: CreateProductInput, createdById?: string) {
  const tenantId = requireTenantId()
  const existing = await prisma.product.findUnique({ where: { tenantId_code: { tenantId, code: data.code } } })
  if (existing) throw new DuplicateProductCodeError(data.code)

  const cat = await prisma.productCategory.findUnique({ where: { tenantId_name: { tenantId, name: data.category } } })
  if (!cat) throw new Error(`Category "${data.category}" does not exist`)

  const product = await prisma.product.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      category: data.category,
      categoryId: cat.id,
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
  const tenantId = requireTenantId()
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new ProductNotFoundError(id)

  let categoryId: string | undefined
  if (data.category !== undefined) {
    const cat = await prisma.productCategory.findUnique({ where: { tenantId_name: { tenantId, name: data.category } } })
    if (!cat) throw new Error(`Category "${data.category}" does not exist`)
    categoryId = cat.id
  }

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category, categoryId }),
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
      await tx.priceHistory.create({
        data: {
          tenantId,
          productId: id,
          buyPrice: product.defaultBuyPrice,
          sellPrice: product.defaultSellPrice,
          changedById: updatedById,
        },
      })
    }

    return product
  })

  logger.info({ productId: id, updatedById }, 'product.updated')
  return updated
}

export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      _count: { select: { purchaseLines: true, saleLines: true, stockMovements: true } },
    },
  })
  if (!product) throw new ProductNotFoundError(id)

  const counts = {
    purchases: product._count.purchaseLines,
    sales:     product._count.saleLines,
    stock:     product._count.stockMovements,
  }
  if (counts.purchases > 0 || counts.sales > 0 || counts.stock > 0) {
    throw new ProductInUseError(counts)
  }

  await prisma.$transaction(async (tx) => {
    await tx.priceHistory.deleteMany({ where: { productId: id } })
    await tx.priceGroupProductOverride.deleteMany({ where: { productId: id } })
    await tx.product.delete({ where: { id } })
  })
  logger.info({ productId: id }, 'product.deleted')
}

export async function listProducts(opts?: { category?: string; isActive?: boolean; search?: string }) {
  return prisma.product.findMany({
    where: {
      ...(opts?.category && { category: opts.category as never }),
      ...(opts?.isActive !== undefined && { isActive: opts.isActive }),
      ...(opts?.search && {
        OR: [
          { name: ciContains(opts.search) },
          { code: ciContains(opts.search) },
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
  const tenantId = requireTenantId()
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
          tenantId,
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
    where: { tenantId_priceGroupId_productId: { tenantId: requireTenantId(), priceGroupId, productId } },
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
  const tenantId = requireTenantId()
  const existing = await prisma.priceGroup.findUnique({ where: { tenantId_name: { tenantId, name: data.name } } })
  if (existing) throw new DuplicatePriceGroupNameError(data.name)

  // If isDefault, clear other defaults first
  if (data.isDefault) {
    await prisma.priceGroup.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  }

  const group = await prisma.priceGroup.create({
    data: {
      tenantId,
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
    const nameConflict = await prisma.priceGroup.findUnique({ where: { tenantId_name: { tenantId: requireTenantId(), name: data.name } } })
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

export async function deletePriceGroup(id: string, deletedById?: string) {
  const group = await prisma.priceGroup.findUnique({
    where: { id },
    include: { _count: { select: { customers: true, priceLists: true } } },
  })
  if (!group) throw new PriceGroupNotFoundError(id)
  if (group.isDefault) throw new DefaultPriceGroupDeleteError()
  if (group._count.customers > 0) throw new PriceGroupInUseError(group._count.customers)
  if (group._count.priceLists > 0) throw new PriceGroupHasPriceListsError(group._count.priceLists)

  await prisma.$transaction(async (tx) => {
    await tx.priceGroupProductOverride.deleteMany({ where: { priceGroupId: id } })
    await tx.priceGroup.delete({ where: { id } })
  })

  logger.info({ priceGroupId: id, deletedById }, 'priceGroup.deleted')
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

  const tenantId = requireTenantId()
  await prisma.$transaction(async (tx) => {
    // Remove overrides not in the new set
    const incomingProductIds = data.overrides.map((o) => o.productId)
    await tx.priceGroupProductOverride.deleteMany({
      where: { priceGroupId: groupId, productId: { notIn: incomingProductIds } },
    })

    for (const override of data.overrides) {
      await tx.priceGroupProductOverride.upsert({
        where: { tenantId_priceGroupId_productId: { tenantId, priceGroupId: groupId, productId: override.productId } },
        create: {
          tenantId,
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

  const tenantId = requireTenantId()
  const upserted = await prisma.$transaction(async (tx) => {
    let count = 0
    for (const product of products) {
      await tx.priceGroupProductOverride.upsert({
        where:  { tenantId_priceGroupId_productId: { tenantId, priceGroupId, productId: product.id } },
        create: { tenantId, priceGroupId, productId: product.id, buyPrice: product.defaultBuyPrice, sellPrice: product.defaultSellPrice },
        update: { buyPrice: product.defaultBuyPrice, sellPrice: product.defaultSellPrice },
      })
      count++
    }
    return count
  })

  logger.info({ priceGroupId, upserted }, 'price-group.defaults-copied')
  return upserted
}

// ─── Category CRUD ────────────────────────────────────────────────────────────

export async function createCategory(data: CreateCategoryInput) {
  const tenantId = requireTenantId()
  const existing = await prisma.productCategory.findUnique({ where: { tenantId_name: { tenantId, name: data.name } } })
  if (existing) throw new Error(`Category "${data.name}" already exists`)

  if (data.parentId) {
    const parent = await prisma.productCategory.findUnique({ where: { id: data.parentId } })
    if (!parent) throw new Error('Parent category not found')
    if (parent.parentId !== null) throw new Error('Only two category levels are supported')
  }

  const category = await prisma.productCategory.create({
    data: {
      tenantId,
      name:      data.name,
      colorHex:  data.colorHex  || null,
      iconName:  data.iconName  || null,
      sortOrder: data.sortOrder ?? 0,
      parentId:  data.parentId  ?? null,
    },
  })
  logger.info({ categoryId: category.id, name: category.name, parentId: category.parentId }, 'productCategory.created')
  return category
}

export async function updateCategory(id: string, data: UpdateCategoryInput, updatedById?: string) {
  const existing = await prisma.productCategory.findUnique({
    where: { id },
    include: { children: { select: { id: true } } },
  })
  if (!existing) throw new Error('Category not found')

  if (data.name && data.name !== existing.name) {
    const conflict = await prisma.productCategory.findUnique({ where: { tenantId_name: { tenantId: requireTenantId(), name: data.name } } })
    if (conflict) throw new Error(`Category "${data.name}" already exists`)
  }

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === id) throw new Error('A category cannot be its own parent')
    const newParent = await prisma.productCategory.findUnique({ where: { id: data.parentId } })
    if (!newParent) throw new Error('Parent category not found')
    if (newParent.parentId !== null) throw new Error('Only two category levels are supported')
    if (existing.children.length > 0) throw new Error('Cannot move a parent category under another category — remove its sub-categories first')
  }

  const isRenaming = data.name !== undefined && data.name !== existing.name

  const updated = await prisma.$transaction(async (tx) => {
    const cat = await tx.productCategory.update({
      where: { id },
      data: {
        ...(data.name      !== undefined && { name:      data.name }),
        ...(data.colorHex  !== undefined && { colorHex:  data.colorHex  || null }),
        ...(data.iconName  !== undefined && { iconName:  data.iconName  || null }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive  !== undefined && { isActive:  data.isActive }),
        ...(data.parentId  !== undefined && { parentId:  data.parentId ?? null }),
      },
    })

    if (isRenaming) {
      const { count } = await tx.product.updateMany({
        where: { category: existing.name },
        data:  { category: data.name! },
      })
      logger.info({ categoryId: id, oldName: existing.name, newName: data.name, count, updatedById }, 'productCategory.renamed.cascade')
    }

    return cat
  })

  logger.info({ categoryId: id, updatedById }, 'productCategory.updated')
  return updated
}

export async function deleteCategory(id: string) {
  const cat = await prisma.productCategory.findUnique({
    where: { id },
    include: { children: { select: { id: true } } },
  })
  if (!cat) throw new Error('Category not found')
  if (cat.children.length > 0) {
    throw new Error(`Delete sub-categories first (${cat.children.length} sub-categor${cat.children.length !== 1 ? 'ies' : 'y'} exist)`)
  }
  const inUse = await prisma.product.count({ where: { category: cat.name } })
  if (inUse > 0) throw new Error(`${inUse} product${inUse !== 1 ? 's' : ''} use this category — reassign them first`)
  await prisma.productCategory.delete({ where: { id } })
  logger.info({ categoryId: id, name: cat.name }, 'productCategory.deleted')
}

export async function countProductsForCategory(name: string): Promise<number> {
  return prisma.product.count({ where: { category: name, isActive: true } })
}

/**
 * Names covered by a category filter selection: a parent category covers
 * itself plus its sub-categories; a child (or unknown name) covers itself.
 * Use for `category: { in: expandCategoryNames(name) }` filters.
 */
export async function expandCategoryNames(name: string): Promise<string[]> {
  const cat = await prisma.productCategory.findUnique({
    where: { tenantId_name: { tenantId: requireTenantId(), name } },
    include: { children: { where: { isActive: true }, select: { name: true } } },
  })
  if (!cat) return [name]
  return [cat.name, ...cat.children.map((c) => c.name)]
}

// ─── Trade Commodities ────────────────────────────────────────────────────────
// "Trade commodities" are just product categories flagged as selectable on
// account-customer registration — see Settings > Trade Commodities. Every
// active category (parent and child) is always listed; toggling on/off sets
// isTradeCommodity, it never creates/renames/deletes the category itself
// (that's the Products module's Manage Categories screen).

export async function listTradeCommodityOptions() {
  return prisma.productCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true, parentId: true, isTradeCommodity: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
}

export async function setTradeCommodityFlag(id: string, enabled: boolean) {
  const cat = await prisma.productCategory.findUnique({ where: { id } })
  if (!cat) throw new Error('Category not found')

  const updated = await prisma.productCategory.update({
    where: { id },
    data: { isTradeCommodity: enabled },
  })
  logger.info({ categoryId: id, enabled }, 'productCategory.tradeCommodityToggled')
  return updated
}
