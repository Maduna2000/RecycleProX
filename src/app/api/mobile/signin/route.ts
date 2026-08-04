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
  // Resolved client-side from wherever the mobile app determined the
  // tenant (e.g. a saved company slug) — undefined keeps sign-in on the
  // default/legacy tenant, same as the web login when no subdomain resolves.
  tenantSlug: z.string().optional(),
})

// Must match the salt NextAuth's own auth() (src/middleware.ts) uses to
// decode the session cookie it reads off the request — which Auth.js
// derives from the *request's own* protocol (@auth/core's
// `useSecureCookies = url.protocol === "https:"`, see init.ts), not from
// NODE_ENV. NODE_ENV can't be trusted here — this project has actually hit
// requests where process.env.NODE_ENV read "development" inside a
// Node-runtime serverless function despite Vercel's build being a
// production one (Next.js logs "NODE_ENV was incorrectly set to
// 'development'... overridden to 'production'" when this happens), which
// silently encoded mobile tokens with the wrong (non-`__Secure-`) salt and
// made every subsequent gate/scale API call 401 despite a successful
// sign-in. Reading the request's own protocol sidesteps that class of bug
// entirely by matching exactly what middleware itself uses.
function sessionSalt(req: NextRequest): string {
  return req.nextUrl.protocol === 'https:'
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

  const { username, password, tenantSlug } = parsed.data

  try {
    const result = await login(username, password, tenantSlug)
    const { user, forcePasswordChange } = result
    const tenantId = 'tenantId' in result ? result.tenantId : undefined
    const schemaName = 'schemaName' in result ? result.schemaName : undefined
    const resolvedTenantSlug = 'tenantSlug' in result ? result.tenantSlug : undefined
    const featureFlags = 'featureFlags' in result ? result.featureFlags : undefined

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
        // tenantId is what middleware.ts forwards as x-tenant-id and every
        // business-model query needs (see requireTenantId() in
        // src/lib/db/tenantContext.ts) — without it here, a mobile session
        // decodes fine but every gate/scale API call then 500s with
        // MissingTenantContextError instead of ever reaching real data.
        tenantId,
        schemaName,
        tenantSlug: resolvedTenantSlug,
        featureFlags,
      },
      secret: process.env.AUTH_SECRET!,
      // 30-day expiry — mobile devices hold sessions much longer than browsers
      maxAge: 30 * 24 * 60 * 60,
      salt: sessionSalt(req),
    })

    logger.info({ userId: user.id, username, tenantId, tenantSlug: resolvedTenantSlug }, 'Mobile sign-in successful')

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        forcePasswordChange,
        tenantId,
        schemaName,
        tenantSlug: resolvedTenantSlug,
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
