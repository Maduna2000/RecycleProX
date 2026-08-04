import { NextRequest, NextResponse } from 'next/server'
import { decode } from '@auth/core/jwt'

// Must match the salt NextAuth's own auth() (src/middleware.ts) uses to
// decode the session cookie it reads off the request — which Auth.js
// derives from the *request's own* protocol (@auth/core's
// `useSecureCookies = url.protocol === "https:"`, see init.ts), not from
// NODE_ENV. NODE_ENV can't be trusted here — this project has actually hit
// requests where process.env.NODE_ENV read "development" inside a
// Node-runtime serverless function despite Vercel's build being a
// production one (Next.js logs "NODE_ENV was incorrectly set to
// 'development'... overridden to 'production'" when this happens), which
// silently encoded/decoded mobile tokens with the wrong (non-`__Secure-`)
// salt and made every subsequent gate/scale API call 401 despite a
// successful sign-in. Reading the request's own protocol sidesteps that
// class of bug entirely by matching exactly what middleware itself uses.
function sessionSalt(req: NextRequest): string {
  return req.nextUrl.protocol === 'https:'
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
      salt: sessionSalt(req),
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
        tenantId: (decoded.tenantId as string | undefined) ?? undefined,
        schemaName: (decoded.schemaName as string | undefined) ?? undefined,
        tenantSlug: (decoded.tenantSlug as string | undefined) ?? undefined,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
}
