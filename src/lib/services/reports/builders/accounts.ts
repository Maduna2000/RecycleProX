/**
 * Accounts & Pricing report builders: dealer price list, account list, casual list.
 */
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { getRangeBoundsSAST } from '@/lib/utils/dayBounds'
import type { ReportDocument, ReportGroup, ReportMeta, ReportRow } from '@/lib/reports/types'
import type { BaseReportParams } from '@/lib/schemas/report'

type MetaBase = Omit<ReportMeta, 'rowCount'>

const DEALER_TIER_NAMES = ['Dealer 1', 'Dealer 2', 'Dealer 3'] as const

const DEALER_CATEGORY_LABELS: Record<string, string> = {
  casual: 'Casual',
  dealer_1: 'Dealer 1',
  dealer_2: 'Dealer 2',
  dealer_3: 'Dealer 3',
}

/**
 * Dealers Price List (all categories): current buy price for Casual (the
 * product default) and each Dealer tier (an override if one exists for that
 * tier, otherwise the same default) — a pricing snapshot, not period-filtered.
 */
export async function buildDealersPriceList(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const dealerGroups = await prisma.priceGroup.findMany({
    where: { name: { in: [...DEALER_TIER_NAMES] } },
    select: { id: true, name: true },
  })
  const groupIdByName = new Map(dealerGroups.map((g) => [g.name, g.id]))
  const groupIds = dealerGroups.map((g) => g.id)

  const [products, overrides] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        defaultBuyPrice: true,
        categoryRef: { select: { name: true, parent: { select: { name: true } } } },
      },
    }),
    groupIds.length > 0
      ? prisma.priceGroupProductOverride.findMany({
          where: { priceGroupId: { in: groupIds } },
          select: { priceGroupId: true, productId: true, buyPrice: true },
        })
      : Promise.resolve([]),
  ])

  const overrideMap = new Map<string, Decimal>()
  for (const o of overrides) {
    overrideMap.set(`${o.priceGroupId}:${o.productId}`, new Decimal(o.buyPrice.toString()))
  }

  type Product = (typeof products)[number]
  const priceFor = (product: Product, tierName: string): string => {
    const groupId = groupIdByName.get(tierName)
    const override = groupId ? overrideMap.get(`${groupId}:${product.id}`) : undefined
    return (override ?? new Decimal(product.defaultBuyPrice.toString())).toFixed(2)
  }
  const topCategoryOf = (p: Product) =>
    (p.categoryRef?.parent?.name ?? p.categoryRef?.name ?? p.category).toUpperCase()

  const rowsByCategory = new Map<string, ReportRow[]>()
  for (const p of [...products].sort((a, b) => a.name.localeCompare(b.name))) {
    const cat = topCategoryOf(p)
    if (!rowsByCategory.has(cat)) rowsByCategory.set(cat, [])
    rowsByCategory.get(cat)!.push({
      cells: {
        code: p.code,
        name: p.name,
        casualBuy: new Decimal(p.defaultBuyPrice.toString()).toFixed(2),
        dealer1Buy: priceFor(p, 'Dealer 1'),
        dealer2Buy: priceFor(p, 'Dealer 2'),
        dealer3Buy: priceFor(p, 'Dealer 3'),
      },
    })
  }

  const groups: ReportGroup[] = Array.from(rowsByCategory.keys())
    .sort()
    .map((cat) => ({ level: 0, label: cat, rows: rowsByCategory.get(cat)! }))

  return {
    reportId: 'dealers-price-list',
    title: 'Dealers Price List',
    subtitle: 'Current pricing snapshot — not filtered by the date range above',
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'code', label: 'Code', width: 0.12, format: 'text', excelWidth: 12 },
      { key: 'name', label: 'Product', width: 0.28, format: 'text', excelWidth: 28 },
      { key: 'casualBuy', label: 'Casual', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'dealer1Buy', label: 'Dealer 1', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'dealer2Buy', label: 'Dealer 2', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
      { key: 'dealer3Buy', label: 'Dealer 3', width: 0.15, align: 'right', format: 'money', excelWidth: 13 },
    ],
    groups,
    meta: { ...meta, rowCount: products.length },
  }
}

