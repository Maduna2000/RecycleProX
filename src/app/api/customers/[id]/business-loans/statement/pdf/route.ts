import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId, runWithRequestTenant } from '@/lib/db/tenantContext'
import { BusinessLoanStatementQuerySchema } from '@/lib/schemas/businessLoan'
import { buildCustomerBusinessLoanStatement } from '@/lib/services/reports/builders/cash'
import { buildReportMeta } from '@/lib/services/reports/meta'
import { generateBusinessReportPdf } from '@/lib/pdf/businessReport'
import { encodeJsonField } from '@/lib/db/queryHelpers'

// GET /api/customers/[id]/business-loans/statement/pdf?period=YYYY-MM
// "Print Statement" on the Business Loan tab ledger — same builder as the
// on-screen JSON statement, rendered through the shared business-report PDF
// engine. Admin only, same figures-visibility rule as the rest of the tab.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const parsed = BusinessLoanStatementQuerySchema.safeParse({ period: searchParams.get('period') ?? undefined })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const { doc, pdfBytes } = await runWithRequestTenant(req, async () => {
      const metaBase = await buildReportMeta(session.user.fullName ?? session.user.username ?? 'Unknown')
      const document = await buildCustomerBusinessLoanStatement(params.id, parsed.data.period, metaBase)
      const bytes = await generateBusinessReportPdf(document)
      return { doc: document, pdfBytes: bytes }
    })

    await runWithRequestTenant(req, () => prisma.auditLog.create({
      data: {
        tenantId: requireTenantId(),
        tableName: 'customer',
        recordId: params.id,
        action: 'EXPORT',
        newValues: encodeJsonField({ format: 'pdf', report: 'customer-business-loan-statement', params: doc.params }),
        changedById: session.user.id ?? null,
        rowHash: '',
      },
    })).catch((err) => logger.error({ err, customerId: params.id }, 'business_loan_statement.export.audit.failed'))

    const body = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="business-loan-statement_${doc.params.from.slice(0, 7)}.pdf"`,
        'Content-Length': String(body.byteLength),
      },
    })
  } catch (err) {
    logger.error({ err, customerId: params.id }, 'GET /api/customers/[id]/business-loans/statement/pdf failed')
    return NextResponse.json({ error: 'Failed to generate business loan statement' }, { status: 500 })
  }
}
