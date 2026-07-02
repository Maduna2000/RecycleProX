/**
 * API-route auth helpers. Same semantics as the inline pattern used across
 * existing routes (auth() → 401, role check → 403), packaged so new routes
 * don't copy-paste the block. Existing routes are intentionally untouched.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import type { Session } from 'next-auth'

type RequireRoleResult =
  | { session: Session; response: null }
  | { session: null; response: NextResponse }

export async function requireRole(roles: string[]): Promise<RequireRoleResult> {
  const session = await auth()
  if (!session?.user) {
    return { session: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!roles.includes(session.user.role)) {
    return { session: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, response: null }
}
