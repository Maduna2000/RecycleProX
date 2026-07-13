'use client'

import { useSession } from 'next-auth/react'

// Company-level plan entitlements (session.user.featureFlags), populated at
// login by companyAccessClient.ts's checkCompanyAccess() call to the Portal.
// Distinct from allowedModules: allowedModules is per-user (what one staff
// member is permitted to open within their own company), featureFlags is
// per-company (what the company's subscription plan includes at all).
// Absent for the default/legacy tenant, which has no Portal-managed
// subscription — every flag reads as enabled there, matching the "flag
// missing = feature included" default used everywhere else in this hook.
export function useFeatureFlags(): Record<string, boolean> {
  const { data: session } = useSession()
  return session?.user?.featureFlags ?? {}
}

// A flag that's never been explicitly set (new company, or the default
// tenant with no Portal subscription) defaults to enabled — feature gating
// is opt-out (Plan.featureFlags / CompanyFeatureOverride explicitly
// disabling something), not opt-in, so existing tenants see no behavior
// change until an admin actually flips a flag off.
export function useFeatureFlag(key: string): boolean {
  const flags = useFeatureFlags()
  return flags[key] !== false
}
