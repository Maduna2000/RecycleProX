import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ExpenseReceiptsZipQuerySchema } from '@/lib/schemas/expense'
import { listExpensesWithReceipts } from '@/lib/services/expenseService'
import { planReceiptFiles, receiptZipEntries } from '@/lib/services/expenseReceiptExport'
import { createZipStream } from '@/lib/zip/storedZip'
import { fetchR2Bytes } from '@/lib/r2'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { zodErrorMessage } from '@/lib/utils/zodError'

export const runtime = 'nodejs'
export const maxDuration = 60

// Keeps one download inside the function time limit. A month of receipts is
// well under this; a larger range should be split.
const MAX_RECEIPTS = 400

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can download receipts' }, { status: 403 })
  }

  const parsed = ExpenseReceiptsZipQuerySchema.safeParse({
    from: req.nextUrl.searchParams.get('from'),
    to:   req.nextUrl.searchParams.get('to'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 422 })
  }
  const { from, to } = parsed.data

  try {
    const rows = await runWithRequestTenant(req, () => listExpensesWithReceipts(from, to))
    const receiptCount = planReceiptFiles(rows).length
    if (receiptCount === 0) {
      return NextResponse.json({ error: `No expense receipts between ${from} and ${to}` }, { status: 404 })
    }
    if (receiptCount > MAX_RECEIPTS) {
      return NextResponse.json(
        { error: `${receiptCount} receipts is too many for one download (max ${MAX_RECEIPTS}). Choose a shorter date range.` },
        { status: 413 },
      )
    }

    logger.info({ userId: session.user.id, from, to, expenses: rows.length, receipts: receiptCount }, 'expense.receipts.zip.started')

    const entries = receiptZipEntries(rows, fetchR2Bytes, (r2Key, expenseRef) =>
      logger.warn({ r2Key, expenseRef }, 'expense.receipts.zip.receipt_missing'),
    )
    return new Response(createZipStream(entries), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="expense-receipts_${from}_to_${to}.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    logger.error({ err, from, to }, 'GET /api/expenses/receipts-zip failed')
    return NextResponse.json({ error: 'Failed to build the receipts download' }, { status: 500 })
  }
}
