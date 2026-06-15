import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import type { StepConfigResponse } from '@/lib/schemas/scale'

/**
 * GET /api/scale/step-config
 * List all categories with their step configurations
 * Includes inheritance logic: child categories inherit from parent if no explicit config
 */
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all active categories with their step configs
  const categories = await prisma.productCategory.findMany({
    where:   { isActive: true },
    orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { stepConfig: true },
  })

  // Build a map of parent configs for inheritance lookup
  const parentConfigs = new Map<string, { requireWeight: boolean; requirePhotos: boolean }>()
  for (const cat of categories) {
    if (!cat.parentId && cat.stepConfig) {
      parentConfigs.set(cat.id, {
        requireWeight: cat.stepConfig.requireWeight,
        requirePhotos: cat.stepConfig.requirePhotos,
      })
    }
  }

  // Build response with inheritance resolution
  const result: StepConfigResponse[] = categories.map((cat) => {
    // Check if category has its own config
    if (cat.stepConfig) {
      return {
        categoryId:    cat.id,
        categoryName:  cat.name,
        parentId:      cat.parentId,
        requireWeight: cat.stepConfig.requireWeight,
        requirePhotos: cat.stepConfig.requirePhotos,
        isInherited:   false,
        updatedAt:     cat.stepConfig.updatedAt.toISOString(),
      }
    }

    // Check parent config for inheritance (child categories only)
    if (cat.parentId && parentConfigs.has(cat.parentId)) {
      const parent = parentConfigs.get(cat.parentId)!
      return {
        categoryId:    cat.id,
        categoryName:  cat.name,
        parentId:      cat.parentId,
        requireWeight: parent.requireWeight,
        requirePhotos: parent.requirePhotos,
        isInherited:   true,
        updatedAt:     null,
      }
    }

    // Default: all steps required
    return {
      categoryId:    cat.id,
      categoryName:  cat.name,
      parentId:      cat.parentId,
      requireWeight: true,
      requirePhotos: true,
      isInherited:   false,
      updatedAt:     null,
    }
  })

  return NextResponse.json({ configs: result })
}
