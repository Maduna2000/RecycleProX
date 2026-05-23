import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { CreateScaleCategorySchema } from '@/lib/schemas/scale'
import { listCategories, createCategory, ScaleCategoryNameConflictError } from '@/lib/services/scaleCategoryService'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  const categories = await listCategories(includeInactive)
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = CreateScaleCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const cat = await createCategory(parsed.data, session.user.id)
    return NextResponse.json(cat, { status: 201 })
  } catch (err) {
    if (err instanceof ScaleCategoryNameConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    logger.error({ err }, 'POST /api/scale/categories failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
