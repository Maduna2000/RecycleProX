import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth-helpers'
import { REPORT_REGISTRY } from '@/lib/services/reports/registry'
import { buildReportMeta } from '@/lib/services/reports/meta'
import { ReportFormatSchema } from '@/lib/schemas/report'
import { generateBusinessReportPdf } from '@/lib/pdf/businessReport'
import { generateBusinessReportXlsx } from '@/lib/excel/businessReportXlsx'
import { encodeJsonField } from '@/lib/db/queryHelpers'

/**
 * GET /api/reports/[reportId]?from=YYYY-MM-DD&to=YYYY-MM-DD&format=json|pdf|xlsx&<filters>
 *
 * One pipeline for every business report: auth → registry lookup → Zod params
 * → build ReportDocument → render (json preview / pdf / xlsx download).
 * PDF/Excel downloads write an EXPORT audit entry.
 *
 * The static /api/reports route (Overview tab aggregates) is unaffected —
 * this dynamic segment only matches subpaths.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { session, response } = await requireRole(['admin', 'manager'])
  if (response) return response

  const { reportId } = await params

  const definition = REPORT_REGISTRY[reportId]
  if (!definition) {
    return NextResponse.json({ error: `Unknown report "${reportId}"` }, { status: 404 })
  }

  const search = Object.fromEntries(req.nextUrl.searchParams.entries())
  const { format: formatRaw, ...paramsRaw } = search

  const formatParse = ReportFormatSchema.safeParse(formatRaw ?? 'json')
  if (!formatParse.success) {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }
  const format = formatParse.data

  const paramsParse = definition.paramsSchema.safeParse(paramsRaw)
  if (!paramsParse.success) {
    return NextResponse.json(
      { error: 'Invalid report parameters', details: paramsParse.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const metaBase = await buildReportMeta(session.user.name ?? session.user.username ?? 'Unknown')
    const doc = await definition.build(paramsParse.data, metaBase)

    if (format === 'json') {
      return NextResponse.json(doc)
    }

    const filename = `${reportId}_${doc.params.from}_${doc.params.to}.${format}`
    let body: ArrayBuffer
    if (format === 'pdf') {
      const pdfBytes = await generateBusinessReportPdf(doc)
      body = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    } else {
      body = generateBusinessReportXlsx(doc)
    }

    // Explicit EXPORT audit entry — the Prisma middleware only covers
    // business-model writes, not report downloads.
    prisma.auditLog
      .create({
        data: {
          tableName: 'report',
          recordId: reportId,
          action: 'EXPORT',
          newValues: encodeJsonField({ format, params: doc.params, rowCount: doc.meta.rowCount }),
          changedById: session.user.id ?? null,
          rowHash: '',
        },
      })
      .catch((err) => logger.error({ err, reportId }, 'report.export.audit.failed'))

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
    logger.error({ err, reportId, params: paramsRaw }, 'GET /api/reports/[reportId] failed')
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
