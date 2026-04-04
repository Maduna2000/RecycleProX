import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreatePriceGroupSchema } from '@/lib/schemas/product'
import { createPriceGroup, listPriceGroups, DuplicatePriceGroupNameError } from '@/lib/services/productService'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const groups = await listPriceGroups()
    return NextResponse.json({ groups })
  } catch (err) {
    logger.error({ err }, 'GET /api/price-groups failed')
    return NextResponse.json({ error: 'Failed to fetch price groups' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreatePriceGroupSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const group = await createPriceGroup(parsed.data, session.user.id)
    return NextResponse.json(group, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicatePriceGroupNameError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/price-groups failed')
    return NextResponse.json({ error: 'Failed to create price group' }, { status: 500 })
  }
}
