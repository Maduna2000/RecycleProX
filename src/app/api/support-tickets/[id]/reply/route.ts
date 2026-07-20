import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { ReplySupportTicketSchema } from '@/lib/schemas/supportTicket'
import { replyToTicket, SupportTicketClientError } from '@/lib/services/supportTicketClient'

/**
 * POST /api/support-tickets/[id]/reply
 * Adds a reply to an existing ticket on behalf of this company. Admin only,
 * same as filing a new ticket.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!session.user.tenantSlug) {
    return NextResponse.json({ error: 'Support tickets are not available for this account' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = ReplySupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const reply = await replyToTicket(session.user.tenantSlug, params.id, parsed.data.message)
    return NextResponse.json({ reply }, { status: 201 })
  } catch (err) {
    const status = err instanceof SupportTicketClientError ? 502 : 500
    logger.error({ err }, 'POST /api/support-tickets/[id]/reply failed')
    return NextResponse.json({ error: 'Failed to send reply' }, { status })
  }
}
