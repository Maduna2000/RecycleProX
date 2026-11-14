import {
  PutObjectCommand, DeleteObjectCommand, GetObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client, R2_BUCKET } from '@/lib/r2/client'
import { tenantContext } from '@/lib/db/tenantContext'
import { randomUUID } from 'crypto'

// ─── Direct server-side upload ────────────────────────────────────────────────

export async function uploadBytes(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const client = getR2Client()
  await client.send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         key,
    Body:        bytes,
    ContentType: contentType,
  }))
}

// ─── Key generators ───────────────────────────────────────────────────────────
// All paths use R2 keys (never local filesystem). Stored in DB as-is.
//
// New keys are prefixed with the current tenant's schema name so one shared
// bucket safely serves every tenant without collisions once multi-tenancy
// goes live. No-op today (empty prefix) since nothing populates tenantContext
// yet — Golden Key's existing keys stay unprefixed, grandfathered as-is.
function tenantKeyPrefix(): string {
  const schemaName = tenantContext.getStore()?.schemaName
  return schemaName ? `${schemaName}/` : ''
}

export function customerIdPhotoKey(customerId: string, ext: string): string {
  return `${tenantKeyPrefix()}customers/${customerId}/id-photo-${randomUUID()}.${ext}`
}

export function purchasePhotoKey(purchaseId: string, ext: string): string {
  return `${tenantKeyPrefix()}purchases/${purchaseId}/photo-${randomUUID()}.${ext}`
}

export function customerDocumentKey(customerId: string, ext: string): string {
  return `${tenantKeyPrefix()}customers/${customerId}/documents/${randomUUID()}.${ext}`
}

export function expenseAttachmentKey(expenseId: string, ext: string): string {
  return `${tenantKeyPrefix()}expenses/${expenseId}/attachments/${randomUUID()}.${ext}`
}

export function purchaseVat264Key(purchaseId: string): string {
  return `${tenantKeyPrefix()}purchases/${purchaseId}/vat264.pdf`
}

export function purchaseNoteKey(purchaseId: string): string {
  return `${tenantKeyPrefix()}purchases/${purchaseId}/purchase-note.pdf`
}

export function scaleOrderPhotoKey(orderId: string, index: number, ext: string): string {
  return `${tenantKeyPrefix()}scale-orders/${orderId}/photo-${index}-${randomUUID()}.${ext}`
}

export function scaleOrderSlipKey(orderId: string): string {
  return `${tenantKeyPrefix()}scale-orders/${orderId}/slip.pdf`
}

export function gateEntryPhotoKey(entryId: string, index: number, ext: string): string {
  return `${tenantKeyPrefix()}gate-entries/${entryId}/photo-${index}-${randomUUID()}.${ext}`
}

// One export object per user, overwritten on each download, so temporary
// ZIPs never pile up in the bucket.
export function expenseReceiptsExportKey(userId: string): string {
  return `${tenantKeyPrefix()}exports/expense-receipts/${userId}.zip`
}

export function momoStatementCsvKey(importId: string): string {
  return `${tenantKeyPrefix()}momo-statements/${importId}.csv`
}

// ─── Presigned upload URL (PUT) ───────────────────────────────────────────────
// Client uploads directly to R2 — server never handles the binary.

export async function getUploadUrl(opts: {
  key: string
  contentType: string
  maxBytes?: number
  expiresIn?: number  // seconds, default 300
}): Promise<string> {
  const client = getR2Client()
  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: opts.key,
    ContentType: opts.contentType,
    ...(opts.maxBytes && { ContentLength: opts.maxBytes }),
  })
  return getSignedUrl(client, cmd, { expiresIn: opts.expiresIn ?? 300 })
}

// ─── Presigned view URL (GET) ─────────────────────────────────────────────────
// Generate a time-limited URL for the browser to display the photo.

export async function getViewUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getR2Client()
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
  return getSignedUrl(client, cmd, { expiresIn })
}

