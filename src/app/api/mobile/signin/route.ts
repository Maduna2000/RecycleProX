import { NextRequest, NextResponse } from 'next/server'
import { encode } from '@auth/core/jwt'
import { z } from 'zod'
import {
  login,
  InvalidCredentialsError,
  AccountLockedError,
  AccountInactiveError,
} from '@/lib/services/authService'
import logger from '@/lib/logger'

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// Must match the salt NextAuth uses when decoding session cookies:
// HTTPS (production/Vercel) → __Secure-authjs.session-token
// HTTP  (local dev)         → authjs.session-token
function sessionSalt(): string {
  return process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'username and password are required' }, { status: 400 })
  }

  const { username, password } = parsed.data

  try {
    const { user, forcePasswordChange } = await login(username, password)

    const token = await encode({
      token: {
        sub: user.id,
        id: user.id,
        name: user.fullName,
        email: user.username,
        role: user.role,
        fullName: user.fullName,
        username: user.username,
        forcePasswordChange,
      },
      secret: process.env.AUTH_SECRET!,
      // 30-day expiry — mobile devices hold sessions much longer than browsers
      maxAge: 30 * 24 * 60 * 60,
      salt: sessionSalt(),
    })

    logger.info({ userId: user.id, username }, 'Mobile sign-in successful')

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        forcePasswordChange,
      },
    })
  } catch (err) {
    if (
      err instanceof InvalidCredentialsError ||
      err instanceof AccountLockedError ||
      err instanceof AccountInactiveError
    ) {
      return NextResponse.json({ error: err.message }, { status: 401 })
    }
    logger.error({ err, username }, 'Mobile sign-in unexpected error')
    return NextResponse.json({ error: 'Sign in failed — please try again' }, { status: 500 })
  }
}
