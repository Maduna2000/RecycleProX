import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getGateEntryById, GateEntryNotFoundError } from '@/lib/services/gateService'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import { getViewUrl } from '@/lib/r2'

const GATE_ROLES = ['admin', 'manager', 'security_guard']

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GATE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const entry = await runWithRequestTenant(req, () => getGateEntryById(params.id))
    const [idPhotoUrl, vehiclePhotoUrl, facePhotoUrl] = await Promise.all([
      entry.idPhotoR2Key      ? getViewUrl(entry.idPhotoR2Key).catch(() => null)      : null,
      entry.vehiclePhotoR2Key ? getViewUrl(entry.vehiclePhotoR2Key).catch(() => null) : null,
      entry.facePhotoR2Key    ? getViewUrl(entry.facePhotoR2Key).catch(() => null)    : null,
    ])
    return NextResponse.json({ ...entry, idPhotoUrl, vehiclePhotoUrl, facePhotoUrl })
  } catch (err) {
    if (err instanceof GateEntryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to fetch gate entry' }, { status: 500 })
  }
}
