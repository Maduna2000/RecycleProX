import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { UpdateCategorySchema } from '@/lib/schemas/product'
import { prisma } from '@/lib/db/prisma'
import { updateCategory, deleteCategory, countProductsForCategory } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Preview mode: return how many products would be affected by a rename — no mutation
  if (req.nextUrl.searchParams.get('preview') === '1') {
    const body = await req.json().catch(() => ({}))
    const newName = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).name as string | undefined : undefined
    if (!newName) return NextResponse.json({ affectedProducts: 0 })
    const preview = await runWithRequestTenant(req, async () => {
      const existing = await prisma.productCategory.findUnique({ where: { id: params.id } })
      if (!existing) return null
      if (newName === existing.name) return { affectedProducts: 0, oldName: existing.name }
      const affectedProducts = await countProductsForCategory(existing.name)
      return { affectedProducts, oldName: existing.name }
    })
    if (!preview) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    return NextResponse.json(preview)
  }

  const body = await req.json()
  const parsed = UpdateCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 422 })

  try {
    const updated = await runWithRequestTenant(req, () => updateCategory(params.id, parsed.data, session.user.id))
    return NextResponse.json(updated)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    const status = msg.includes('already exists') ? 409 : msg.includes('not found') ? 404 : msg.includes('levels') || msg.includes('Circular') || msg.includes('Cannot move') ? 422 : 500
    if (status === 500) logger.error({ err }, 'PUT /api/product-categories/[id] failed')
    return NextResponse.json({ error: status === 500 ? 'Failed to update category' : msg }, { status })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'manager'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runWithRequestTenant(req, () => deleteCategory(params.id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('not found')) return NextResponse.json({ error: msg }, { status: 404 })
    // deleteCategory only ever throws these two hand-written conflict
    // messages besides "not found" — anything else (a dropped connection,
    // etc.) falls through to the generic 500 below instead of echoing an
    // unrecognised message straight to the client.
    if (msg.includes('sub-categor') || msg.includes('use this category')) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    logger.error({ err }, 'DELETE /api/product-categories/[id] failed')
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
