import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  const result = await Promise.all(categories.map(async cat => ({
    ...cat,
    _count: { products: await prisma.product.count({ where: { category: cat.name, isActive: true } }) },
  })))

  return NextResponse.json(result)
}
