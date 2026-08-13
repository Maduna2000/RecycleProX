import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { buildPriceListPdfBytes } from '@/lib/services/priceListService'
import { PreviewPriceListSchema } from '@/lib/schemas/priceList'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * POST /api/price-lists/preview
 * Renders a PDF from unsaved draft state (title/items/colors/toggles) — used
 * by the editor's Preview button. Nothing is persisted.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Manager role required' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = PreviewPriceListSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const pdfBytes = await runWithRequestTenant(req, () => buildPriceListPdfBytes({
      title: parsed.data.title,
      listDate: new Date(`${parsed.data.listDate}T00:00:00.000Z`),
      footerText: parsed.data.footerText,
      showLogo: parsed.data.showLogo,
      showExVat: parsed.data.showExVat,
      colors: parsed.data.colors,
      items: parsed.data.items.map((item) => ({
        displayName: item.displayName,
        category: item.category,
        priceIncVat: item.priceIncVat,
      })),
    }))

    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="price-list-preview.pdf"',
      },
    })
  } catch (err) {
    logger.error({ err }, 'POST /api/price-lists/preview failed')
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
