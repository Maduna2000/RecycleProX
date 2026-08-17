import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
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
