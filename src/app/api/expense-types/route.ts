import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listExpenseTypes, createExpenseType } from '@/lib/services/expenseService'
import { CreateExpenseTypeSchema } from '@/lib/schemas/expense'
import logger from '@/lib/logger'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const types = await listExpenseTypes()
  return NextResponse.json(types)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateExpenseTypeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const type = await createExpenseType(parsed.data, session.user.id)
    return NextResponse.json(type, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/expense-types failed')
    return NextResponse.json({ error: 'Failed to create expense type' }, { status: 500 })
  }
}
