import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
const r2 = vi.hoisted(() => ({
  uploadBytes: vi.fn(async () => undefined),
  getUploadUrl: vi.fn(async (o: { key: string }) => `https://r2.example/${o.key}?sig=up`),
  getViewUrl: vi.fn(async (k: string) => `https://r2.example/${k}?sig=down`),
  objectExists: vi.fn(async () => true),
  fetchR2Bytes: vi.fn(async () => new TextEncoder().encode('version: 0.2.0\npath: Renovo-Pro-Setup-0.2.0.exe\n')),
}))
vi.mock('@/lib/r2', () => r2)

import { POST as presign } from '@/app/api/internal/desktop-release/presign/route'
import { POST as publish } from '@/app/api/internal/desktop-release/route'
import { GET as feed } from '@/app/api/desktop/update-feed/[...path]/route'

const saved = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_API_SHARED_SECRET = 'held-by-every-till'
  process.env.DESKTOP_RELEASE_UPLOAD_SECRET = 'ci-only-secret-value'
  r2.objectExists.mockResolvedValue(true)
})
afterEach(() => { process.env = { ...saved } })

const json = (body: unknown, secret = 'ci-only-secret-value') =>
  new NextRequest('http://x/api/internal/desktop-release/presign', {
    method: 'POST', headers: { 'x-release-secret': secret, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })

describe('POST /presign (installer + blockmap only)', () => {
  it('returns a link locked to one key and the declared size', async () => {
    const res = await presign(json({ filename: 'Renovo Pro Setup 0.2.0.exe', size: 200_000_000 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toContain('desktop-releases/Renovo Pro Setup 0.2.0.exe')
    expect(r2.getUploadUrl).toHaveBeenCalledWith(expect.objectContaining({
      key: 'desktop-releases/Renovo Pro Setup 0.2.0.exe', contentType: 'application/octet-stream', maxBytes: 200_000_000, expiresIn: 900,
    }))
  })
  it('refuses the shared secret every till holds', async () => {
    expect((await presign(json({ filename: 'a.exe', size: 5 }, 'held-by-every-till'))).status).toBe(401)
    expect(r2.getUploadUrl).not.toHaveBeenCalled()
  })
  it('refuses latest.yml (must go through the validated route) and odd names', async () => {
    for (const filename of ['latest.yml', '../x.exe', 'a/b.exe', 'evil.js', 'x.exe.sh']) {
      expect((await presign(json({ filename, size: 5 }))).status).toBe(400)
    }
    expect(r2.getUploadUrl).not.toHaveBeenCalled()
  })
  it('refuses missing, zero, fractional or oversized sizes', async () => {
    for (const size of [undefined, 0, -1, 1.5, 700 * 1024 * 1024]) {
      expect((await presign(json({ filename: 'a.exe', size }))).status).toBe(400)
    }
  })
})

const form = (name: string, content: string, secret = 'ci-only-secret-value') => {
  const fd = new FormData(); fd.set('file', new File([content], name))
  return new NextRequest('http://x/api/internal/desktop-release', { method: 'POST', headers: { 'x-release-secret': secret }, body: fd })
}

describe('POST /desktop-release (latest.yml only, validated)', () => {
  it('stores a valid latest.yml', async () => {
    const res = await publish(form('latest.yml', 'version: 0.2.0\npath: Renovo-Pro-Setup-0.2.0.exe\n'))
    expect(res.status).toBe(200)
    expect(r2.uploadBytes).toHaveBeenCalledWith('desktop-releases/latest.yml', expect.any(Uint8Array), 'text/yaml')
  })
  it('rejects a latest.yml pointing at another host', async () => {
    const res = await publish(form('latest.yml', 'path: https://evil.example/x.exe\n'))
    expect(res.status).toBe(400)
    expect(r2.uploadBytes).not.toHaveBeenCalled()
  })
  it('no longer accepts installers here, and needs the CI secret', async () => {
    expect((await publish(form('Renovo Pro Setup 0.2.0.exe', 'x'))).status).toBe(400)
    expect((await publish(form('latest.yml', 'path: a.exe\n', 'held-by-every-till'))).status).toBe(401)
    expect(r2.uploadBytes).not.toHaveBeenCalled()
  })
})

const get = (...path: string[]) => feed(new NextRequest('http://x/api/desktop/update-feed/' + path.join('/')), { params: Promise.resolve({ path }) })

describe('GET /update-feed', () => {
  it('serves latest.yml directly', async () => {
    const res = await get('latest.yml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('yaml')
  })
  it('redirects the installer to a short-lived R2 link (too big to stream through the app)', async () => {
    const res = await get('Renovo Pro Setup 0.2.0.exe')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('r2.example/desktop-releases/Renovo')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(r2.fetchR2Bytes).not.toHaveBeenCalled()
  })
  it('404s a missing installer, and any name that is not a release file', async () => {
    r2.objectExists.mockResolvedValue(false)
    expect((await get('Renovo Pro Setup 9.9.9.exe')).status).toBe(404)
    expect((await get('secrets.txt')).status).toBe(404)
    expect((await get('..', 'x.exe')).status).toBe(400)
  })
})
