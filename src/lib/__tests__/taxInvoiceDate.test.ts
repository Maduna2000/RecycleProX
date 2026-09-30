import { describe, it, expect } from 'vitest'
import { resolveTaxInvoiceDate, toSastInputValue, fromSastInputValue } from '@/lib/utils/taxInvoiceDate'

const created = new Date('2026-09-01T08:00:00Z')
const paid = new Date('2026-09-10T09:30:00Z')
const override = new Date('2026-09-05T10:00:00Z')

describe('resolveTaxInvoiceDate', () => {
  it('prefers the manual override', () => {
    expect(resolveTaxInvoiceDate({ override, lastPaymentAt: paid, createdAt: created }))
      .toEqual({ date: override, source: 'override' })
  })
  it('uses the last payment when there is no override', () => {
    expect(resolveTaxInvoiceDate({ override: null, lastPaymentAt: paid, createdAt: created }))
      .toEqual({ date: paid, source: 'payment' })
  })
  it('falls back to createdAt when paid at creation', () => {
    expect(resolveTaxInvoiceDate({ override: null, lastPaymentAt: null, createdAt: created }))
      .toEqual({ date: created, source: 'created' })
  })
})

describe('SAST input helpers', () => {
  it('renders UTC as SAST (UTC+2)', () => {
    expect(toSastInputValue(new Date('2026-09-10T22:30:00Z'))).toBe('2026-09-11T00:30')
  })
  it('round-trips through the offset ISO string', () => {
    const v = '2026-09-11T00:30'
    expect(toSastInputValue(new Date(fromSastInputValue(v)))).toBe(v)
    expect(new Date(fromSastInputValue(v)).toISOString()).toBe('2026-09-10T22:30:00.000Z')
  })
})
