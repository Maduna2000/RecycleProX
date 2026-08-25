import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { z } from 'zod'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId, runWithRequestTenant } from '@/lib/db/tenantContext'

// ─── Per-row schema ────────────────────────────────────────────────────────────
// Mirrors CreateProductSchema (src/lib/schemas/product.ts) field-for-field —
// kept separate rather than imported/reused because this one accepts a few
// header-variant fallbacks and blank-string normalisation a plain form input
// never has to deal with.

const positiveDecimal = z
  .string()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid price (e.g. 12.50)')
  .refine((v) => parseFloat(v) >= 0, 'Price cannot be negative')

const RowSchema = z.object({
  code:             z.string().min(1, 'Product code is required').max(20).toUpperCase(),
  name:             z.string().min(1, 'Product name is required').max(100),
  category:         z.string().min(1, 'Category is required'),
  unit:             z.enum(['kg', 'ton', 'each', 'litre']).default('kg'),
  defaultBuyPrice:  positiveDecimal,
  defaultSellPrice: positiveDecimal,
  minStockLevel:    z.string().regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid quantity').optional().or(z.literal('')),
})

type RowInput = z.infer<typeof RowSchema>
type ImportError = { row: number; code: string; reason: string }

/**
 * POST /api/products/import
 * Body: multipart/form-data with file field "csv"
 * Expected columns (case-insensitive, a few common variants accepted):
 * code, name, category, unit, defaultBuyPrice (or buyPrice), defaultSellPrice
 * (or sellPrice), minStockLevel (optional).
 *
 * Upsert by code: a code that already exists gets every field in the row
 * (including prices) applied to it rather than being skipped — this is
 * also how a re-import bulk-refreshes prices. Only a genuinely unresolvable
 * row (bad data, or a category that doesn't exist yet) is skipped.
 *
 * Manager/admin only. Mirrors /api/casual/import's shape and conventions.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — manager or admin required' }, { status: 403 })
  }

  let csvText: string
  try {
    const formData = await req.formData()
    const file = formData.get('csv')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'csv file field is required' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })
    }
    csvText = await file.text()
  } catch {
    return NextResponse.json({ error: 'Failed to read uploaded file' }, { status: 400 })
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
    transform: (v: string) => v.trim(),
  })

  if (!parsed.data.length) {
    return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 })
  }

  const errors: ImportError[] = []
  const validRows: { row: number; data: RowInput }[] = []

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i] ?? {}
    const rowNum = i + 2 // +2 = 1-indexed + header row
    const rawUnit = (raw['unit'] ?? raw['Unit'] ?? '').toLowerCase()
    const normalised = {
      code:             raw['code']             ?? raw['Code']             ?? raw['Product Code'] ?? '',
      name:             raw['name']             ?? raw['Name']             ?? raw['Product Name'] ?? '',
      category:         raw['category']         ?? raw['Category']        ?? '',
      unit:             rawUnit || undefined,
      defaultBuyPrice:  raw['defaultBuyPrice']  ?? raw['buyPrice']        ?? raw['Buy Price']  ?? '',
      defaultSellPrice: raw['defaultSellPrice'] ?? raw['sellPrice']       ?? raw['Sell Price'] ?? '',
      minStockLevel:    raw['minStockLevel']    ?? raw['Min Stock Level'] ?? '',
    }

    const result = RowSchema.safeParse(normalised)
    if (!result.success) {
      const msg = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
      errors.push({ row: rowNum, code: normalised.code || '—', reason: msg })
    } else {
      validRows.push({ row: rowNum, data: result.data })
    }
  }

  if (validRows.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, skipped: 0, errors }, { status: 422 })
  }

  let imported = 0
  let updated = 0
  let skipped = errors.length

  await runWithRequestTenant(req, () => prisma.$transaction(async (tx) => {
    const tenantId = requireTenantId()
    const categories = await tx.productCategory.findMany({ where: { tenantId }, select: { id: true, name: true } })
    const categoryByName = new Map(categories.map((c) => [c.name, c.id]))

    for (const { row, data } of validRows) {
      const categoryId = categoryByName.get(data.category)
      if (!categoryId) {
        skipped++
        errors.push({ row, code: data.code, reason: `Category "${data.category}" does not exist — create it first under Products → Categories` })
        continue
      }

      const productData = {
        name: data.name,
        category: data.category,
        categoryId,
        unit: data.unit,
        defaultBuyPrice: new Decimal(data.defaultBuyPrice),
        defaultSellPrice: new Decimal(data.defaultSellPrice),
        minStockLevel: data.minStockLevel ? new Decimal(data.minStockLevel) : null,
      }

      // Existing product with this code → update every field (including
      // price) from the row instead of skipping it, so a CSV re-import is
      // also how prices get bulk-refreshed. New code → create it.
      const existing = await tx.product.findUnique({ where: { tenantId_code: { tenantId, code: data.code } } })
      if (existing) {
        await tx.product.update({ where: { id: existing.id }, data: productData })
        updated++
      } else {
        await tx.product.create({ data: { tenantId, code: data.code, isActive: true, ...productData } })
        imported++
      }
    }
  }))

  logger.info({ userId: session.user.id, imported, updated, skipped, errors: errors.length }, 'product.import')
  return NextResponse.json({ imported, updated, skipped, errors })
}
