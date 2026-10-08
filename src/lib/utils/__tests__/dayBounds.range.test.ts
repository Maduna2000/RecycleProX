import { describe, it, expect } from 'vitest'
import { parseSASTDateRange } from '../dayBounds'

describe('parseSASTDateRange', () => {
  it('covers a whole month in SAST (UTC+2)', () => {
    const r = parseSASTDateRange('2026-09-01', '2026-09-30')!
    expect(r.from!.toISOString()).toBe('2026-08-31T22:00:00.000Z')
    expect(r.to!.toISOString()).toBe('2026-09-30T21:59:59.999Z')
  })

  it('includes the whole day for a single-day filter', () => {
    const r = parseSASTDateRange('2026-09-15', '2026-09-15')!
    expect(r.to!.getTime() - r.from!.getTime()).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('includes a record created at 00:30 SAST on the first day and 23:30 SAST on the last', () => {
    const r = parseSASTDateRange('2026-09-01', '2026-09-30')!
    const early = new Date('2026-08-31T22:30:00.000Z') // 00:30 SAST 1 Sep
    const late = new Date('2026-09-30T21:30:00.000Z') // 23:30 SAST 30 Sep
    expect(early >= r.from! && early <= r.to!).toBe(true)
    expect(late >= r.from! && late <= r.to!).toBe(true)
  })

  it('excludes records just outside the range', () => {
    const r = parseSASTDateRange('2026-09-01', '2026-09-30')!
    expect(new Date('2026-08-31T21:59:59.999Z') < r.from!).toBe(true)
    expect(new Date('2026-09-30T22:00:00.000Z') > r.to!).toBe(true)
  })

  it('supports open-ended ranges', () => {
    expect(parseSASTDateRange('2026-09-01', undefined)).toEqual({ from: new Date('2026-08-31T22:00:00.000Z'), to: undefined })
    expect(parseSASTDateRange(null, '2026-09-30')!.from).toBeUndefined()
    expect(parseSASTDateRange(null, null)).toEqual({ from: undefined, to: undefined })
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseSASTDateRange('2026-9-1', null)).toBeNull()
    expect(parseSASTDateRange('abc', null)).toBeNull()
    expect(parseSASTDateRange(null, '2026-02-31')).toBeNull()
  })
})
