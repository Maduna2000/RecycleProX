/**
 * DEV-ONLY diagnostic — tests R2 connectivity and shows config.
 * Remove or guard this before production.
 */
import { NextResponse } from 'next/server'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getR2Client, R2_BUCKET } from '@/lib/r2/client'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const accountId  = process.env.R2_ACCOUNT_ID
  const keyId      = process.env.R2_ACCESS_KEY_ID
  const bucket     = R2_BUCKET
  const endpoint   = `https://${accountId}.r2.cloudflarestorage.com`

  const config = {
    endpoint,
    bucket,
    accountIdSet:  !!accountId,
    accessKeySet:  !!keyId,
    secretKeySet:  !!process.env.R2_SECRET_ACCESS_KEY,
    accountIdLen:  accountId?.length,
    accessKeyLen:  keyId?.length,
  }

  try {
    await getR2Client().send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))
    return NextResponse.json({ ok: true, config })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, config, error: message }, { status: 500 })
  }
}
