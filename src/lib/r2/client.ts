import { S3Client } from '@aws-sdk/client-s3'

// Cloudflare R2 uses S3-compatible API
// Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
let _client: S3Client | null = null

export function getR2Client(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return _client
}

export const R2_BUCKET = process.env.R2_BUCKET ?? process.env.R2_BUCKET_NAME ?? 'renovopro'
