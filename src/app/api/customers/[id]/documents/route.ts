import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { UploadCustomerDocumentSchema } from '@/lib/schemas/customer'
import logger from '@/lib/logger'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const docs = await prisma.customerDocument.findMany({
    where:   { customerId: params.id },
    orderBy: { uploadedAt: 'desc' },
  })
  return NextResponse.json(docs)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const customer = await prisma.customer.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const body = await req.json()
  const parsed = UploadCustomerDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const doc = await prisma.customerDocument.create({
      data: {
        customerId:      params.id,
        documentType:    parsed.data.documentType,
        r2Key:           parsed.data.r2Key,
        fileName:        parsed.data.fileName,
        notes:           parsed.data.notes,
        uploadedByUserId: session.user.id,
      },
    })
    logger.info({ docId: doc.id, customerId: params.id, userId: session.user.id }, 'Customer document uploaded')
    return NextResponse.json(doc, { status: 201 })
  } catch (err) {
    logger.error({ err }, 'POST /api/customers/[id]/documents failed')
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}
