import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { UploadExpenseAttachmentSchema } from '@/lib/schemas/expense'
import logger from '@/lib/logger'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const attachments = await prisma.expenseAttachment.findMany({
    where:   { expenseId: params.id },
    orderBy: { uploadedAt: 'desc' },
  })
  return NextResponse.json(attachments)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const expense = await prisma.expense.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  const body = await req.json()
  const parsed = UploadExpenseAttachmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const attachment = await prisma.expenseAttachment.create({
      data: {
        expenseId:        params.id,
        r2Key:            parsed.data.r2Key,
        fileName:         parsed.data.fileName,
        notes:            parsed.data.notes,
        uploadedByUserId: session.user.id,
      },
    })
    logger.info({ attachmentId: attachment.id, expenseId: params.id, userId: session.user.id }, 'Expense attachment uploaded')
    return NextResponse.json(attachment, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/expenses/[id]/attachments failed')
    return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 })
  }
}
