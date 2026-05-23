import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateScaleCategorySchema } from '@/lib/schemas/scale'
import {
  updateCategory, deactivateCategory,
  ScaleCategoryNotFoundError, ScaleCategoryNameConflictError,
} from '@/lib/services/scaleCategoryService'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpdateScaleCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  try {
    const cat = await updateCategory(params.id, parsed.data, session.user.id)
    return NextResponse.json(cat)
  } catch (err) {
    if (err instanceof ScaleCategoryNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    if (err instanceof ScaleCategoryNameConflictError) return NextResponse.json({ error: err.message }, { status: 409 })
    logger.error({ err }, 'PATCH /api/scale/categories/[id] failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const cat = await deactivateCategory(params.id, session.user.id)
    return NextResponse.json(cat)
  } catch (err) {
    if (err instanceof ScaleCategoryNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 })
    logger.error({ err }, 'DELETE /api/scale/categories/[id] failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
