import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listTradeCommodityOptions } from '@/lib/services/productService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

/**
 * Trade commodities are product categories flagged as selectable on
 * account-customer registration. GET lists every active category (parent and
 * child) with its current flag — `isActive` here means "enabled as a trade
 * commodity", not "category isActive" (only active categories are listed at
 * all). Creating/renaming/deleting categories happens in the Products
 * module; this endpoint only reads and (via [id]) toggles the flag.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const options = await runWithRequestTenant(req, () => listTradeCommodityOptions())
  const categories = options.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    isActive: c.isTradeCommodity,
  }))
  return NextResponse.json({ categories })
}
