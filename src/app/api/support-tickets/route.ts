import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { FileSupportTicketSchema } from '@/lib/schemas/supportTicket'
import { listMyTickets, fileTicket, SupportTicketClientError } from '@/lib/services/supportTicketClient'

/**
 * GET /api/support-tickets
 * Lists this company's own tickets (including the platform-staff reply
 * thread) by calling the Portal server-to-server. Any authenticated staff
 * member may read — filing a new ticket is admin-only (see POST below).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!session.user.tenantSlug) {
    // Default/legacy tenant has no Portal-managed company to file against.
    return NextResponse.json({ tickets: [] })
  }

  try {
    const tickets = await listMyTickets(session.user.tenantSlug)
    return NextResponse.json({ tickets })
  } catch (err) {
    logger.error({ err }, 'GET /api/support-tickets failed')
    return NextResponse.json({ error: 'Failed to load support tickets' }, { status: 500 })
  }
}

/**
 * POST /api/support-tickets
 * Files a new ticket against this company. Admin only.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!session.user.tenantSlug) {
    return NextResponse.json({ error: 'Support tickets are not available for this account' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = FileSupportTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const ticket = await fileTicket(session.user.tenantSlug, parsed.data)
    return NextResponse.json({ ticket }, { status: 201 })
  } catch (err) {
    const status = err instanceof SupportTicketClientError ? 502 : 500
    logger.error({ err }, 'POST /api/support-tickets failed')
    return NextResponse.json({ error: 'Failed to file support ticket' }, { status })
  }
}
