import { NextRequest, NextResponse } from 'next/server'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { ManualJournalEntryInputSchema } from '@/lib/schemas/ledger'
import { postManualJournalEntry } from '@/lib/services/ledgerService'
import { sastDateLabelToUTCDate } from '@/lib/utils/dayBounds'

/**
 * POST /api/ledger/journal/new — posts a free-form manual/adjusting journal
 * entry (accruals, bank fees, depreciation, write-offs, corrections) that
 * doesn't map to any existing purchase/sale/expense/etc. event type. Admin only.
 */
export async function POST(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const body = await req.json().catch(() => ({}))
  const parsed = ManualJournalEntryInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }
  const data = parsed.data

  try {
    const result = await runWithRequestTenant(req, () =>
      postManualJournalEntry({
        entryDate: sastDateLabelToUTCDate(data.date),
        description: data.description,
        lines: data.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
        userId: session.user.id,
      })
    )
    return NextResponse.json({ ok: true, sourceId: result.sourceId })
  } catch (err) {
    logger.error({ err }, 'POST /api/ledger/journal/new failed')
    return NextResponse.json({ error: 'Failed to post journal entry' }, { status: 500 })
  }
}
