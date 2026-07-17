import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { searchCustomers } from '@/lib/services/customerService'
import { buildReportMeta } from '@/lib/services/reports/meta'
import { generateBusinessReportPdf } from '@/lib/pdf/businessReport'
import { generateBusinessReportXlsx } from '@/lib/excel/businessReportXlsx'
import type { ReportDocument } from '@/lib/reports/types'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * GET /api/casual/export?format=xlsx|pdf&search=&blacklisted=&dealerCategory=&primaryFunction=
 * Downloads the filtered casual-seller register as an Excel or PDF file.
 * Filter params mirror GET /api/customers so the export matches the list view.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const format = sp.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const query           = sp.get('search')          ?? ''
  const blacklisted     = sp.has('blacklisted') ? sp.get('blacklisted') === 'true' : undefined
  const dealerCategory  = sp.get('dealerCategory')  ?? undefined
  const primaryFunction = sp.get('primaryFunction') ?? undefined

  try {
    const { customers, meta } = await runWithRequestTenant(req, async () => {
      const { customers } = await searchCustomers(
        query,
        { type: 'casual', blacklisted, dealerCategory, primaryFunction },
        1,
        10000,
      )
      const meta = await buildReportMeta(session.user.name ?? session.user.username ?? 'Unknown')
      return { customers, meta }
    })
    if (meta.company.name === 'Renovo Pro') {
      meta.company = { ...meta.company, name: 'Golden Key Investments (Pty) Ltd' }
    }

    const oldest = customers.reduce<Date | null>(
      (min, c) => (min === null || c.createdAt < min ? c.createdAt : min),
      null,
    )

    const doc: ReportDocument = {
      reportId: 'casual-sellers',
      title: 'Casual Sellers Register',
      subtitle: [
        query && `Search: "${query}"`,
        blacklisted !== undefined && (blacklisted ? 'Blacklisted only' : 'Active only'),
        dealerCategory && `Category: ${dealerCategory}`,
        primaryFunction && `Function: ${primaryFunction}`,
      ].filter(Boolean).join(' · ') || undefined,
      params: {
        from: (oldest ?? new Date()).toISOString(),
        to: new Date().toISOString(),
      },
      columns: [
        { key: 'idNumber',    label: 'ID Number',   width: 0.13, excelWidth: 16 },
        { key: 'firstName',   label: 'First Name',  width: 0.13, excelWidth: 16 },
        { key: 'lastName',    label: 'Last Name',   width: 0.13, excelWidth: 16 },
        { key: 'phone',       label: 'Phone',       width: 0.11, excelWidth: 14 },
        { key: 'address',     label: 'Address',     width: 0.24, excelWidth: 30 },
        { key: 'active',      label: 'Active',      width: 0.07, excelWidth: 8,  align: 'center' },
        { key: 'blacklisted', label: 'Blacklisted', width: 0.09, excelWidth: 11, align: 'center' },
        { key: 'created',     label: 'Registered',  width: 0.10, excelWidth: 12, format: 'date' },
      ],
      groups: [
        {
          level: 0,
          label: 'CASUAL SELLERS',
          rows: customers.map((c) => ({
            cells: {
              idNumber:    c.idNumber,
              firstName:   c.firstName,
              lastName:    c.lastName,
              phone:       c.phone,
              address:     c.physicalAddress ?? '',
              active:      c.isActive ? 'Yes' : 'No',
              blacklisted: c.blacklisted ? 'Yes' : 'No',
              created:     c.createdAt.toISOString(),
            },
          })),
        },
      ],
      meta: { ...meta, rowCount: customers.length },
    }

    const filename = `casual-sellers-${new Date().toISOString().slice(0, 10)}.${format}`
    let body: ArrayBuffer
    if (format === 'pdf') {
      const pdfBytes = await generateBusinessReportPdf(doc)
      body = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    } else {
      body = generateBusinessReportXlsx(doc)
    }

    logger.info({ userId: session.user.id, format, rows: customers.length }, 'casual.export')

    return new NextResponse(body, {
      headers: {
        'Content-Type':
          format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(body.byteLength),
      },
    })
  } catch (err) {
    logger.error({ err }, 'GET /api/casual/export failed')
    return NextResponse.json({ error: 'Failed to export casual sellers' }, { status: 500 })
  }
}
