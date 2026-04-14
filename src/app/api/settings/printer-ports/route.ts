import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'

// GET /api/settings/printer-ports
// Returns available serial/COM ports on this machine.
// Only works when the server is running locally (not Vercel cloud).
// Used by the thermal printer setup UI to auto-detect COM ports.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Dynamic import so the module is not bundled into cloud/edge builds
    const { SerialPort } = await import('serialport')
    const ports = await SerialPort.list()
    return NextResponse.json({
      ports: ports.map((p) => ({
        path:         p.path,
        manufacturer: p.manufacturer ?? null,
        description:  p.pnpId ?? null,
      })),
    })
  } catch (err) {
    logger.warn({ err }, 'printer-ports: serialport unavailable')
    // Graceful fallback for cloud/Vercel deployments
    return NextResponse.json({ ports: [], cloudMode: true })
  }
}
