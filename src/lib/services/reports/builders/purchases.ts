/**
 * Purchases report builders.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { purchaseLineAmounts } from '@/lib/utils/vat'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import type { ReportDocument, ReportMeta } from '@/lib/reports/types'
import type { PurchasesByProductCategoryParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

// Legacy account-category band names (CASUALS / DEALERS 1 / DEALERS 3 …)
const DEALER_CATEGORY_BANDS: Record<string, string> = {
  casual: 'CASUALS',
  dealer_1: 'DEALERS 1',
  dealer_2: 'DEALERS 2',
  dealer_3: 'DEALERS 3',
}

const ACCOUNT_CATEGORY_ORDER = ['CASUALS', 'DEALERS 1', 'DEALERS 2', 'DEALERS 3']
const UNCATEGORISED = 'UNCATEGORISED'

function accountCategoryBand(customer: {
  dealerCategory: string | null
  customerType: string
}): string {
  if (customer.dealerCategory) {
    return DEALER_CATEGORY_BANDS[customer.dealerCategory] ?? UNCATEGORISED
  }
  return customer.customerType === 'casual' ? 'CASUALS' : UNCATEGORISED
}

/**
 * Purchases per Product Summary per Account Category (legacy
 * purch_products_sum_acccat): account category → top product category →
 * subcategory → product, with mass/value/VAT subtotals at every level.
 */
export async function buildPurchasesByProductCategory(
  params: PurchasesByProductCategoryParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)

  const lines = await prisma.purchaseLine.findMany({
    where: {
      purchase: {
        status: 'completed',
        createdAt: { gte: start, lte: end },
        ...(params.dealerCategory
          ? { customer: { dealerCategory: params.dealerCategory } }
          : {}),
      },
    },
    select: {
      quantity: true,
      lineTotal: true,
      vatAmount: true,
      product: {
        select: {
          code: true,
          name: true,
          category: true,
          categoryRef: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
      purchase: {
        select: {
          customer: {
            select: { dealerCategory: true, customerType: true, zeroRated: true },
          },
        },
      },
    },
  })

  type Line = (typeof lines)[number]

  // Era-aware sub/VAT/grand split — legacy rows carry VAT inside lineTotal,
  // new rows carry it on top (see purchaseLineAmounts)
  const amountsOf = (l: Line) => purchaseLineAmounts(l, l.purchase.customer.zeroRated)
  const topCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent?.name ?? l.product.categoryRef?.name ?? l.product.category).toUpperCase()
  const subCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent ? l.product.categoryRef.name : topCategoryOf(l)).toUpperCase()

  const { groups, grandTotal } = groupRows(lines, {
    groups: [
      {
        label: (l) => accountCategoryBand(l.purchase.customer),
        order: ACCOUNT_CATEGORY_ORDER,
        sortLast: [UNCATEGORISED],
      },
      { label: topCategoryOf },
      { label: subCategoryOf, collapseIfSameAsParent: true },
    ],
    row: {
      key: (l) => l.product.code,
      build: (items, totals) => {
        const mass = totals.mass!
        const grand = totals.grandTotal!
        return {
          code: items[0]!.product.code,
          name: items[0]!.product.name,
          avgPrice: mass.isZero() ? null : grand.div(mass).toFixed(6),
          mass: mass.toFixed(3),
          subTotal: totals.subTotal!.toFixed(2),
          vat: totals.vat!.toFixed(2),
          grandTotal: grand.toFixed(2),
        }
      },
      sortBy: (items) => items[0]!.product.name,
    },
    measures: {
      mass: (l) => new Decimal(l.quantity.toString()),
      subTotal: (l) => amountsOf(l).subTotal,
      vat: (l) => amountsOf(l).vat,
      grandTotal: (l) => amountsOf(l).grandTotal,
    },
    formatTotals: (t) => ({
      mass: t.mass!.toFixed(3),
      subTotal: t.subTotal!.toFixed(2),
      vat: t.vat!.toFixed(2),
      grandTotal: t.grandTotal!.toFixed(2),
    }),
  })

  return {
    reportId: 'purchases-by-product-category',
    title: 'Purchases per Product Summary per Account Category',
    params: {
      from: params.from,
      to: params.to,
      ...(params.dealerCategory ? { filters: { dealerCategory: params.dealerCategory } } : {}),
    },
    columns: [
      { key: 'code', label: 'Code', width: 0.1, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.26, format: 'text', excelWidth: 28 },
      { key: 'avgPrice', label: 'Price Incl.', width: 0.14, align: 'right', format: 'money6', excelWidth: 14 },
      { key: 'mass', label: 'Mass', width: 0.12, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'subTotal', label: 'Sub Total', width: 0.13, align: 'right', format: 'money', excelWidth: 14 },
      { key: 'vat', label: 'VAT', width: 0.11, align: 'right', format: 'money', excelWidth: 12 },
      { key: 'grandTotal', label: 'Grand Total', width: 0.14, align: 'right', format: 'money', excelWidth: 14 },
    ],
    groups,
    grandTotal,
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}
