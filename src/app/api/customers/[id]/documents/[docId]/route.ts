import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { deleteCustomerDocument } from '@/lib/services/customerService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; docId: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can delete documents' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deleteCustomerDocument(params.id, params.docId, session.user.id))
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Document not found') {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error({ err }, 'DELETE /api/customers/[id]/documents/[docId] failed')
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
