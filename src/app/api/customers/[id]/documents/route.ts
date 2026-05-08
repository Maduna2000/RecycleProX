import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { UploadCustomerDocumentSchema } from '@/lib/schemas/customer'
import logger from '@/lib/logger'
import { listCustomerDocuments, addCustomerDocument } from '@/lib/services/customerService'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const docs = await listCustomerDocuments(params.id)
  return NextResponse.json(docs)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = UploadCustomerDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const doc = await addCustomerDocument(params.id, parsed.data, session.user.id)
    return NextResponse.json(doc, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    logger.error({ err }, 'POST /api/customers/[id]/documents failed')
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}
