import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { UploadExpenseAttachmentSchema } from '@/lib/schemas/expense'
import logger from '@/lib/logger'
import { listExpenseAttachments, addExpenseAttachment } from '@/lib/services/expenseService'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const attachments = await listExpenseAttachments(params.id)
  return NextResponse.json(attachments)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body   = await req.json()
  const parsed = UploadExpenseAttachmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const attachment = await addExpenseAttachment(params.id, parsed.data, session.user.id)
    return NextResponse.json(attachment, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }
    logger.error({ err }, 'POST /api/expenses/[id]/attachments failed')
    return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 })
  }
}
