/**
 * Police & Compliance report builders: the general-catalog Police Register,
 * and the Copper-specific reports (with and without the scale-station photo).
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import { getPurchasesForRegisterRange } from '@/lib/services/policeVisitService'
import type { ReportDocument, ReportMeta, ReportRow } from '@/lib/reports/types'
import type { BaseReportParams, PoliceCopperReportParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

/** View-URL generation must never break a report (e.g. R2 unconfigured locally). */
async function safeViewUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  try {
    return await getViewUrl(key)
  } catch {
    return null
  }
}

/**
 * Police Register — thin registry entry over the existing staff Police
 * Register query (getPurchasesForRegisterRange), so it gets PDF/Excel export
 * and shows up in the Reports catalog alongside the other reports. The
 * original single-day /api/police-register flow is untouched.
 */
export async function buildPoliceRegisterReport(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { start, end } = getRangeBoundsSAST(params.from, params.to)
  const { entries } = await getPurchasesForRegisterRange(start, end)

  const rows: ReportRow[] = entries.map((e) => ({
    cells: {
      date: e.createdAt.toISOString(),
      refNumber: e.refNumber,
      supplierName: e.supplierName,
      idNumber: e.idNumber,
      policeRegNo: e.policeRegNo ?? null,
      address: e.address,
      items: e.items,
      totalAmount: e.totalAmount,
    },
  }))

  const grandTotal = entries.reduce((acc, e) => acc.plus(new Decimal(e.totalAmount)), new Decimal(0))

  return {
    reportId: 'police-register',
    title: 'Police Register',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'date', label: 'Date/Time', width: 0.13, format: 'datetime', excelWidth: 16 },
      { key: 'refNumber', label: 'Trans No.', width: 0.11, format: 'text', excelWidth: 16 },
      { key: 'supplierName', label: 'Supplier Name', width: 0.16, format: 'text', excelWidth: 20 },
      { key: 'idNumber', label: 'ID Number', width: 0.12, format: 'text', excelWidth: 16 },
      { key: 'policeRegNo', label: 'Police Reg No.', width: 0.12, format: 'text', excelWidth: 16 },
      { key: 'address', label: 'Address', width: 0.16, format: 'text', excelWidth: 20 },
      { key: 'items', label: 'Items', width: 0.12, format: 'text', excelWidth: 24 },
      { key: 'totalAmount', label: 'Amount Paid', width: 0.08, align: 'right', format: 'money', excelWidth: 12 },
    ],
    groups: [{ level: 0, label: 'REGISTER', rows }],
    grandTotal: { totalAmount: grandTotal.toFixed(2) },
    meta: { ...meta, rowCount: rows.length },
  }
}

interface CopperPurchase {
  refNumber: string
  createdAt: Date
  sellerName: string
  company: string | null
  casualName: string | null
  idNumber: string | null
  netKg: Decimal
  scaleOrderPhotoKey: string | null
}

/**
 * Every completed purchase in the period containing at least one Copper-family
 * product (Copper itself or a subcategory, e.g. Bright/Burnt Copper, Copper
 * Tanks), with only the copper lines' quantity summed into netKg — a purchase
 * with mixed copper/non-copper lines only counts its copper portion.
 */
