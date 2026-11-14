import { describe, it, expect } from 'vitest'
import { resolveLoginTenantSlug } from '@/lib/auth/resolveLoginTenantSlug'

describe('resolveLoginTenantSlug', () => {
  it('Web: an explicit subdomain slug is used as-is', () => {
    expect(resolveLoginTenantSlug('milanzo-', undefined)).toBe('milanzo-')
    expect(resolveLoginTenantSlug('  acme ', undefined)).toBe('acme')
  })
  it('Web: no slug and no licensed company -> default tenant (unchanged behaviour)', () => {
    expect(resolveLoginTenantSlug(undefined, undefined)).toBeUndefined()
    expect(resolveLoginTenantSlug('', '')).toBeUndefined()
    expect(resolveLoginTenantSlug('undefined', undefined)).toBeUndefined()
  })
  it('Desktop: no slug -> the company this install is licensed to', () => {
    expect(resolveLoginTenantSlug(undefined, 'milanzo-')).toBe('milanzo-')
    expect(resolveLoginTenantSlug('undefined', ' milanzo- ')).toBe('milanzo-')
    expect(resolveLoginTenantSlug('  ', 'golden-key')).toBe('golden-key')
  })
  it('an explicit slug still wins over the licensed company (the licence check then rejects a mismatch)', () => {
    expect(resolveLoginTenantSlug('other', 'milanzo-')).toBe('other')
  })
  it('blank licensed value is ignored', () => {
    expect(resolveLoginTenantSlug(undefined, '   ')).toBeUndefined()
  })
})
