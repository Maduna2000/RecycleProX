import { describe, it, expect } from 'vitest'
import { validateSaId } from '@/lib/utils/saId'

describe('validateSaId (Eswatini national ID)', () => {
  it('accepts valid alphanumeric IDs', () => {
    expect(validateSaId('AB12345').valid).toBe(true)
    expect(validateSaId('1234567890').valid).toBe(true)
    expect(validateSaId('EZ-2024-00123').valid).toBe(true)
  })

  it('accepts IDs with hyphens or slashes', () => {
    expect(validateSaId('EZ/2024/001').valid).toBe(true)
    expect(validateSaId('00-123456').valid).toBe(true)
  })

  it('rejects IDs that are too short', () => {
    expect(validateSaId('123').valid).toBe(false)
    expect(validateSaId('AB').valid).toBe(false)
  })

  it('rejects IDs that are too long', () => {
    expect(validateSaId('A'.repeat(21)).valid).toBe(false)
  })

  it('rejects empty or whitespace-only input', () => {
    expect(validateSaId('').valid).toBe(false)
    expect(validateSaId('     ').valid).toBe(false)
  })

  it('rejects IDs with special characters', () => {
    expect(validateSaId('12345@678').valid).toBe(false)
    expect(validateSaId('ID#12345').valid).toBe(false)
  })
})
