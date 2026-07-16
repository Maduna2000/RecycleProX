import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireTenantId } from '@/lib/db/tenantContext'
import { UpdateStepConfigSchema } from '@/lib/schemas/scale'

type RouteParams = { params: Promise<{ categoryId: string }> }

/**
 * GET /api/scale/step-config/[categoryId]
 * Get step config for a specific category (with inheritance resolution)
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { categoryId } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(categoryId)) {
    return NextResponse.json({ error: 'Invalid category ID format' }, { status: 400 })
  }

  // Fetch category with its config
  const category = await prisma.productCategory.findUnique({
    where:   { id: categoryId },
    include: { stepConfig: true },
  })

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // If category has its own config, return it
  if (category.stepConfig) {
    return NextResponse.json({
      categoryId:    category.id,
      requireWeight: category.stepConfig.requireWeight,
      requirePhotos: category.stepConfig.requirePhotos,
      isInherited:   false,
    })
  }

  // Check parent config for inheritance
  if (category.parentId) {
    const parentConfig = await prisma.categoryStepConfig.findUnique({
      where: { categoryId: category.parentId },
    })

    if (parentConfig) {
      return NextResponse.json({
        categoryId:    category.id,
        requireWeight: parentConfig.requireWeight,
        requirePhotos: parentConfig.requirePhotos,
        isInherited:   true,
      })
    }
  }

  // Default: all steps required
  return NextResponse.json({
    categoryId:    category.id,
    requireWeight: true,
    requirePhotos: true,
    isInherited:   false,
  })
}

/**
 * PUT /api/scale/step-config/[categoryId]
 * Update step config for a category (upsert)
 */
export async function PUT(req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check role - only managers and admins can update
  const role = (session.user as { role?: string })?.role
  if (!role || !['manager', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { categoryId } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(categoryId)) {
    return NextResponse.json({ error: 'Invalid category ID format' }, { status: 400 })
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateStepConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Verify category exists
  const category = await prisma.productCategory.findUnique({
    where: { id: categoryId },
  })

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Upsert config
  const config = await prisma.categoryStepConfig.upsert({
    where:  { categoryId },
    create: {
      tenantId: requireTenantId(),
      categoryId,
      requireWeight:   parsed.data.requireWeight,
      requirePhotos:   parsed.data.requirePhotos,
      createdByUserId: session.user?.id,
    },
    update: {
      requireWeight: parsed.data.requireWeight,
      requirePhotos: parsed.data.requirePhotos,
    },
  })

  return NextResponse.json({
    success: true,
    config: {
      categoryId:    config.categoryId,
      requireWeight: config.requireWeight,
      requirePhotos: config.requirePhotos,
      updatedAt:     config.updatedAt.toISOString(),
    },
  })
}

/**
 * DELETE /api/scale/step-config/[categoryId]
 * Remove explicit config for a category (revert to inheritance/defaults)
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check role
  const role = (session.user as { role?: string })?.role
  if (!role || !['manager', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { categoryId } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(categoryId)) {
    return NextResponse.json({ error: 'Invalid category ID format' }, { status: 400 })
  }

  // Delete config if exists
  await prisma.categoryStepConfig.deleteMany({
    where: { categoryId },
  })

  return NextResponse.json({ success: true })
}
