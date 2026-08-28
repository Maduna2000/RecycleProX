import { NextRequest, NextResponse } from 'next/server'
import { decode, encode } from '@auth/core/jwt'
import { auth } from '@/auth'
import { authConfig } from '@/auth.config'
import { changePassword, InvalidCurrentPasswordError } from '@/lib/services/authService'
import { ChangePasswordSchema } from '@/lib/schemas/auth'
import { runWithRequestTenant } from '@/lib/db/tenantContext'
import logger from '@/lib/logger'

// Must match the salt src/middleware.ts's own auth() uses to decode the
// session cookie — Auth.js derives this from the *request's own* protocol,
// not NODE_ENV (see src/app/api/mobile/signin/route.ts's identical helper
// for why NODE_ENV can't be trusted here).
function sessionCookieName(req: NextRequest): string {
  return req.nextUrl.protocol === 'https:'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    await runWithRequestTenant(req, () => changePassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword))

    const res = NextResponse.json({ success: true })

    // Reissue the session cookie with forcePasswordChange cleared in this
    // same response, rather than leaving it to the client's separate
    // useSession().update() round trip afterward — that call races
    // SessionProvider's own background refetches (window focus, polling):
    // if one fires between this response and the update() call, update()
    // silently no-ops (next-auth's client bails out early whenever a
    // refetch is already in flight) and the JWT cookie never gets patched,
    // so middleware keeps bouncing the redirect to /app/dashboard straight
    // back to this page even though the DB flag is already correct — the
    // change appears to silently do nothing. Doing it here removes the
    // race entirely: by the time the client navigates, the cookie is
    // already right.
    const cookieName = sessionCookieName(req)
    const rawToken = req.cookies.get(cookieName)?.value
    if (rawToken) {
      try {
        const secret = process.env.AUTH_SECRET!
        const payload = await decode({ token: rawToken, secret, salt: cookieName })
        if (payload) {
          const maxAge = authConfig.session?.maxAge ?? 12 * 60 * 60
          const newToken = await encode({
            token: { ...payload, forcePasswordChange: false },
            secret,
            salt: cookieName,
            maxAge,
          })
          res.cookies.set(cookieName, newToken, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: req.nextUrl.protocol === 'https:',
            maxAge,
          })
        }
      } catch (err) {
        // Never fail the password change over a cookie refresh problem —
        // worst case the user sees one extra bounce back to this page.
        logger.error({ err }, 'Failed to reissue session cookie after password change')
      }
    }

    return res
  } catch (err) {
    if (err instanceof InvalidCurrentPasswordError) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to change password'
    logger.error({ err }, 'POST change-password failed')
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? msg : 'Failed to change password' },
      { status: 500 }
    )
  }
}
