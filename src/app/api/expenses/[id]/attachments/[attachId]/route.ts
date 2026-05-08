import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { deleteExpenseAttachment } from '@/lib/services/expenseService'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachId: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can delete attachments' }, { status: 403 })
  }

  try {
    await deleteExpenseAttachment(params.id, params.attachId, session.user.id)
    return new Response(null, { status: 204 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Attachment not found') {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error({ err }, 'DELETE /api/expenses/[id]/attachments/[attachId] failed')
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
  }
}
