/**
 * isInstantInApprovedSession tests — the void / reverse-payment lock.
 *
 * Regression: a day can hold several cash-up sessions (separate shifts).
 * The lock used to fire for ANY approved session on the same calendar date,
 * so approving the morning shift blocked reversing a purchase paid out in
 * the afternoon, whose own session hadn't even been cashed up yet. The lock
 * now follows the session whose reconciliation window holds the instant.
 *
 * prisma is not touched: the function runs against a fake transaction client
 * backed by an in-memory list of CashUp rows, answering just the two
 * findFirst shapes the lock and getSessionWindow issue.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/db/tenantContext', () => ({ requireTenantId: vi.fn(() => 'tenant-1') }))
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/services/settingsService', () => ({ getCurrencyCode: vi.fn() }))
vi.mock('@/lib/services/floatService', () => ({
  getMostRecentFloatAsOf: vi.fn(), updateClosingAmount: vi.fn(), getDrawingsReceivedForDate: vi.fn(),
}))
vi.mock('@/lib/services/expenseService', () => ({ getExpenseTotalsForDate: vi.fn() }))
vi.mock('@/lib/services/loanService', () => ({ getLoanTotalsForDate: vi.fn(), formatTransactionMethod: vi.fn() }))
vi.mock('@/lib/services/momoStatementService', () => ({ getMomoStatementForDate: vi.fn() }))
vi.mock('@/lib/services/ledgerService', () => ({ postCashUpVariance: vi.fn() }))

import { isInstantInApprovedSession } from '@/lib/services/cashUpService'

type Status = 'open' | 'submitted' | 'approved' | 'voided'
interface Row { status: Status; sessionDate: Date; openedAt: Date; closedAt: Date | null }

// SAST is UTC+2 — `t('09:00')` is 09:00 SAST on 2026-09-26.
const DAY = new Date(Date.UTC(2026, 8, 26))
const t = (hhmm: string, day = 26) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2026, 8, day, h! - 2, m!))
}
const row = (status: Status, opened: string, closed: string | null, sessionDate = DAY): Row => ({
  status, sessionDate, openedAt: t(opened), closedAt: closed ? t(closed) : null,
})

// Minimal findFirst over the rows: understands status.not, openedAt.lt,
// OR [{closedAt: null}, {closedAt: {gte}}], and orderBy openedAt asc/desc.
function fakeTx(rows: Row[]) {
  const findFirst = async (args: {
    where: {
      status?: { not: Status }
      openedAt?: { lt: Date }
      OR?: Array<{ closedAt: null | { gte: Date } }>
    }
    orderBy: { openedAt: 'asc' | 'desc' }
  }) => {
    const { where, orderBy } = args
    const hits = rows.filter((r) => {
      if (where.status && r.status === where.status.not) return false
      if (where.openedAt && !(r.openedAt < where.openedAt.lt)) return false
      if (where.OR && !where.OR.some((c) =>
        c.closedAt === null ? r.closedAt === null : r.closedAt !== null && r.closedAt >= c.closedAt.gte)) return false
      return true
    })
    hits.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime())
    if (orderBy.openedAt === 'desc') hits.reverse()
    return hits[0] ?? null
  }
  return { cashUp: { findFirst } } as never
}

describe('isInstantInApprovedSession', () => {
  it('does not lock a purchase paid after an approved earlier shift, while the current shift is still open', async () => {
    const tx = fakeTx([
      row('approved', '07:00', '12:00'),
      row('open',     '12:05', null),
    ])
    expect(await isInstantInApprovedSession(tx, t('14:30'))).toBe(false)
  })

  it('still locks a purchase paid inside the approved shift', async () => {
    const tx = fakeTx([
      row('approved', '07:00', '12:00'),
      row('open',     '12:05', null),
    ])
    expect(await isInstantInApprovedSession(tx, t('10:15'))).toBe(true)
  })

  it('does not lock when the owning shift is only submitted, not approved', async () => {
    const tx = fakeTx([
      row('approved',  '07:00', '12:00'),
      row('submitted', '12:05', '17:00'),
    ])
    expect(await isInstantInApprovedSession(tx, t('15:00'))).toBe(false)
  })

  it('locks a later shift once it is approved too', async () => {
    const tx = fakeTx([
      row('approved', '07:00', '12:00'),
      row('approved', '12:05', '17:00'),
    ])
    expect(await isInstantInApprovedSession(tx, t('15:00'))).toBe(true)
  })

  it('does not lock when there is no cash-up at all', async () => {
    expect(await isInstantInApprovedSession(fakeTx([]), t('10:00'))).toBe(false)
  })

  it('does not lock when today has only an open session, even with yesterday approved', async () => {
    const tx = fakeTx([
      { status: 'approved', sessionDate: new Date(Date.UTC(2026, 8, 25)), openedAt: t('07:00', 25), closedAt: t('18:00', 25) },
      row('open', '07:30', null),
    ])
    expect(await isInstantInApprovedSession(tx, t('09:00'))).toBe(false)
  })

  it('skips a voided session: its time belongs to the next live session', async () => {
    const tx = fakeTx([
      row('approved', '07:00', '09:00'),
      row('voided',   '09:05', '11:00'),
      row('open',     '11:05', null),
    ])
    expect(await isInstantInApprovedSession(tx, t('10:00'))).toBe(false)
  })

  it('locks a transaction made between shifts when the next session is approved (it falls in that window)', async () => {
    const tx = fakeTx([
      row('submitted', '07:00', '12:00'),
      row('approved',  '12:30', '17:00'),
    ])
    expect(await isInstantInApprovedSession(tx, t('12:10'))).toBe(true)
  })

  it('does not lock an instant before the very first session\'s window', async () => {
    const tx = fakeTx([row('approved', '07:00', '12:00')])
    expect(await isInstantInApprovedSession(tx, t('23:00', 25))).toBe(false)
  })
})
