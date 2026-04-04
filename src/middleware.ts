/**
 * Edge-compatible middleware — uses authConfig only (no Prisma, no bcrypt).
 * Route protection and redirect logic only — no DB calls.
 */
import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const { auth } = NextAuth(authConfig)

export default auth((req: NextRequest & { auth: { user?: { role?: string; forcePasswordChange?: boolean } } | null }) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Public routes — always allow
  if (pathname.startsWith('/login') || pathname.startsWith('/police')) {
    return NextResponse.next()
  }

  // API routes — 401 if no session (individual routes do full role checks)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // App routes — redirect to login if no session
  if (pathname.startsWith('/app')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // Force password change redirect
    if (session.user?.forcePasswordChange && pathname !== '/app/change-password') {
      return NextResponse.redirect(new URL('/app/change-password', req.url))
    }

    return NextResponse.next()
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/app/:path*', '/api/:path*'],
}
