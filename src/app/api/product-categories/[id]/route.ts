import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateCategorySchema } from '@/lib/schemas/product'
import { prisma } from '@/lib/db/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdateCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.productCategory.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  if (parsed.data.name && parsed.data.name !== existing.name) {
    const conflict = await prisma.productCategory.findUnique({ where: { name: parsed.data.name } })
    if (conflict) return NextResponse.json({ error: `Category "${parsed.data.name}" already exists` }, { status: 409 })
  }

  const updated = await prisma.productCategory.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name      !== undefined && { name:      parsed.data.name }),
      ...(parsed.data.colorHex  !== undefined && { colorHex:  parsed.data.colorHex  || null }),
      ...(parsed.data.iconName  !== undefined && { iconName:  parsed.data.iconName   || null }),
      ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
    },
  })

  logger.info({ categoryId: params.id }, 'productCategory.updated')
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existing = await prisma.productCategory.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const inUse = await prisma.product.count({ where: { category: existing.name } })
  if (inUse > 0) {
    return NextResponse.json({ error: `Cannot delete — ${inUse} product${inUse !== 1 ? 's' : ''} use this category.` }, { status: 409 })
  }

  await prisma.productCategory.delete({ where: { id: params.id } })
  logger.info({ categoryId: params.id, name: existing.name }, 'productCategory.deleted')
  return NextResponse.json({ ok: true })
}
