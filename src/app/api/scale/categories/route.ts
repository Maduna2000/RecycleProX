import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await runWithRequestTenant(req, async () => {
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

    return Promise.all(
      parents.map(async (parent) => {
        const childrenWithCounts = await Promise.all(
          parent.children.map(async (child) => ({
            ...child,
            _count: { products: await prisma.product.count({ where: { category: child.name, isActive: true } }) },
          }))
        )
        const directCount   = await prisma.product.count({ where: { category: parent.name, isActive: true } })
        const childrenTotal = childrenWithCounts.reduce((s, c) => s + c._count.products, 0)
        return { ...parent, children: childrenWithCounts, _count: { products: directCount + childrenTotal } }
      })
    )
  })

  // Hide top-level categories that have zero products across all levels
  return NextResponse.json(result.filter(c => c._count.products > 0))
}
