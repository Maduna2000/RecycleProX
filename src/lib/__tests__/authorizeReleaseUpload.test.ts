import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { authorizeReleaseUploadRequest, authorizeInternalRequest } from '@/lib/internal/authorizeInternalRequest'

const req = (headers: Record<string, string>) => ({ headers: new Headers(headers) }) as unknown as NextRequest
const saved = { ...process.env }

beforeEach(() => {
  process.env.INTERNAL_API_SHARED_SECRET = 'shared-secret-held-by-every-till'
  process.env.DESKTOP_RELEASE_UPLOAD_SECRET = 'ci-only-release-secret-value'
})
afterEach(() => { process.env = { ...saved } })

describe('authorizeReleaseUploadRequest', () => {
  it('accepts the dedicated release secret', () => {
    expect(authorizeReleaseUploadRequest(req({ 'x-release-secret': 'ci-only-release-secret-value' }))).toBe(true)
  })
  it('REJECTS the shared secret every till holds (the whole point of the split)', () => {
    expect(authorizeReleaseUploadRequest(req({ 'x-internal-secret': 'shared-secret-held-by-every-till' }))).toBe(false)
    expect(authorizeReleaseUploadRequest(req({ 'x-release-secret': 'shared-secret-held-by-every-till' }))).toBe(false)
  })
  it('rejects wrong, missing and empty secrets', () => {
    expect(authorizeReleaseUploadRequest(req({ 'x-release-secret': 'nope' }))).toBe(false)
    expect(authorizeReleaseUploadRequest(req({}))).toBe(false)
    expect(authorizeReleaseUploadRequest(req({ 'x-release-secret': '' }))).toBe(false)
  })
  it('is disabled when the release secret is not configured', () => {
    delete process.env.DESKTOP_RELEASE_UPLOAD_SECRET
    expect(authorizeReleaseUploadRequest(req({ 'x-release-secret': '' }))).toBe(false)
  })
  it('is refused outright if someone sets both secrets to the same value', () => {
    process.env.DESKTOP_RELEASE_UPLOAD_SECRET = process.env.INTERNAL_API_SHARED_SECRET
    expect(authorizeReleaseUploadRequest(req({ 'x-release-secret': process.env.INTERNAL_API_SHARED_SECRET! }))).toBe(false)
  })
  it('does not change how the shared secret works elsewhere', () => {
    expect(authorizeInternalRequest(req({ 'x-internal-secret': 'shared-secret-held-by-every-till' }))).toBe(true)
  })
})
