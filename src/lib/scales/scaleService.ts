/**
 * Scale Hardware Service
 *
 * Reads live weight from platform scales over TCP/IP or RS232 serial.
 * Config is loaded from SystemSettings (keys: scale{n}Type, scale{n}Ip, etc.)
 *
 * Server-side only — uses Node.js `net` and `serialport`.
 */

import * as net from 'net'
import Decimal from 'decimal.js'
import { prisma } from '@/lib/db/prisma'
import logger from '@/lib/logger'

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ScaleNotConfiguredError extends Error {
  constructor(n: number) {
    super(`Scale ${n} is not configured`)
    this.name = 'ScaleNotConfiguredError'
  }
}

export class ScaleTimeoutError extends Error {
  constructor(n: number) {
    super(`Scale ${n} did not respond within the timeout period`)
    this.name = 'ScaleTimeoutError'
  }
}

export class ScaleParseError extends Error {
  constructor(raw: string) {
    super(`Could not parse weight from scale response: "${raw}"`)
    this.name = 'ScaleParseError'
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

type ScaleType = 'tcp' | 'serial' | 'none'

interface ScaleConfig {
  type: ScaleType
  ip?: string
  port?: number
  serialPort?: string
  baudRate?: number
}

async function loadConfig(n: 1 | 2 | 3): Promise<ScaleConfig> {
  const keys = [
    `scale${n}Type`,
    `scale${n}Ip`,
    `scale${n}Port`,
    `scale${n}SerialPort`,
    `scale${n}BaudRate`,
  ]
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: keys } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  return {
    type: (map[`scale${n}Type`] ?? 'none') as ScaleType,
    ip: map[`scale${n}Ip`],
    port: map[`scale${n}Port`] ? parseInt(map[`scale${n}Port`]!, 10) : 8001,
    serialPort: map[`scale${n}SerialPort`],
    baudRate: map[`scale${n}BaudRate`] ? parseInt(map[`scale${n}BaudRate`]!, 10) : 9600,
  }
}

// ─── Weight parser ────────────────────────────────────────────────────────────
// Most scale indicators output lines like: "  23.450 kg\r\n" or "ST,GS, 23.450kg"
// We extract the first valid decimal number from the response.

function parseWeight(raw: string): Decimal {
  const match = raw.match(/(\d+\.?\d*)/)
  if (!match || !match[1]) throw new ScaleParseError(raw)
  return new Decimal(match[1])
}

// ─── TCP reader ───────────────────────────────────────────────────────────────

const TCP_TIMEOUT_MS = 10_000
const RETRY_DELAY_MS = 500
const MAX_RETRIES = 3

function readScaleTcp(cfg: ScaleConfig, n: number): Promise<Decimal> {
  return new Promise((resolve, reject) => {
    const ip = cfg.ip ?? ''
    const port = cfg.port ?? 8001

    const socket = new net.Socket()
    let settled = false

    function finish(err?: Error, val?: Decimal) {
      if (settled) return
      settled = true
      socket.destroy()
      if (err) reject(err)
      else resolve(val!)
    }

    const timer = setTimeout(
      () => finish(new ScaleTimeoutError(n)),
      TCP_TIMEOUT_MS
    )

    socket.setTimeout(TCP_TIMEOUT_MS)

    socket.connect(port, ip, () => {
      // Send CR — most indicators respond to a carriage return with current weight
      socket.write('\r\n')
    })

    let buf = ''
    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      // Accept first line that contains digits
      const lines = buf.split(/\r?\n/)
      for (const line of lines) {
        if (/\d/.test(line)) {
          clearTimeout(timer)
          try {
            finish(undefined, parseWeight(line))
          } catch (e) {
            finish(e as Error)
          }
          return
        }
      }
    })

    socket.on('timeout', () => finish(new ScaleTimeoutError(n)))
    socket.on('error', (e) => { clearTimeout(timer); finish(e) })
  })
}

// ─── Serial reader ────────────────────────────────────────────────────────────

async function readScaleSerial(cfg: ScaleConfig, n: number): Promise<Decimal> {
  // Dynamic import so the module is not loaded in environments where it is
  // unavailable (e.g. edge runtime, tests that mock this module).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SerialPort } = require('serialport') as typeof import('serialport')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ReadlineParser } = require('@serialport/parser-readline') as typeof import('@serialport/parser-readline')

  const path = cfg.serialPort ?? ''
  const baudRate = cfg.baudRate ?? 9600

  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate, autoOpen: false })
    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
    let settled = false

    function finish(err?: Error, val?: Decimal) {
      if (settled) return
      settled = true
      port.close()
      if (err) reject(err)
      else resolve(val!)
    }

    const timer = setTimeout(() => finish(new ScaleTimeoutError(n)), TCP_TIMEOUT_MS)

    port.open((err) => {
      if (err) { clearTimeout(timer); return finish(err) }
      // Some indicators need a CR to emit a reading
      port.write('\r\n')
    })

    parser.on('data', (line: string) => {
      if (/\d/.test(line)) {
        clearTimeout(timer)
        try {
          finish(undefined, parseWeight(line))
        } catch (e) {
          finish(e as Error)
        }
      }
    })

    port.on('error', (e: Error) => { clearTimeout(timer); finish(e) })
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function attemptRead(cfg: ScaleConfig, n: number): Promise<Decimal> {
  if (cfg.type === 'tcp') return readScaleTcp(cfg, n)
  if (cfg.type === 'serial') return readScaleSerial(cfg, n)
  throw new ScaleNotConfiguredError(n)
}

/**
 * Read the current weight from scale n (1, 2, or 3).
 * Retries up to MAX_RETRIES times with RETRY_DELAY_MS between attempts.
 * Returns a Decimal — never a float.
 */
export async function readScale(n: 1 | 2 | 3): Promise<Decimal> {
  const cfg = await loadConfig(n)

  if (cfg.type === 'none') throw new ScaleNotConfiguredError(n)

  let lastErr: Error = new ScaleTimeoutError(n)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const weight = await attemptRead(cfg, n)
      logger.info({ scaleNumber: n, weight: weight.toString(), attempt }, 'Scale read OK')
      return weight
    } catch (err) {
      lastErr = err as Error
      logger.warn({ scaleNumber: n, attempt, err: lastErr.message }, 'Scale read attempt failed')
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      }
    }
  }

  throw lastErr
}

/**
 * Returns true if the scale responds within 2 seconds.
 */
export async function isScaleConnected(n: 1 | 2 | 3): Promise<boolean> {
  const cfg = await loadConfig(n)
  if (cfg.type === 'none') return false

  try {
    // Short timeout for status check
    const result = await Promise.race([
      attemptRead(cfg, n),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new ScaleTimeoutError(n)), 2000)
      ),
    ])
    return result instanceof Decimal
  } catch {
    return false
  }
}
