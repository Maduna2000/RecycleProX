import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { getPriceList, buildPriceListPdfBytes } from '@/lib/services/priceListService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

class PriceListNotFoundError extends Error {}

/**
 * GET /api/price-lists/[id]/pdf?download=1
 * A4 price list PDF — inline for viewing/printing, ?download=1 for attachment.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const download = req.nextUrl.searchParams.get('download') === '1'

  try {
    const { priceList, pdfBytes } = await runWithRequestTenant(req, async () => {
      const priceList = await getPriceList(params.id).catch(() => null)
      if (!priceList) throw new PriceListNotFoundError()
      const pdfBytes = await buildPriceListPdfBytes({
        title: priceList.title,
        listDate: priceList.listDate,
        footerText: priceList.footerText,
        showLogo: priceList.showLogo,
        showExVat: priceList.showExVat,
        colors: {
          primaryColor:      priceList.primaryColor,
          accentColor:       priceList.accentColor,
          headerTextColor:   priceList.headerTextColor,
          materialTextColor: priceList.materialTextColor,
          priceTextColor:    priceList.priceTextColor,
          exVatTextColor:    priceList.exVatTextColor,
          rowTintColor:      priceList.rowTintColor,
        },
        items: priceList.items.map((item) => ({
          displayName: item.displayName,
          priceIncVat: item.priceIncVat.toString(),
        })),
      })
      return { priceList, pdfBytes }
    })

    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    const dateSlug = priceList.listDate.toISOString().slice(0, 10)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="price-list-${dateSlug}.pdf"`,
      },
    })
  } catch (err) {
    if (err instanceof PriceListNotFoundError) return NextResponse.json({ error: 'Price list not found' }, { status: 404 })
    logger.error({ err, priceListId: params.id }, 'GET /api/price-lists/[id]/pdf failed')
    return NextResponse.json({ error: 'Failed to generate price list PDF' }, { status: 500 })
  }
}
