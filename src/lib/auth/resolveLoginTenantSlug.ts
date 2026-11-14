// Which company is a login for?
//
// On Web (Vercel) the company comes from the login subdomain (middleware.ts), so
// `tenantSlug` is set and nothing here changes. The desktop app is served from
// http://127.0.0.1:<port>, where there is no subdomain, so `tenantSlug` is
// absent — and login() used to fall back to the default/legacy company (the one
// registered against the "public" schema, i.e. Golden Key) for EVERY till,
// whichever company the till was licensed to. For any other company that either
// logged the user into Golden Key's data or, once the licensed-company check
// applied, rejected every login.
//
// A desktop install is licensed to exactly one company (LICENSED_TENANT_SLUG,
// set from the stored activation or desktop.env — never set on Web), so when no
// company was given we use that one. An explicit tenantSlug still wins (and the
// licensed-company check in src/auth.ts then rejects a mismatch, as before).
export function resolveLoginTenantSlug(
  tenantSlug: string | undefined,
  licensedTenantSlug: string | undefined,
): string | undefined {
  const given = tenantSlug?.trim()
  // next-auth's signIn() can coerce an undefined field to the literal "undefined".
  if (given && given !== 'undefined') return given
  const licensed = licensedTenantSlug?.trim()
  return licensed || undefined
}
