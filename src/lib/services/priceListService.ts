import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import Decimal from 'decimal.js'
import logger from '@/lib/logger'
import { VAT_DIVISOR } from '@/lib/utils/vat'
import type { CreatePriceListInput, UpdatePriceListInput, PriceListItemInput } from '@/lib/schemas/priceList'

/** SystemSettings key holding the R2 object key of the price list logo. */
export const PRICE_LIST_LOGO_SETTING_KEY = 'priceListLogoR2Key'

/** EX VAT is never stored — always derived from the INC VAT price at 15%. */
export function exVatPrice(priceIncVat: Decimal.Value): Decimal {
  return new Decimal(priceIncVat).div(VAT_DIVISOR).toDecimalPlaces(2)
}

function itemRows(items: PriceListItemInput[], tenantId: string) {
  return items.map((item, i) => ({
    tenantId,
    productId:   item.productId ?? null,
    displayName: item.displayName,
    priceIncVat: new Decimal(item.priceIncVat).toDecimalPlaces(2).toString(),
    sortOrder:   item.sortOrder ?? i,
  }))
}

// listDate arrives as a plain YYYY-MM-DD; store it as UTC midnight so the
// printed date never shifts across timezones.
function parseListDate(listDate: string): Date {
  return new Date(`${listDate}T00:00:00.000Z`)
}

export async function listPriceLists() {
  return prisma.priceList.findMany({
    orderBy: [{ listDate: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { items: true } } },
  })
}

export async function getPriceList(id: string) {
  return prisma.priceList.findUniqueOrThrow({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
}

export async function getActivePriceList() {
  return prisma.priceList.findFirst({
    where: { isActiveForPurchases: true },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
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
      createdByUserId: userId,
      items:           { create: itemRows(data.items, tenantId) },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  logger.info({ priceListId: priceList.id, userId, itemCount: data.items.length }, 'PriceList created')
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
        title:      data.title,
        listDate:   parseListDate(data.listDate),
        footerText: data.footerText,
        showLogo:   data.showLogo,
        showExVat:  data.showExVat,
        items:      { create: itemRows(data.items, tenantId) },
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
      createdByUserId: userId,
      items: {
        create: source.items.map((item) => ({
          tenantId,
          productId:   item.productId,
          displayName: item.displayName,
          priceIncVat: item.priceIncVat,
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

/** At most one active list per tenant — clear-then-set in one transaction. */
export async function activatePriceList(id: string, userId: string) {
  const activated = await prisma.$transaction(async (tx) => {
    const target = await tx.priceList.findUnique({ where: { id } })
    if (!target) throw new Error('Price list not found')
    await tx.priceList.updateMany({
      where: { isActiveForPurchases: true, id: { not: id } },
      data:  { isActiveForPurchases: false },
    })
    return tx.priceList.update({ where: { id }, data: { isActiveForPurchases: true } })
  })
  logger.info({ priceListId: id, userId }, 'PriceList activated for purchases')
  return activated
}
