import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateCategorySchema } from '@/lib/schemas/product'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.productCategory.findUnique({ where: { name: parsed.data.name } })
  if (existing) return NextResponse.json({ error: `Category "${parsed.data.name}" already exists` }, { status: 409 })

  const category = await prisma.productCategory.create({
    data: {
      name:      parsed.data.name,
      colorHex:  parsed.data.colorHex || null,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  })

  logger.info({ categoryId: category.id, name: category.name }, 'productCategory.created')
  return NextResponse.json(category, { status: 201 })
}
