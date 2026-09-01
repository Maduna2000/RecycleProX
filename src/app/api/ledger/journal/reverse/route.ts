import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { requireRole } from '@/lib/auth-helpers'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import {
  reverseManualJournalEntry, ManualJournalEntryNotFoundError, ManualJournalEntryAlreadyReversedError,
} from '@/lib/services/ledgerService'

const ReverseSchema = z.object({
  sourceId: z.string().uuid(),
  reason: z.string().min(3, 'A reason is required'),
})

/** POST /api/ledger/journal/reverse — reverses a previously-posted manual journal entry. Admin only. */
export async function POST(req: NextRequest) {
  const { session, response } = await requireRole(['admin'])
  if (!session) return response

  const body = await req.json().catch(() => ({}))
  const parsed = ReverseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await runWithRequestTenant(req, () =>
      reverseManualJournalEntry(parsed.data.sourceId, parsed.data.reason, session.user.id)
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof ManualJournalEntryNotFoundError || err instanceof ManualJournalEntryAlreadyReversedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/ledger/journal/reverse failed')
    return NextResponse.json({ error: 'Failed to reverse journal entry' }, { status: 500 })
  }
}