async function queryCopperPurchases(from: string, to: string, idNumber?: string): Promise<CopperPurchase[]> {
  const { start, end } = getRangeBoundsSAST(from, to)

  const lines = await prisma.purchaseLine.findMany({
    where: {
      purchase: {
        status: 'completed',
        createdAt: { gte: start, lte: end },
        ...(idNumber ? { customer: { idNumber: { contains: idNumber, mode: 'insensitive' } } } : {}),
      },
    },
    select: {
      quantity: true,
      product: {
        select: {
          category: true,
          categoryRef: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
      purchase: {
        select: {
          id: true,
          refNumber: true,
          createdAt: true,
          customer: {
            select: { firstName: true, lastName: true, companyName: true, customerType: true, idNumber: true },
          },
          scaleOrder: { select: { photoR2Keys: true } },
        },
      },
    },
  })

  type Line = (typeof lines)[number]
  const topCategoryOf = (l: Line) =>
    (l.product.categoryRef?.parent?.name ?? l.product.categoryRef?.name ?? l.product.category).toUpperCase()

  const byPurchase = new Map<string, CopperPurchase>()
  for (const l of lines) {
    if (topCategoryOf(l) !== 'COPPER') continue
    const p = l.purchase
    const qty = new Decimal(l.quantity.toString())
    const existing = byPurchase.get(p.id)
    if (existing) {
      existing.netKg = existing.netKg.plus(qty)
      continue
    }
    byPurchase.set(p.id, {
      refNumber: p.refNumber,
      createdAt: p.createdAt,
      sellerName: `${p.customer.firstName} ${p.customer.lastName}`,
      company: p.customer.companyName ?? null,
      casualName: p.customer.customerType === 'casual' ? `${p.customer.firstName} ${p.customer.lastName}` : null,
      idNumber: p.customer.idNumber ?? null,
      netKg: qty,
      // Index 1 = the "Product / Load" photo slot from the scale kiosk (Step4Photos);
      // index 0 is the scale-reading display, not the goods themselves.
      scaleOrderPhotoKey: p.scaleOrder?.photoR2Keys?.[1] ?? null,
    })
  }

  return Array.from(byPurchase.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

export async function buildPoliceCopperReport(
  params: PoliceCopperReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const purchases = await queryCopperPurchases(params.from, params.to, params.idNumber)

  const rows: ReportRow[] = purchases.map((p) => ({
    cells: {
      refNumber: p.refNumber,
      date: p.createdAt.toISOString(),
      sellerName: p.sellerName,
      company: p.company,
      casualName: p.casualName,
      idNumber: p.idNumber,
      netKg: p.netKg.toFixed(3),
    },
  }))

  const grandNetKg = purchases.reduce((acc, p) => acc.plus(p.netKg), new Decimal(0))

  return {
    reportId: 'police-copper-report',
    title: 'Police Copper Report',
    params: {
      from: params.from,
      to: params.to,
      ...(params.idNumber ? { filters: { idNumber: params.idNumber } } : {}),
    },
    columns: [
      { key: 'refNumber', label: 'Trans No.', width: 0.14, format: 'text', excelWidth: 16 },
      { key: 'date', label: 'Date/Time', width: 0.16, format: 'datetime', excelWidth: 16 },
      { key: 'sellerName', label: 'Seller Name', width: 0.18, format: 'text', excelWidth: 22 },
      { key: 'company', label: 'Company', width: 0.16, format: 'text', excelWidth: 20 },
      { key: 'casualName', label: 'Casual Name', width: 0.16, format: 'text', excelWidth: 20 },
      { key: 'idNumber', label: 'ID Number', width: 0.12, format: 'text', excelWidth: 16 },
      { key: 'netKg', label: 'Net Kg', width: 0.08, align: 'right', format: 'mass', excelWidth: 10 },
    ],
    groups: [{ level: 0, label: 'COPPER PURCHASES', rows }],
    grandTotal: { netKg: grandNetKg.toFixed(3) },
    meta: { ...meta, rowCount: rows.length },
  }
}

/**
 * Same data as buildPoliceCopperReport plus the scale-station photo, joined
 * via Purchase.scaleOrderId (populated when a purchase was created via
 * "Load from Scale Order"). Historical purchases without that link, or any
 * purchase not backed by a scale order, render "No image" rather than fail.
 */
export async function buildPoliceCopperReportImages(
  params: PoliceCopperReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const purchases = await queryCopperPurchases(params.from, params.to, params.idNumber)

  const rows: ReportRow[] = await Promise.all(
    purchases.map(async (p) => ({
      cells: {
        refNumber: p.refNumber,
        date: p.createdAt.toISOString(),
        sellerName: p.sellerName,
        company: p.company,
        casualName: p.casualName,
        idNumber: p.idNumber,
        netKg: p.netKg.toFixed(3),
      },
      imageR2Key: p.scaleOrderPhotoKey,
      imageUrl: await safeViewUrl(p.scaleOrderPhotoKey),
    }))
  )

  const grandNetKg = purchases.reduce((acc, p) => acc.plus(p.netKg), new Decimal(0))

  return {
    reportId: 'police-copper-report-images',
    title: 'Police Copper Report with Images',
    orientation: 'landscape',
    params: {
      from: params.from,
      to: params.to,
      ...(params.idNumber ? { filters: { idNumber: params.idNumber } } : {}),
    },
    columns: [
      { key: 'refNumber', label: 'Trans No.', width: 0.12, format: 'text', excelWidth: 16 },
      { key: 'date', label: 'Date/Time', width: 0.14, format: 'datetime', excelWidth: 16 },
      { key: 'sellerName', label: 'Seller Name', width: 0.15, format: 'text', excelWidth: 20 },
      { key: 'company', label: 'Company', width: 0.13, format: 'text', excelWidth: 18 },
      { key: 'casualName', label: 'Casual Name', width: 0.13, format: 'text', excelWidth: 18 },
      { key: 'idNumber', label: 'ID Number', width: 0.1, format: 'text', excelWidth: 14 },
      { key: 'netKg', label: 'Net Kg', width: 0.07, align: 'right', format: 'mass', excelWidth: 10 },
      { key: 'photo', label: 'Photo', width: 0.16, isImage: true },
    ],
    groups: [{ level: 0, label: 'COPPER PURCHASES', rows }],
    grandTotal: { netKg: grandNetKg.toFixed(3) },
    meta: { ...meta, rowCount: rows.length },
  }
}
