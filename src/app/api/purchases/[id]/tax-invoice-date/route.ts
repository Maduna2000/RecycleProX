import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { zodErrorMessage } from '@/lib/utils/zodError'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { SetTaxInvoiceDateSchema } from '@/lib/schemas/taxInvoiceDate'
import {
  getTaxInvoiceDateInfo, setTaxInvoiceDate,
  TaxInvoiceDocNotFoundError, TaxInvoiceDocVoidedError, TaxInvoiceDateInFutureError,
} from '@/lib/services/taxInvoiceDateService'

function serialize(info: Awaited<ReturnType<typeof getTaxInvoiceDateInfo>>) {
  return {
    effectiveDate: info.effectiveDate.toISOString(),
    source: info.source,
    override: info.override?.toISOString() ?? null,
  }
}

/** GET /api/purchases/[id]/tax-invoice-date — the date the tax invoice will print, and where it came from. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const info = await runWithRequestTenant(req, () => getTaxInvoiceDateInfo('purchase', id))
    return NextResponse.json(serialize(info))
  } catch (err) {
    if (err instanceof TaxInvoiceDocNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    logger.error({ err, id }, 'GET /api/purchases/[id]/tax-invoice-date failed')
    return NextResponse.json({ error: 'Failed to load tax invoice date' }, { status: 500 })
  }
}

/** PATCH /api/purchases/[id]/tax-invoice-date  { date: ISO | null } — null resets to the payment date. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — only managers can change the tax invoice date' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = SetTaxInvoiceDateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: zodErrorMessage(parsed.error), details: parsed.error.flatten() }, { status: 422 })

  const { id } = await params
  try {
    const info = await runWithRequestTenant(req, () =>
      setTaxInvoiceDate('purchase', id, parsed.data.date ? new Date(parsed.data.date) : null))
    return NextResponse.json(serialize(info))
  } catch (err) {
    if (err instanceof TaxInvoiceDocNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (err instanceof TaxInvoiceDocVoidedError) return NextResponse.json({ error: err.message }, { status: 409 })
    if (err instanceof TaxInvoiceDateInFutureError) return NextResponse.json({ error: err.message }, { status: 422 })
    logger.error({ err, id }, 'PATCH /api/purchases/[id]/tax-invoice-date failed')
    return NextResponse.json({ error: 'Failed to update tax invoice date' }, { status: 500 })
  }
}
