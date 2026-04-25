import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { deleteR2Object } from '@/lib/r2'
import logger from '@/lib/logger'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Only managers and admins can delete documents' }, { status: 403 })
  }

  const doc = await prisma.customerDocument.findUnique({ where: { id: params.docId } })
  if (!doc || doc.customerId !== params.id) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  try {
    await deleteR2Object(doc.r2Key)
    await prisma.customerDocument.delete({ where: { id: params.docId } })
    logger.info({ docId: params.docId, customerId: params.id, userId: session.user.id }, 'Customer document deleted')
    return new Response(null, { status: 204 })
  } catch (err) {
    logger.error({ err }, 'DELETE /api/customers/[id]/documents/[docId] failed')
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
