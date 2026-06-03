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
  if (pathname.startsWith('/login') || pathname.startsWith('/police') ||
      pathname === '/api/r2/test' || pathname === '/scale/login' ||
      pathname.startsWith('/api/mobile/')) {
    return NextResponse.next()
  }

  // API routes — 401 if no session (individual routes do full role checks)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Scale station operator routes — restricted to scale_operator + admin + manager
  if (pathname.startsWith('/scale') && !pathname.startsWith('/scale/admin')) {
    if (!session) return NextResponse.redirect(new URL('/scale/login', req.url))
    const role = session.user?.role
    if (!['scale_operator', 'admin', 'manager'].includes(role ?? '')) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Scale admin routes — admin + manager only
  if (pathname.startsWith('/scale/admin')) {
    if (!session) return NextResponse.redirect(new URL('/login', req.url))
    const role = session.user?.role
    if (!['admin', 'manager'].includes(role ?? '')) {
      return NextResponse.redirect(new URL('/app/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // App routes — redirect to login if no session
  if (pathname.startsWith('/app')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // Scale operators belong on the scale station, not the main app
    if (session.user?.role === 'scale_operator') {
      return NextResponse.redirect(new URL('/scale', req.url))
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
  matcher: ['/app/:path*', '/scale/:path*', '/api/:path*'],
}
