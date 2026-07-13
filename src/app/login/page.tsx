import { headers } from 'next/headers'
import { LoginForm } from './LoginForm'

// Server component so it can read the x-tenant-slug header middleware.ts
// derives from the request's subdomain (or the dev-only ?tenant= override)
// and hand it to the client form as a plain prop — middleware can rewrite
// headers but can't otherwise pass data into a page.
export default function LoginPage() {
  const tenantSlug = headers().get('x-tenant-slug') ?? undefined
  return <LoginForm tenantSlug={tenantSlug} />
}
