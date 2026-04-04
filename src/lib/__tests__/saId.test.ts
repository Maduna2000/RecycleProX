import { describe, it, expect } from 'vitest'
import { validateSaId } from '@/lib/utils/saId'

describe('validateSaId', () => {
  it('accepts a valid SA ID number', () => {
    // Real Luhn-valid SA IDs
    expect(validateSaId('8001015009087')).toBe(true)
    expect(validateSaId('9001014800088')).toBe(true)
  })

  it('rejects IDs that are too short or too long', () => {
    expect(validateSaId('123456789012')).toBe(false)    // 12 digits
    expect(validateSaId('12345678901234')).toBe(false)  // 14 digits
  })

  it('rejects non-numeric input', () => {
    expect(validateSaId('800101500908A')).toBe(false)
    expect(validateSaId('             ')).toBe(false)
  })

  it('rejects IDs that fail the Luhn check', () => {
    expect(validateSaId('8001015009088')).toBe(false)  // last digit changed
  })
})