// ─── Streaming multipart upload ───────────────────────────────────────────────
// Uploads a stream of unknown length without holding it all in memory. R2
// needs every part except the last to be the same size, so parts are cut at a
// fixed size. Returns the total bytes written. An upload that fails part-way
// is aborted so no orphaned parts are left (and billed) in the bucket.

const MULTIPART_PART_BYTES = 8 * 1024 * 1024

export async function uploadStream(
  key: string,
  stream: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<number> {
  const client = getR2Client()
  const reader = stream.getReader()
  const pending: Uint8Array[] = []
  let pendingBytes = 0
  let total = 0
  let uploadId: string | undefined
  const parts: { ETag: string | undefined; PartNumber: number }[] = []

  const takePart = (size: number): Uint8Array => {
    const out = new Uint8Array(size)
    let filled = 0
    while (filled < size) {
      const head = pending[0]!
      const need = size - filled
      if (head.length <= need) {
        out.set(head, filled); filled += head.length; pending.shift()
      } else {
        out.set(head.subarray(0, need), filled); pending[0] = head.subarray(need); filled += need
      }
    }
    pendingBytes -= size
    return out
  }

  const sendPart = async (body: Uint8Array) => {
    if (!uploadId) {
      const created = await client.send(new CreateMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }))
      uploadId = created.UploadId
      if (!uploadId) throw new Error('R2 did not return a multipart upload id')
    }
    const partNumber = parts.length + 1
    const res = await client.send(new UploadPartCommand({
      Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body,
    }))
    parts.push({ ETag: res.ETag, PartNumber: partNumber })
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value?.length) { pending.push(value); pendingBytes += value.length; total += value.length }
      while (pendingBytes >= MULTIPART_PART_BYTES) await sendPart(takePart(MULTIPART_PART_BYTES))
      if (done) break
    }
    const rest = pendingBytes > 0 ? takePart(pendingBytes) : new Uint8Array(0)
    if (!uploadId) {
      // Small enough for a single request.
      await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: rest, ContentType: contentType }))
      return total
    }
    if (rest.length > 0) await sendPart(rest)
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts },
    }))
    return total
  } catch (err) {
    if (uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId })).catch(() => undefined)
    }
    throw err
  } finally {
    reader.releaseLock()
  }
}

// ─── Presigned download URL (forces a file download) ─────────────────────────

export async function getDownloadUrl(key: string, fileName: string, contentType: string, expiresIn = 600): Promise<string> {
  const client = getR2Client()
  const cmd = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
  })
  return getSignedUrl(client, cmd, { expiresIn })
}

// ─── Delete object ────────────────────────────────────────────────────────────

export async function deleteR2Object(key: string): Promise<void> {
  const client = getR2Client()
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

// ─── Fetch raw bytes from R2 ─────────────────────────────────────────────────

// A single hung/slow R2 request (e.g. a report embedding dozens of scale-
// kiosk photos) must never be allowed to stall the whole request past the
// hosting platform's own function timeout — that kills the connection with
// no response at all, which the browser surfaces as an opaque "Failed to
// fetch" rather than a proper error. Bounding each fetch lets a single bad
// object fall back to null (→ "No image" at render time) instead of taking
// the entire export down with it.
const R2_FETCH_TIMEOUT_MS = 15_000

export async function fetchR2Bytes(key: string): Promise<Uint8Array | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), R2_FETCH_TIMEOUT_MS)
  try {
    const client = getR2Client()
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
    const res = await client.send(cmd, { abortSignal: controller.signal })
    if (!res.Body) return null
    const chunks: Uint8Array[] = []
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0)
    const buf = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.length }
    return buf
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ─── MIME → extension ────────────────────────────────────────────────────────

export function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  }
  return map[mimeType] ?? 'bin'
}

// ─── Allowed photo MIME types ─────────────────────────────────────────────────

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024  // 10 MB

// ─── Allowed document MIME types (customer documents, expense attachments) ────

export const ALLOWED_DOCUMENT_TYPES = [
  ...ALLOWED_PHOTO_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024  // 20 MB
