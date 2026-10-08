/**
 * uploadStream: a stream of unknown length is cut into equal 8 MiB parts for
 * R2 multipart (small ones go up as a single PutObject), reassembles to the
 * exact original bytes, and an upload that fails part-way is aborted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: { name: string; input: Record<string, unknown> }[] = []
let failOnPart: number | null = null

vi.mock('@/lib/r2/client', () => ({
  R2_BUCKET: 'bucket',
  getR2Client: () => ({
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: cmd.constructor.name, input: cmd.input })
      if (cmd.constructor.name === 'CreateMultipartUploadCommand') return { UploadId: 'u1' }
      if (cmd.constructor.name === 'UploadPartCommand') {
        if (failOnPart === cmd.input.PartNumber) throw new Error('part failed')
        return { ETag: `etag-${cmd.input.PartNumber}` }
      }
      return {}
    },
  }),
}))
vi.mock('@/lib/db/tenantContext', () => ({ tenantContext: { getStore: () => undefined } }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))

import { uploadStream } from '@/lib/r2'

const PART = 8 * 1024 * 1024

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(c) { if (i < chunks.length) c.enqueue(chunks[i++]); else c.close() },
  })
}

beforeEach(() => { sent.length = 0; failOnPart = null })

describe('uploadStream', () => {
  it('uploads a small stream with a single PutObject', async () => {
    const total = await uploadStream('k', streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), 'application/zip')
    expect(total).toBe(3)
    expect(sent.map((s) => s.name)).toEqual(['PutObjectCommand'])
    expect(Array.from(sent[0]!.input.Body as Uint8Array)).toEqual([1, 2, 3])
  })

  it('cuts equal 8 MiB parts, keeps the remainder as the last part, and preserves every byte', async () => {
    const size = PART * 2 + 12345
    const data = new Uint8Array(size).map((_, i) => i % 251)
    // Awkward chunk sizes so parts straddle chunk boundaries.
    const chunks: Uint8Array[] = []
    for (let o = 0; o < size; o += 3_000_001) chunks.push(data.subarray(o, Math.min(o + 3_000_001, size)))

    const total = await uploadStream('k', streamOf(chunks), 'application/zip')
    expect(total).toBe(size)

    const names = sent.map((s) => s.name)
    expect(names[0]).toBe('CreateMultipartUploadCommand')
    expect(names.at(-1)).toBe('CompleteMultipartUploadCommand')
    const parts = sent.filter((s) => s.name === 'UploadPartCommand')
    expect(parts.map((p) => (p.input.Body as Uint8Array).length)).toEqual([PART, PART, 12345])

    const joined = new Uint8Array(size)
    let o = 0
    for (const p of parts) { const b = p.input.Body as Uint8Array; joined.set(b, o); o += b.length }
    expect(Buffer.compare(Buffer.from(joined), Buffer.from(data))).toBe(0)
    const complete = sent.at(-1)!.input.MultipartUpload as { Parts: { PartNumber: number }[] }
    expect(complete.Parts.map((p) => p.PartNumber)).toEqual([1, 2, 3])
  })

  it('aborts the multipart upload when a part fails', async () => {
    failOnPart = 2
    await expect(uploadStream('k', streamOf([new Uint8Array(PART * 2 + 1)]), 'application/zip')).rejects.toThrow('part failed')
    expect(sent.map((s) => s.name)).toContain('AbortMultipartUploadCommand')
    expect(sent.map((s) => s.name)).not.toContain('CompleteMultipartUploadCommand')
  })
})
