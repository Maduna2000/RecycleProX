import { S3Client } from '@aws-sdk/client-s3'

// Cloudflare R2 uses S3-compatible API
// Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
let _client: S3Client | null = null

export function getR2Client(): S3Client {
  if (_client) return _client
  const accountId  = process.env.R2_ACCOUNT_ID
  const accessKey  = process.env.R2_ACCESS_KEY_ID
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY
  const bucket     = R2_BUCKET
  if (!accountId || !accessKey || !secretKey || !bucket) {
    throw new Error(
      `R2 not configured. Missing: ${[
        !accountId  && 'R2_ACCOUNT_ID',
        !accessKey  && 'R2_ACCESS_KEY_ID',
        !secretKey  && 'R2_SECRET_ACCESS_KEY',
        !bucket     && 'R2_BUCKET',
      ].filter(Boolean).join(', ')}`
    )
  }
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  })
  return _client
}

export const R2_BUCKET = process.env.R2_BUCKET ?? process.env.R2_BUCKET_NAME ?? ''