/** Account (dealer) customers as at the "to" date. */
export async function buildAccountList(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { end } = getRangeBoundsSAST(params.from, params.to)

  const customers = await prisma.customer.findMany({
    where: { customerType: 'account', createdAt: { lte: end } },
    select: {
      firstName: true,
      lastName: true,
      companyName: true,
      companyRegNumber: true,
      vatNumber: true,
      dealerCategory: true,
      phone: true,
      email: true,
      blacklisted: true,
      priceGroup: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const rows: ReportRow[] = customers.map((c) => ({
    cells: {
      name: `${c.firstName} ${c.lastName}`,
      company: c.companyName ?? null,
      regNumber: c.companyRegNumber ?? null,
      vatNumber: c.vatNumber ?? null,
      priceGroup: c.priceGroup?.name ?? (c.dealerCategory ? DEALER_CATEGORY_LABELS[c.dealerCategory] ?? null : null),
      phone: c.phone ?? null,
      email: c.email ?? null,
      blacklisted: c.blacklisted ? 'Yes' : 'No',
    },
  }))

  return {
    reportId: 'account-list',
    title: 'Account List',
    subtitle: `As at ${params.to}`,
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'name', label: 'Name', width: 0.15, format: 'text', excelWidth: 20 },
      { key: 'company', label: 'Company', width: 0.17, format: 'text', excelWidth: 22 },
      { key: 'regNumber', label: 'Reg No.', width: 0.12, format: 'text', excelWidth: 16 },
      { key: 'vatNumber', label: 'VAT No.', width: 0.11, format: 'text', excelWidth: 14 },
      { key: 'priceGroup', label: 'Price Group', width: 0.11, format: 'text', excelWidth: 14 },
      { key: 'phone', label: 'Phone', width: 0.12, format: 'text', excelWidth: 14 },
      { key: 'email', label: 'Email', width: 0.13, format: 'text', excelWidth: 20 },
      { key: 'blacklisted', label: 'Blacklisted', width: 0.09, align: 'center', format: 'text', excelWidth: 10 },
    ],
    groups: [{ level: 0, label: 'ACCOUNTS', rows }],
    meta: { ...meta, rowCount: rows.length },
  }
}

/**
 * Account (dealer) customers as at the "to" date, with whether an "ID"
 * document has been uploaded via the customer profile's Documents tab
 * (CustomerDocument, documentType 'id_copy') — the dedicated ID Photo field
 * (idPhotoR2Key, set during gate/scale/purchase intake) is a separate,
 * older mechanism and deliberately not counted here.
 */
export async function buildAccountIdUploadStatus(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { end } = getRangeBoundsSAST(params.from, params.to)

  const customers = await prisma.customer.findMany({
    where: { customerType: 'account', createdAt: { lte: end } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      accountCode: true,
      idNumber: true,
      phone: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const customerIds = customers.map((c) => c.id)
  const idDocs = customerIds.length > 0
    ? await prisma.customerDocument.findMany({
        where: { customerId: { in: customerIds }, documentType: 'id_copy' },
        select: { customerId: true },
      })
    : []
  const hasIdDocument = new Set(idDocs.map((d) => d.customerId))

  const rows: ReportRow[] = customers.map((c) => ({
    cells: {
      name: `${c.firstName} ${c.lastName}`,
      accountCode: c.accountCode ?? null,
      idNumber: c.idNumber ?? null,
      phone: c.phone ?? null,
      idUploaded: hasIdDocument.has(c.id) ? 'Yes' : 'No',
    },
  }))

  const uploadedCount = rows.filter((r) => r.cells.idUploaded === 'Yes').length
  const missingCount = rows.length - uploadedCount

  return {
    reportId: 'account-id-status',
    title: 'Account ID Upload Status',
    subtitle: `As at ${params.to}`,
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'name', label: 'Name', width: 0.26, format: 'text', excelWidth: 24 },
      { key: 'accountCode', label: 'Account Code', width: 0.18, format: 'text', excelWidth: 16 },
      { key: 'idNumber', label: 'ID Number', width: 0.2, format: 'text', excelWidth: 18 },
      { key: 'phone', label: 'Phone', width: 0.16, format: 'text', excelWidth: 14 },
      { key: 'idUploaded', label: 'ID Uploaded', width: 0.2, align: 'center', format: 'text', excelWidth: 12 },
    ],
    groups: [{ level: 0, label: 'ACCOUNTS', rows }],
    summary: [
      { label: 'Total accounts', value: String(rows.length) },
      { label: 'ID uploaded', value: String(uploadedCount) },
      { label: 'ID missing', value: String(missingCount), emphasis: missingCount > 0 },
    ],
    meta: { ...meta, rowCount: rows.length },
  }
}

/**
 * Casual (walk-in) sellers as at the "to" date, with whether an "ID"
 * document has been uploaded via the customer profile's Documents tab
 * (CustomerDocument, documentType 'id_copy') — same rule as the account
 * version, deliberately not counting the older idPhotoR2Key field.
 */
export async function buildCasualIdUploadStatus(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { end } = getRangeBoundsSAST(params.from, params.to)

  const customers = await prisma.customer.findMany({
    where: { customerType: 'casual', createdAt: { lte: end } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      idNumber: true,
      phone: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const customerIds = customers.map((c) => c.id)
  const idDocs = customerIds.length > 0
    ? await prisma.customerDocument.findMany({
        where: { customerId: { in: customerIds }, documentType: 'id_copy' },
        select: { customerId: true },
      })
    : []
  const hasIdDocument = new Set(idDocs.map((d) => d.customerId))

  const rows: ReportRow[] = customers.map((c) => ({
    cells: {
      name: `${c.firstName} ${c.lastName}`,
      idNumber: c.idNumber ?? null,
      phone: c.phone ?? null,
      idUploaded: hasIdDocument.has(c.id) ? 'Yes' : 'No',
    },
  }))

  const uploadedCount = rows.filter((r) => r.cells.idUploaded === 'Yes').length
  const missingCount = rows.length - uploadedCount

  return {
    reportId: 'casual-id-status',
    title: 'Casual ID Upload Status',
    subtitle: `As at ${params.to}`,
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'name', label: 'Name', width: 0.32, format: 'text', excelWidth: 24 },
      { key: 'idNumber', label: 'ID Number', width: 0.24, format: 'text', excelWidth: 18 },
      { key: 'phone', label: 'Phone', width: 0.2, format: 'text', excelWidth: 16 },
      { key: 'idUploaded', label: 'ID Uploaded', width: 0.24, align: 'center', format: 'text', excelWidth: 12 },
    ],
    groups: [{ level: 0, label: 'CASUAL SELLERS', rows }],
    summary: [
      { label: 'Total casual sellers', value: String(rows.length) },
      { label: 'ID uploaded', value: String(uploadedCount) },
      { label: 'ID missing', value: String(missingCount), emphasis: missingCount > 0 },
    ],
    meta: { ...meta, rowCount: rows.length },
  }
}

/** Casual (walk-in) sellers as at the "to" date. */
export async function buildCasualList(
  params: BaseReportParams,
  meta: MetaBase
): Promise<ReportDocument> {
  const { end } = getRangeBoundsSAST(params.from, params.to)

  const customers = await prisma.customer.findMany({
    where: { customerType: 'casual', createdAt: { lte: end } },
    select: {
      firstName: true,
      lastName: true,
      idNumber: true,
      phone: true,
      policeRegisterNo: true,
      blacklisted: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const rows: ReportRow[] = customers.map((c) => ({
    cells: {
      name: `${c.firstName} ${c.lastName}`,
      idNumber: c.idNumber ?? null,
      phone: c.phone ?? null,
      policeRegNo: c.policeRegisterNo ?? null,
      blacklisted: c.blacklisted ? 'Yes' : 'No',
    },
  }))

  return {
    reportId: 'casual-list',
    title: 'Casual List',
    subtitle: `As at ${params.to}`,
    params: { from: params.from, to: params.to },
    columns: [
      { key: 'name', label: 'Name', width: 0.28, format: 'text', excelWidth: 24 },
      { key: 'idNumber', label: 'ID Number', width: 0.22, format: 'text', excelWidth: 18 },
      { key: 'phone', label: 'Phone', width: 0.18, format: 'text', excelWidth: 16 },
      { key: 'policeRegNo', label: 'Police Reg No.', width: 0.2, format: 'text', excelWidth: 18 },
      { key: 'blacklisted', label: 'Blacklisted', width: 0.12, align: 'center', format: 'text', excelWidth: 10 },
    ],
    groups: [{ level: 0, label: 'CASUAL SELLERS', rows }],
    meta: { ...meta, rowCount: rows.length },
  }
}
