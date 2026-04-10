/**
 * scaleService tests (A7 quality gates)
 *
 * All tests mock prisma and the net / serialport modules so no hardware
 * or database is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import Decimal from 'decimal.js'
import * as netModule from 'net'

// ─── Mock net module at top level (vi.spyOn cannot override ESM built-ins) ───
vi.mock('net', () => ({ Socket: vi.fn() }))

// ─── Mock prisma ──────────────────────────────────────────────────────────────
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    systemSettings: {
      findMany: vi.fn(),
    },
  },
}))

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@/lib/db/prisma'
import {
  readScale,
  ScaleNotConfiguredError,
  ScaleTimeoutError,
} from '@/lib/scales/scaleService'

// Helper: set prisma mock to return given config rows
function mockConfig(rows: { key: string; value: string }[]) {
  vi.mocked(prisma.systemSettings.findMany).mockResolvedValue(
    rows as Parameters<typeof prisma.systemSettings.findMany>[0] extends undefined
      ? never
      : Awaited<ReturnType<typeof prisma.systemSettings.findMany>>
  )
}

// ─── Test 1: scale not configured → ScaleNotConfiguredError ──────────────────
describe('readScale — not configured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ScaleNotConfiguredError when type is "none"', async () => {
    mockConfig([{ key: 'scale1Type', value: 'none' }])
    await expect(readScale(1)).rejects.toBeInstanceOf(ScaleNotConfiguredError)
  })

  it('throws ScaleNotConfiguredError when no config rows exist', async () => {
    mockConfig([])
    await expect(readScale(1)).rejects.toBeInstanceOf(ScaleNotConfiguredError)
  })
})

// ─── Test 2: TCP — mock socket returns weight string ─────────────────────────
describe('readScale — TCP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses "  23.450\\r\\n" and returns Decimal("23.450")', async () => {
    mockConfig([
      { key: 'scale1Type', value: 'tcp' },
      { key: 'scale1Ip',   value: '127.0.0.1' },
      { key: 'scale1Port', value: '9999' },
    ])

    const fakeSocket = {
      connect: vi.fn((_port: number, _ip: string, cb: () => void) => { cb(); return fakeSocket }),
      write:   vi.fn(),
      destroy: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn((event: string, handler: (data?: Buffer | Error) => void) => {
        if (event === 'data') {
          // Emit weight line asynchronously so listeners are all registered first
          setImmediate(() => handler(Buffer.from('  23.450\r\n')))
        }
        return fakeSocket
      }),
    }
    // Regular function required — arrow functions cannot be used as constructors
    vi.mocked(netModule.Socket).mockImplementation(
      function() { return fakeSocket as unknown as import('net').Socket }
    )

    const result = await readScale(1)
    expect(result).toBeInstanceOf(Decimal)
    expect(result.toFixed(3)).toBe('23.450')
  })
})

// ─── Test 3: TCP — timeout after no data ─────────────────────────────────────
describe('readScale — TCP timeout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws ScaleTimeoutError when socket times out', async () => {
    mockConfig([
      { key: 'scale1Type', value: 'tcp' },
      { key: 'scale1Ip',   value: '10.255.255.1' },
      { key: 'scale1Port', value: '9999' },
    ])

    const fakeSocket = {
      connect: vi.fn((_port: number, _ip: string, _cb: () => void) => fakeSocket),
      write:   vi.fn(),
      destroy: vi.fn(),
      setTimeout: vi.fn(),
      on: vi.fn((event: string, handler: (data?: Error) => void) => {
        if (event === 'timeout') {
          setImmediate(() => handler())
        }
        return fakeSocket
      }),
    }
    vi.mocked(netModule.Socket).mockImplementation(
      function() { return fakeSocket as unknown as import('net').Socket }
    )

    await expect(readScale(1)).rejects.toBeInstanceOf(ScaleTimeoutError)
  }, 15_000)
})

// ─── Tests 4 & 5: net quantity arithmetic ────────────────────────────────────
describe('gross - tare net quantity', () => {
  it('grossQty=31.000 tareQty=0.000 → net=31.000', () => {
    const gross = new Decimal('31.000')
    const tare  = new Decimal('0.000')
    const net   = Decimal.max(gross.minus(tare), new Decimal('0'))
    expect(net.toFixed(3)).toBe('31.000')
  })

  it('grossQty=25.000 tareQty=3.000 → net=22.000', () => {
    const gross = new Decimal('25.000')
    const tare  = new Decimal('3.000')
    const net   = Decimal.max(gross.minus(tare), new Decimal('0'))
    expect(net.toFixed(3)).toBe('22.000')
  })

  it('net is never negative when tare > gross', () => {
    const gross = new Decimal('1.000')
    const tare  = new Decimal('5.000')
    const net   = Decimal.max(gross.minus(tare), new Decimal('0'))
    expect(net.toFixed(3)).toBe('0.000')
  })
})
