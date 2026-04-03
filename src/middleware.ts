import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default auth((req: NextRequest & { auth: { user?: { role?: string; forcePasswordChange?: boolean } } | null }) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Public routes
  if (pathname.startsWith('/login') || pathname.startsWith('/police')) {
    return NextResponse.next()
  }

  // API routes — 401 if no session
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

// ─── Role check helper ────────────────────────────────────────────────────────

import { ForbiddenError } from '@/lib/services/authService'

export function requireRole(
  role: string | undefined,
  allowed: string[],
) {
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenError(`Role '${role}' is not authorised for this action`)
  }
}
