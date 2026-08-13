import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getAllSettings } from '@/lib/services/settingsService'
import { getPriceList, exVatPrice, PRICE_LIST_LOGO_SETTING_KEY } from '@/lib/services/priceListService'
import { fetchR2Bytes } from '@/lib/r2'
import { CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import { generatePriceListPdf } from '@/lib/pdf/priceList'
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
    const { priceList, settings, latestCashUp } = await runWithRequestTenant(req, async () => {
      const priceList = await getPriceList(params.id).catch(() => null)
      if (!priceList) throw new PriceListNotFoundError()
      const [settings, latestCashUp] = await Promise.all([
        getAllSettings(),
        prisma.cashUp.findFirst({ orderBy: { sessionDate: 'desc' }, select: { currency: true } }),
      ])
      return { priceList, settings, latestCashUp }
    })

    const logoKey = priceList.showLogo ? settings[PRICE_LIST_LOGO_SETTING_KEY] : undefined
    const logoBytes = logoKey ? await fetchR2Bytes(logoKey) : null
    const currencySymbol =
      CURRENCY_SYMBOLS[latestCashUp?.currency as keyof typeof CURRENCY_SYMBOLS] ?? 'R'

    const pdfBytes = await generatePriceListPdf({
      title: priceList.title,
      listDate: priceList.listDate,
      footerText: priceList.footerText,
      showExVat: priceList.showExVat,
      company: {
        name: settings['yardName'] ?? 'Renovo Pro',
        address: settings['yardAddress'] || undefined,
        phone: settings['yardPhone'] || undefined,
      },
      logoBytes,
      currencySymbol,
      items: priceList.items.map((item) => ({
        displayName: item.displayName,
        priceIncVat: item.priceIncVat.toString(),
        priceExVat: exVatPrice(item.priceIncVat.toString()).toFixed(2),
      })),
      generatedAt: new Date(),
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
