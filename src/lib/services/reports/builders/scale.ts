/**
 * Scale vs Purchase Discrepancy report — reconciles what was weighed at the
 * Scale Station against what was actually captured on the matching
 * purchase, per product. Surfaces three distinct failure modes rather than
 * a single netted number, since a naive per-product total across the whole
 * yard would let a +5kg ticket and a -5kg ticket cancel out and hide real
 * shrinkage:
 *
 *  - MATCHED     — a scale order was turned into a purchase; weighed vs
 *                   bought weight is compared directly, per product.
 *  - SHORTFALL   — a scale order was weighed (status 'processed') but never
 *                   became a purchase at all. The full weighed amount is
 *                   unaccounted for — the strongest leakage signal.
 *  - UNVERIFIED  — a purchase was captured with no linked scale order, i.e.
 *                   the quantity was never independently weighed at the
 *                   station. Not a variance by itself, but flags where the
 *                   scale control was bypassed entirely.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { groupRows } from '@/lib/services/reports/grouping'
import { countDataRows } from '@/lib/reports/flatten'
import type { ReportDocument, ReportMeta, ReportRow } from '@/lib/reports/types'
import type { ScaleDiscrepancyParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const D = (v: unknown) => new Decimal(String(v ?? 0))

function customerName(c: { firstName: string; lastName: string; companyName?: string | null } | null): string {
  if (!c) return '—'
  return (c.companyName?.trim() || `${c.firstName} ${c.lastName}`).toUpperCase()
}

interface Item {
  date: Date
  productId: string
  productName: string
  productCode: string
  category: string
  status: 'MATCHED' | 'SHORTFALL' | 'UNVERIFIED'
  scaleRef: string | null
  purchaseRef: string | null
  customer: string
  operator: string | null
  weighed: Decimal | null
  purchased: Decimal | null
}

export async function buildScaleDiscrepancy(
  params: ScaleDiscrepancyParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const productFilter = params.productId ? { id: params.productId } : undefined
  const minVariancePct = params.minVariancePct ? new Decimal(params.minVariancePct) : null

  const productSelect = {
    id: true,
    code: true,
    name: true,
    category: true,
    categoryRef: { select: { name: true, parent: { select: { name: true } } } },
  } as const
  const categoryOf = (p: { category: string; categoryRef: { name: string; parent: { name: string } | null } | null }) =>
    (p.categoryRef?.parent?.name ?? p.categoryRef?.name ?? p.category).toUpperCase()

  // Weighed side — every processed, non-voided scale order in the period,
  // with its lines (the authoritative per-product weight — see scaleService:
  // the order header's own weight/productId only ever mirrors the first
  // line) and whatever purchase it turned into, if any.
  const scaleOrders = await prisma.scaleOrder.findMany({
    where: {
      status: 'processed',
      voidedAt: null,
      createdAt: { gte: start, lte: end },
      ...(productFilter ? { lines: { some: { productId: productFilter.id } } } : {}),
    },
    select: {
      orderNumber: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      casualFirstName: true,
      casualLastName: true,
      operator: { select: { fullName: true } },
      lines: { select: { productId: true, weight: true, product: { select: productSelect } } },
      purchase: {
        select: {
          refNumber: true,
          status: true,
          lines: { select: { productId: true, quantity: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const items: Item[] = []

  for (const so of scaleOrders) {
    const custName = so.customer
      ? customerName(so.customer)
      : (so.casualFirstName ? `${so.casualFirstName} ${so.casualLastName ?? ''}`.trim().toUpperCase() : '—')
    const purchaseValid = so.purchase && so.purchase.status !== 'voided' ? so.purchase : null

    const weighedByProduct = new Map<string, Decimal>()
    const productMeta = new Map<string, { code: string; name: string; category: string }>()
    for (const l of so.lines) {
      if (!l.weight) continue
      weighedByProduct.set(l.productId, (weighedByProduct.get(l.productId) ?? new Decimal(0)).plus(D(l.weight)))
      if (!productMeta.has(l.productId)) {
        productMeta.set(l.productId, { code: l.product.code, name: l.product.name, category: categoryOf(l.product) })
      }
    }

    const purchasedByProduct = new Map<string, Decimal>()
    if (purchaseValid) {
      for (const pl of purchaseValid.lines) {
        if (!weighedByProduct.has(pl.productId)) continue // scoped to products this scale order actually weighed
        purchasedByProduct.set(pl.productId, (purchasedByProduct.get(pl.productId) ?? new Decimal(0)).plus(D(pl.quantity)))
      }
    }

    for (const [productId, weighed] of weighedByProduct) {
      const pm = productMeta.get(productId)!
      items.push({
        date: so.createdAt,
        productId,
        productName: pm.name,
        productCode: pm.code,
        category: pm.category,
        status: purchaseValid ? 'MATCHED' : 'SHORTFALL',
        scaleRef: so.orderNumber,
        purchaseRef: purchaseValid?.refNumber ?? null,
        customer: custName,
        operator: so.operator?.fullName ?? null,
        weighed,
        purchased: purchaseValid ? (purchasedByProduct.get(productId) ?? new Decimal(0)) : new Decimal(0),
      })
    }
  }

  // Unverified side — completed purchases in the period with no scale order
  // behind them at all (quantity typed in directly, never independently
  // weighed). No variance to compute; listed so the gap in scale coverage
  // is visible on the same report.
  const unverifiedPurchases = await prisma.purchase.findMany({
    where: {
      status: 'completed',
      scaleOrderId: null,
      createdAt: { gte: start, lte: end },
      ...(productFilter ? { lines: { some: { productId: productFilter.id } } } : {}),
    },
    select: {
      refNumber: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true, companyName: true } },
      lines: {
        select: { productId: true, quantity: true, product: { select: productSelect } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const p of unverifiedPurchases) {
    const byProduct = new Map<string, Decimal>()
    const productMeta = new Map<string, { code: string; name: string; category: string }>()
    for (const l of p.lines) {
      if (productFilter && l.productId !== productFilter.id) continue
      byProduct.set(l.productId, (byProduct.get(l.productId) ?? new Decimal(0)).plus(D(l.quantity)))
      if (!productMeta.has(l.productId)) {
        productMeta.set(l.productId, { code: l.product.code, name: l.product.name, category: categoryOf(l.product) })
      }
    }
    for (const [productId, purchased] of byProduct) {
      const pm = productMeta.get(productId)!
      items.push({
        date: p.createdAt,
        productId,
        productName: pm.name,
        productCode: pm.code,
        category: pm.category,
        status: 'UNVERIFIED',
        scaleRef: null,
        purchaseRef: p.refNumber,
        customer: customerName(p.customer),
        operator: null,
        weighed: null,
        purchased,
      })
    }
  }

  // Noise control — a MATCHED row within the tolerance band (moisture, dust,
  // rounding) is dropped when a threshold is set. SHORTFALL and UNVERIFIED
  // rows are never filtered: a fully unaccounted weigh-in or an unweighed
  // purchase is a coverage gap regardless of size, not a magnitude question.
  const filtered = minVariancePct
    ? items.filter((it) => {
        if (it.status !== 'MATCHED') return true
        const weighed = it.weighed!
        const variance = it.purchased!.minus(weighed)
        const pct = weighed.isZero() ? new Decimal(100) : variance.abs().div(weighed).times(100)
        return pct.greaterThanOrEqualTo(minVariancePct)
      })
    : items

  const { groups, grandTotal } = groupRows(filtered, {
    groups: [
      { label: (it) => it.category },
      { label: (it) => `${it.productCode} — ${it.productName}`, collapseIfSameAsParent: true },
    ],
    row: {
      key: (it) => `${it.scaleRef ?? 'none'}|${it.purchaseRef ?? 'none'}|${it.productId}`,
      build: (group): ReportRow['cells'] => {
        const it = group[0]!
        const weighed = it.weighed
        const purchased = it.purchased
        const variance = weighed !== null && purchased !== null ? purchased.minus(weighed) : null
        const variancePct = variance !== null && weighed !== null
          ? (weighed.isZero() ? (variance.isZero() ? '0.0' : '100.0') : variance.div(weighed).times(100).toFixed(1))
          : null
        return {
          date: it.date.toISOString(),
          status: it.status,
          scaleRef: it.scaleRef,
          purchaseRef: it.purchaseRef,
          customer: it.customer,
          operator: it.operator,
          weighed: weighed !== null ? weighed.toFixed(3) : null,
          purchased: purchased !== null ? purchased.toFixed(3) : null,
          variance: variance !== null ? variance.toFixed(3) : null,
          variancePct,
        }
      },
      sortBy: (group) => group[0]!.date.toISOString(),
    },
    // UNVERIFIED rows carry no scale counterpart, so they're excluded from
    // the numeric totals entirely (their purchased weight is already
    // reflected in the ordinary purchases reports) — otherwise their
    // purchased-but-not-weighed amount would land in the totals as pure
    // "overage" and distort the shrinkage %, which is a scale-side measure.
    measures: {
      weighed: (it) => (it.status === 'UNVERIFIED' ? new Decimal(0) : it.weighed ?? new Decimal(0)),
      purchased: (it) => (it.status === 'UNVERIFIED' ? new Decimal(0) : it.purchased ?? new Decimal(0)),
      variance: (it) =>
        it.status === 'UNVERIFIED' ? new Decimal(0) : (it.purchased ?? new Decimal(0)).minus(it.weighed ?? new Decimal(0)),
    },
    formatTotals: (t) => ({
      weighed: t.weighed!.toFixed(3),
      purchased: t.purchased!.toFixed(3),
      variance: t.variance!.toFixed(3),
    }),
  })

  const shortfallCount = filtered.filter((it) => it.status === 'SHORTFALL').length
  const unverifiedCount = filtered.filter((it) => it.status === 'UNVERIFIED').length
  const totalWeighed = new Decimal(grandTotal.weighed ?? '0')
  const totalVariance = new Decimal(grandTotal.variance ?? '0')
  const overallShrinkagePct = totalWeighed.isZero() ? '0.0' : totalVariance.div(totalWeighed).times(100).toFixed(1)

  return {
    reportId: 'scale-purchase-discrepancy',
    title: 'Scale vs Purchase Discrepancy',
    subtitle: 'Weighed at Scale Station vs actually purchased, per product — negative variance = weighed but not (fully) paid for',
    orientation: 'landscape',
    params: {
      from: params.from,
      to: params.to,
      filters: {
        ...(params.productId ? { productId: params.productId } : {}),
        ...(params.minVariancePct ? { minVariancePct: params.minVariancePct } : {}),
      },
    },
    columns: [
      { key: 'date', label: 'Date', width: 0.09, format: 'date', excelWidth: 12 },
      { key: 'status', label: 'Status', width: 0.09, format: 'text', excelWidth: 11 },
      { key: 'scaleRef', label: 'Scale Order', width: 0.1, format: 'text', excelWidth: 13 },
      { key: 'purchaseRef', label: 'Purchase Ref', width: 0.1, format: 'text', excelWidth: 13 },
      { key: 'customer', label: 'Customer', width: 0.16, format: 'text', excelWidth: 22 },
      { key: 'operator', label: 'Operator', width: 0.11, format: 'text', excelWidth: 16 },
      { key: 'weighed', label: 'Weighed (kg)', width: 0.11, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'purchased', label: 'Purchased (kg)', width: 0.11, align: 'right', format: 'mass', excelWidth: 13 },
      { key: 'variance', label: 'Variance (kg)', width: 0.09, align: 'right', format: 'mass', excelWidth: 12 },
      { key: 'variancePct', label: 'Var %', width: 0.04, align: 'right', format: 'text', excelWidth: 8 },
    ],
    groups,
    grandTotal,
    summary: [
      { label: 'Total Weighed at Scale', value: `${totalWeighed.toFixed(3)} kg` },
      { label: 'Overall Shrinkage', value: `${overallShrinkagePct}%`, emphasis: true },
      { label: 'Weighed but Never Purchased (SHORTFALL rows)', value: String(shortfallCount), emphasis: shortfallCount > 0 },
      { label: 'Purchased without a Scale Weigh-In (UNVERIFIED rows)', value: String(unverifiedCount), emphasis: unverifiedCount > 0 },
    ],
    meta: { ...meta, rowCount: countDataRows(groups) },
  }
}
