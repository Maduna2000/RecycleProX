import { describe, it, expect, beforeAll } from 'vitest'

// Real AWS signing code with dummy credentials (no network): proves the link a
// leaked presign response would give someone is locked to one file.
beforeAll(() => {
  process.env.R2_ACCOUNT_ID = 'acct123'
  process.env.R2_ACCESS_KEY_ID = 'AKIATEST'
  process.env.R2_SECRET_ACCESS_KEY = 'secret-test-value'
  process.env.R2_BUCKET = 'bucket1'
})

describe('presigned upload link for a release file', () => {
  it('is bound to one key and one exact size, and expires', async () => {
    const { getUploadUrl } = await import('@/lib/r2')
    const url = new URL(await getUploadUrl({
      key: 'desktop-releases/Renovo Pro Setup 0.2.0.exe', contentType: 'application/octet-stream', maxBytes: 123456789, expiresIn: 900,
    }))
    expect(url.host).toBe('bucket1.acct123.r2.cloudflarestorage.com')
    expect(decodeURIComponent(url.pathname)).toBe('/desktop-releases/Renovo Pro Setup 0.2.0.exe')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? ''
    // content-length is signed, so a link can't be used to upload a different-sized file
    expect(signed).toContain('content-length')
    expect(signed).toContain('host')
  })
})
