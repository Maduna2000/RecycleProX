import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import net from 'node:net'
import os from 'node:os'
import logger from '@/lib/logger'

const SCAN_PORT = 9100
const CONNECT_TIMEOUT_MS = 300
const CONCURRENCY = 32

// Derives this machine's own IPv4 /24 subnet from its network interfaces —
// e.g. 192.168.1.42 -> scan 192.168.1.1 through 192.168.1.254. Only IPv4,
// non-internal interfaces are considered; the shop's LAN is assumed to be a
// standard /24, which covers the overwhelming majority of small networks
// (matches the same "keep it simple" spirit as the existing serial-port
// detect feature, not a general-purpose network topology tool).
function getLocalSubnets(): string[] {
  const nets = os.networkInterfaces()
  const subnets = new Set<string>()
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.')
        if (parts.length === 4) subnets.add(parts.slice(0, 3).join('.'))
      }
    }
  }
  return Array.from(subnets)
}

function probe(ip: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    function finish(ok: boolean) {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(CONNECT_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(SCAN_PORT, ip)
  })
}

async function scanSubnet(subnet: string): Promise<string[]> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)
  const found: string[] = []
  for (let i = 0; i < hosts.length; i += CONCURRENCY) {
    const batch = hosts.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map((ip) => probe(ip)))
    results.forEach((ok, idx) => { if (ok) found.push(batch[idx]!) })
  }
  return found
}

// GET /api/settings/printer-network-scan
// Sweeps this machine's local subnet(s) for anything answering on the
// standard raw ESC/POS port (9100). Only works when the server is running
// locally (there's no meaningful "local subnet" from a Vercel cloud
// deployment) — used by the thermal printer setup UI to auto-detect network
// printers, mirroring /api/settings/printer-ports for serial ports.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const subnets = getLocalSubnets()
    if (subnets.length === 0) {
      return NextResponse.json({ ips: [], cloudMode: true })
    }
    const results = await Promise.all(subnets.map(scanSubnet))
    const ips = results.flat()
    return NextResponse.json({ ips })
  } catch (err) {
    logger.warn({ err }, 'printer-network-scan: scan failed')
    return NextResponse.json({ ips: [], cloudMode: true })
  }
}
