import { NextRequest, NextResponse } from 'next/server'
import { decode } from '@auth/core/jwt'

function sessionSalt(): string {
  return process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 })
  }

  try {
    const decoded = await decode({
      token,
      secret: process.env.AUTH_SECRET!,
      salt: sessionSalt(),
    })

    if (!decoded?.id || typeof decoded.id !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: decoded.id as string,
        fullName: (decoded.fullName as string) ?? '',
        username: (decoded.username as string) ?? '',
        role: (decoded.role as string) ?? '',
        forcePasswordChange: (decoded.forcePasswordChange as boolean) ?? false,
        schemaName: (decoded.schemaName as string | undefined) ?? undefined,
        tenantSlug: (decoded.tenantSlug as string | undefined) ?? undefined,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}
