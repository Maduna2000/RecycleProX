import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { prisma } from '@/lib/db/prisma'
import { getViewUrl } from '@/lib/r2'
import { runWithRequestTenant } from '@/lib/db/tenantContext'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const customer = await runWithRequestTenant(req, () => prisma.customer.findUnique({
      where: { id: params.id },
      select: { idPhotoR2Key: true },
    }))
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    if (!customer.idPhotoR2Key) return NextResponse.json({ url: null })

    const url = await getViewUrl(customer.idPhotoR2Key, 1800)
    return NextResponse.json({ url })
  } catch (err) {
    logger.error({ err }, 'GET /api/customers/[id]/id-photo-url failed')
    return NextResponse.json({ error: 'Failed to get photo URL' }, { status: 500 })
  }
}
