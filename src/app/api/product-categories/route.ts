import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateCategorySchema } from '@/lib/schemas/product'
import { prisma } from '@/lib/db/prisma'
import { createCategory } from '@/lib/services/productService'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parents = await prisma.productCategory.findMany({
    where:   { isActive: true, parentId: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      children: {
        where:   { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
  })

  const categories = await Promise.all(
    parents.map(async (parent) => {
      const childrenWithCounts = await Promise.all(
        parent.children.map(async (child) => ({
          ...child,
          _count: { products: await prisma.product.count({ where: { category: child.name, isActive: true } }) },
        }))
      )
      const directCount = await prisma.product.count({ where: { category: parent.name, isActive: true } })
      return { ...parent, children: childrenWithCounts, _count: { products: directCount } }
    })
  )

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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 422 })

  try {
    const category = await createCategory(parsed.data)
    return NextResponse.json(category, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create category'
    const status = msg.includes('already exists') ? 409 : msg.includes('not found') ? 404 : msg.includes('levels') ? 422 : 500
    if (status === 500) logger.error({ err }, 'POST /api/product-categories failed')
    return NextResponse.json({ error: msg }, { status })
  }
}
