import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client, R2_BUCKET } from '@/lib/r2/client'
import { randomUUID } from 'crypto'

// ─── Key generators ───────────────────────────────────────────────────────────
// All paths use R2 keys (never local filesystem). Stored in DB as-is.

export function customerIdPhotoKey(customerId: string, ext: string): string {
  return `customers/${customerId}/id-photo-${randomUUID()}.${ext}`
}

export function purchasePhotoKey(purchaseId: string, ext: string): string {
  return `purchases/${purchaseId}/photo-${randomUUID()}.${ext}`
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

// ─── MIME → extension ────────────────────────────────────────────────────────

export function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
  }
  return map[mimeType] ?? 'bin'
}

// ─── Allowed photo MIME types ─────────────────────────────────────────────────

export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024  // 10 MB
