import { describe, it, expect } from 'vitest'
import { maxRefSeq } from '@/lib/db/refSequence'

describe('maxRefSeq', () => {
  it('returns 0 when there are no refs', () => {
    expect(maxRefSeq([], 'S')).toBe(0)
  })

  it('takes the numeric max, not the lexical one', () => {
    expect(maxRefSeq(['PAY-20260923-9999', 'PAY-20260923-10000'], 'PAY-20260923-')).toBe(10000)
  })

  it('ignores values sharing the prefix that are not <prefix><digits>', () => {
    // "SO-..." sorts above "S00..." as text — must not reset the sequence.
    expect(maxRefSeq(['S00001', 'S00042', 'SO-LEGACY', 'S00042-X', 'S'], 'S')).toBe(42)
  })

  it('treats regex metacharacters in the prefix literally', () => {
    expect(maxRefSeq(['A.B-7', 'AXB-99'], 'A.B-')).toBe(7)
  })
})
