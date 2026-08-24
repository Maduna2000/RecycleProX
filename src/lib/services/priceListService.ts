import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { requireTenantId } from '@/lib/db/tenantContext'
import { withSerializableRetry } from '@/lib/db/withSerializableRetry'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { incVatPrice } from '@/lib/utils/vat'
import { getAllSettings, currencySymbolFromSettings } from '@/lib/services/settingsService'
import { fetchR2Bytes } from '@/lib/r2'
import { generatePriceListPdf } from '@/lib/pdf/priceList'
import { resolvePrice } from '@/lib/services/productService'
import type { CreatePriceListInput, UpdatePriceListInput, PriceListItemInput, PriceListColors } from '@/lib/schemas/priceList'

/** SystemSettings key holding the R2 object key of the price list logo. */
export const PRICE_LIST_LOGO_SETTING_KEY = 'priceListLogoR2Key'

// INC VAT is never stored — always derived from the EX VAT price at 15%.
// EX VAT is canonical (matches Product.defaultBuyPrice / Purchases, where
// VAT is added on top of the entered price, never derived by dividing it
// back out). Re-exported here so existing importers of this module don't
// need to change — the actual formula lives in lib/utils/vat.ts, the one
// place safe for both server code and client components to import from.
export { incVatPrice }

export interface PriceListPdfSource {
  title:      string
  listDate:   Date
  footerText: string
  showLogo:   boolean
  showExVat:  boolean
  colors:     PriceListColors
  items:      { displayName: string; category: string; priceExVat: Decimal.Value }[]
}

/**
 * Renders a price list to PDF bytes — shared by the saved-document PDF route
 * and the unsaved-draft preview route so both produce byte-identical output
 * for the same content. Must run inside a resolved tenant context (settings
 * lookup is tenant-scoped).
 */
export async function buildPriceListPdfBytes(source: PriceListPdfSource): Promise<Uint8Array> {
  const settings = await getAllSettings()
  const logoKey = source.showLogo ? settings[PRICE_LIST_LOGO_SETTING_KEY] : undefined
  const logoBytes = logoKey ? await fetchR2Bytes(logoKey) : null
  const currencySymbol = currencySymbolFromSettings(settings)

  return generatePriceListPdf({
    title: source.title,
    listDate: source.listDate,
    footerText: source.footerText,
    showExVat: source.showExVat,
    colors: source.colors,
    company: {
      name: settings['yardName'] ?? 'Renovo Pro',
      address: settings['yardAddress'] || undefined,
      phone: settings['yardPhone'] || undefined,
    },
    logoBytes,
    currencySymbol,
    items: source.items.map((item) => ({
      displayName: item.displayName,
      category: item.category,
      priceExVat: new Decimal(item.priceExVat).toFixed(2),
      priceIncVat: incVatPrice(item.priceExVat).toFixed(2),
    })),
    generatedAt: new Date(),
  })
}

function itemRows(items: PriceListItemInput[], tenantId: string) {
  return items.map((item, i) => ({
    tenantId,
    productId:   item.productId ?? null,
    displayName: item.displayName,
    category:    item.category || 'Other',
    priceExVat:  new Decimal(item.priceExVat).toDecimalPlaces(2).toString(),
    sortOrder:   item.sortOrder ?? i,
  }))
}

// listDate arrives as a plain YYYY-MM-DD; store it as UTC midnight so the
// printed date never shifts across timezones.
function parseListDate(listDate: string): Date {
  return new Date(`${listDate}T00:00:00.000Z`)
}

export async function listPriceLists(opts?: { priceGroupId?: string }) {
  return prisma.priceList.findMany({
    where: { ...(opts?.priceGroupId && { priceGroupId: opts.priceGroupId }) },
    orderBy: [{ listDate: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { items: true } }, priceGroup: { select: { name: true } } },
  })
}

