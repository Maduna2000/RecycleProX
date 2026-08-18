import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import logger from '@/lib/logger'
import { spawn } from 'node:child_process'

// GET /api/settings/printer-queues
// Returns installed Windows print-queue names on this machine (Devices and
// Printers), for the "Windows Print Queue" fallback printer type — used by
// the thermal printer setup UI to auto-detect USB printers that were
// installed as an ordinary Windows printer driver rather than exposed as a
// COM port or a raw network socket (neither of which the Serial/TCP printer
// types can see). Only meaningful on Windows — no PowerShell/spooler
// concept on cloud/Vercel or non-Windows local dev.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (process.platform !== 'win32') {
    return NextResponse.json({ printers: [], cloudMode: true })
  }

  try {
    const names = await listWindowsPrinters()
    return NextResponse.json({ printers: names })
  } catch (err) {
    logger.warn({ err }, 'printer-queues: enumeration failed')
    return NextResponse.json({ printers: [], cloudMode: true })
  }
}

function listWindowsPrinters(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', '(Get-Printer | Select-Object -ExpandProperty Name) -join "`n"',
    ])
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { proc.kill(); reject(new Error('printer enumeration timed out')) }, 5_000)
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(stderr.trim() || `Get-Printer exited ${code}`))
      resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
    })
  })
}
