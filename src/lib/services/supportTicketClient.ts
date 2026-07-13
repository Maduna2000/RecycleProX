import logger from '@/lib/logger'

export class SupportTicketClientError extends Error {
  constructor(message: string) { super(message); this.name = 'SupportTicketClientError' }
}

export interface SupportTicketMessage {
  id: string
  message: string
  createdAt: string
  sender: { fullName: string } | null
}

export interface SupportTicket {
  id: string
  subject: string
  message: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'waiting_for_customer' | 'resolved' | 'closed'
  createdAt: string
  messages: SupportTicketMessage[]
}

// Calls the Portal's internal, shared-secret-authenticated tenant support-
// ticket endpoint (mirrors tenantUsersClient.ts). Web's own API route
// (src/app/api/support-tickets/route.ts) is what the browser actually
// talks to — this client is only ever called server-side.
export async function listMyTickets(companySlug: string): Promise<SupportTicket[]> {
  const baseUrl = process.env.RENOVO_PORTAL_BASE_URL
  const secret = process.env.INTERNAL_API_SHARED_SECRET
  if (!baseUrl || !secret) {
    throw new SupportTicketClientError('RENOVO_PORTAL_BASE_URL / INTERNAL_API_SHARED_SECRET not configured')
  }

  const res = await fetch(`${baseUrl}/api/internal/companies/by-slug/${companySlug}/support-tickets`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn({ status: res.status, body, companySlug }, 'List support tickets failed')
    throw new SupportTicketClientError(`List tickets failed with status ${res.status}`)
  }

  const data = await res.json()
  return data.tickets
}

export async function fileTicket(
  companySlug: string,
  input: { subject: string; message: string; priority: 'low' | 'medium' | 'high' | 'urgent' },
): Promise<SupportTicket> {
  const baseUrl = process.env.RENOVO_PORTAL_BASE_URL
  const secret = process.env.INTERNAL_API_SHARED_SECRET
  if (!baseUrl || !secret) {
    throw new SupportTicketClientError('RENOVO_PORTAL_BASE_URL / INTERNAL_API_SHARED_SECRET not configured')
  }

  const res = await fetch(`${baseUrl}/api/internal/companies/by-slug/${companySlug}/support-tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.warn({ status: res.status, body, companySlug }, 'File support ticket failed')
    throw new SupportTicketClientError(`File ticket failed with status ${res.status}`)
  }

  const data = await res.json()
  return data.ticket
}