export async function getPriceList(id: string) {
  return prisma.priceList.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

/**
 * Resolves the price list to show for a given customer's price group —
 * their own group's active list first, falling back to whichever group is
 * flagged isDefault (a Casual customer, or no customer selected yet, passes
 * null and always takes this fallback directly). Returns null if neither
 * resolves to an active list.
 */
export async function getActivePriceListForCustomer(customerPriceGroupId: string | null) {
  if (customerPriceGroupId) {
    const groupList = await prisma.priceList.findFirst({
      where: { priceGroupId: customerPriceGroupId, isActiveForPurchases: true },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
    if (groupList) return groupList
  }

  const defaultGroup = await prisma.priceGroup.findFirst({ where: { isDefault: true } })
  if (!defaultGroup) return null

  return prisma.priceList.findFirst({
    where: { priceGroupId: defaultGroup.id, isActiveForPurchases: true },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

/**
 * Purchase-specific price resolution — today's active price list (for the
 * customer's price group, same resolution/fallback as
 * getActivePriceListForCustomer) takes priority when it lists this product;
 * otherwise falls through to the standard group-override/product-default
 * chain (resolvePrice), completely unchanged. Purchases-only on purpose —
 * the price-list editor's own "add product" convenience keeps calling
 * resolvePrice directly, so building today's list never suggests prices
 * sourced from itself.
 */
export async function resolvePurchasePrice(
  productId: string,
  customerPriceGroupId: string | null
): Promise<{ buyPrice: Decimal.Value; source: 'price_list' | 'group_override' | 'default' }> {
  const activeList = await getActivePriceListForCustomer(customerPriceGroupId)
  const item = activeList?.items.find((i) => i.productId === productId)
  if (item) return { buyPrice: item.priceExVat, source: 'price_list' }
  return resolvePrice(productId, customerPriceGroupId)
}

export async function createPriceList(data: CreatePriceListInput, userId: string) {
  const tenantId = requireTenantId()
  const priceList = await prisma.priceList.create({
    data: {
      tenantId,
      title:           data.title,
      listDate:        parseListDate(data.listDate),
      footerText:      data.footerText,
      showLogo:        data.showLogo,
      showExVat:       data.showExVat,
      priceGroupId:    data.priceGroupId,
      ...data.colors,
      createdByUserId: userId,
      items:           { create: itemRows(data.items, tenantId) },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  logger.info({ priceListId: priceList.id, userId, priceGroupId: data.priceGroupId, itemCount: data.items.length }, 'PriceList created')
  return priceList
}

export async function updatePriceList(id: string, data: UpdatePriceListInput) {
  const tenantId = requireTenantId()
  return prisma.$transaction(async (tx) => {
    const existing = await tx.priceList.findUnique({ where: { id } })
    if (!existing) throw new Error('Price list not found')

    const expectedUpdatedAt = new Date(data.updatedAt)
    if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new Error('Price list was modified by another user')
    }

    // Full item replace — documents are small (≤200 rows) and this keeps
    // reorder/removal logic trivial.
    await tx.priceListItem.deleteMany({ where: { priceListId: id } })
    return tx.priceList.update({
      where: { id },
      data: {
        title:        data.title,
        listDate:     parseListDate(data.listDate),
        footerText:   data.footerText,
        showLogo:     data.showLogo,
        showExVat:    data.showExVat,
        priceGroupId: data.priceGroupId,
        ...data.colors,
        items:        { create: itemRows(data.items, tenantId) },
      },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })
  })
}

export async function duplicatePriceList(id: string, userId: string) {
  const tenantId = requireTenantId()
  const source = await getPriceList(id)
  const copy = await prisma.priceList.create({
    data: {
      tenantId,
      title:           `${source.title} (copy)`.slice(0, 80),
      listDate:        new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
      footerText:      source.footerText,
      showLogo:        source.showLogo,
      showExVat:       source.showExVat,
      priceGroupId:    source.priceGroupId,
      primaryColor:      source.primaryColor,
      accentColor:       source.accentColor,
      headerTextColor:   source.headerTextColor,
      materialTextColor: source.materialTextColor,
      priceTextColor:    source.priceTextColor,
      exVatTextColor:    source.exVatTextColor,
      rowTintColor:      source.rowTintColor,
      createdByUserId: userId,
      items: {
        create: source.items.map((item) => ({
          tenantId,
          productId:   item.productId,
          displayName: item.displayName,
          category:    item.category,
          priceExVat:  item.priceExVat,
          sortOrder:   item.sortOrder,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  logger.info({ sourceId: id, copyId: copy.id, userId }, 'PriceList duplicated')
  return copy
}

export async function deletePriceList(id: string) {
  await prisma.priceList.delete({ where: { id } }) // items cascade
  logger.info({ priceListId: id }, 'PriceList deleted')
}

/** At most one active list per price group — clear-then-set in one transaction. */
export async function activatePriceList(id: string, userId: string) {
  // Serializable — two managers activating different lists in the same
  // group at nearly the same instant under the default isolation level
  // could interleave their clear-then-set steps and leave more than one
  // list "active" for that group at once (getActivePriceListForCustomer's
  // findFirst would then depend on unspecified row order). Serializable
  // makes Postgres abort and retry one of them instead.
  const activated = await withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const target = await tx.priceList.findUnique({ where: { id } })
      if (!target) throw new Error('Price list not found')
      // Scoped to the same price group only — activating a Dealer 1 list
      // must never deactivate whatever's active for Casual/Dealer 2/Dealer 3.
      await tx.priceList.updateMany({
        where: { isActiveForPurchases: true, id: { not: id }, priceGroupId: target.priceGroupId },
        data:  { isActiveForPurchases: false },
      })
      return tx.priceList.update({ where: { id }, data: { isActiveForPurchases: true } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  )
  logger.info({ priceListId: id, userId, priceGroupId: activated.priceGroupId }, 'PriceList activated for purchases')
  return activated
}
