import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getPurchase } from '@/lib/services/purchaseService'
import { getAllSettings } from '@/lib/services/settingsService'
import { CURRENCY_SYMBOLS } from '@/lib/schemas/cashup'
import { generateVat264 } from '@/lib/pdf/vat264'

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Await params for Next.js 15 compatibility
  const { id } = await context.params

  try {
    const purchase = await getPurchase(id)

    // Load yard settings + operating currency (from the latest cash-up)
    const [settings, latestCashUp] = await Promise.all([
      getAllSettings(),
      prisma.cashUp.findFirst({ orderBy: { sessionDate: 'desc' }, select: { currency: true } }),
    ])
    const currencySymbol =
      CURRENCY_SYMBOLS[latestCashUp?.currency as keyof typeof CURRENCY_SYMBOLS] ?? 'R'

    // Load signature bytes if stored in R2
    let signatureBytes: Uint8Array | undefined
    if (purchase.signatureR2Key) {
      try {
        const urlRes = await fetch(
          `${process.env.NEXTAUTH_URL ?? ''}/api/r2/view-url?key=${encodeURIComponent(purchase.signatureR2Key)}`,
          { headers: { cookie: `authjs.session-token=${session.user.id}` } }
        )
        if (urlRes.ok) {
          const { url } = await urlRes.json() as { url: string }
          const imgRes = await fetch(url)
          if (imgRes.ok) {
            signatureBytes = new Uint8Array(await imgRes.arrayBuffer())
          }
        }
      } catch {
        // Proceed without signature — non-fatal
      }
    }

    // Map purchase lines
    const lines = purchase.lines.map((l: {
      product: { name: string; unit: string }
      quantity: string | number | { toString(): string }
      unitPrice: string | number | { toString(): string }
      lineTotal: string | number | { toString(): string }
    }) => ({
      description: l.product.name,
      quantity:    l.quantity.toString(),
      unit:        l.product.unit,
      unitPrice:   l.unitPrice.toString(),
      lineTotal:   l.lineTotal.toString(),
    }))

    const pdfBytes = await generateVat264({
      dealerName:    settings.yardName    ?? 'Renovo Pro',
      dealerAddress: settings.yardAddress ?? 'Pretoria, South Africa',
      dealerVatNo:   settings.vatNumber   ?? '',
      dealerPhone:   settings.dealerPhone,
      refNumber:     purchase.refNumber,
      date:          new Date(purchase.createdAt),
      sellerName:    `${purchase.customer.firstName} ${purchase.customer.lastName}`,
      sellerIdNumber: purchase.customer.idNumber ?? '',
      sellerAddress: purchase.customer.physicalAddress ?? undefined,
      sellerPhone:   purchase.customer.phone,
      lines,
      totalAmount:   purchase.totalAmount.toString(),
      paymentMethod: purchase.paymentMethod,
      currencySymbol,
      signatureBytes,
    })

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="vat264-${purchase.refNumber}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (err) {
    logger.error({ err, purchaseId: id }, 'GET /api/purchases/[id]/vat264 failed')
    return NextResponse.json({ error: 'Failed to generate VAT264' }, { status: 500 })
  }
}
