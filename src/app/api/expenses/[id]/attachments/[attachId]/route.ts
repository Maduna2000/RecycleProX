import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { deleteR2Object } from '@/lib/r2'
import logger from '@/lib/logger'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachId: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can delete attachments' }, { status: 403 })
  }

  const attachment = await prisma.expenseAttachment.findUnique({ where: { id: params.attachId } })
  if (!attachment || attachment.expenseId !== params.id) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  try {
    await deleteR2Object(attachment.r2Key)
    await prisma.expenseAttachment.delete({ where: { id: params.attachId } })
    logger.info({ attachId: params.attachId, expenseId: params.id, userId: session.user.id }, 'Expense attachment deleted')
    return new Response(null, { status: 204 })
  } catch (err) {
    logger.error({ err }, 'DELETE /api/expenses/[id]/attachments/[attachId] failed')
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
  }
}
