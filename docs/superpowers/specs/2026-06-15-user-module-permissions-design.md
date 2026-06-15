# User Module Permissions Design

**Date:** 2026-06-15
**Status:** Approved
**Author:** Claude (with user approval)

## Overview

Implement per-user module access control and restrict scale operators from accessing the main Renovo Pro system via the main login page.

## Requirements

1. **Scale operators blocked from main login** — must use `/scale/login` only
2. **Per-user module permissions** — admin assigns which modules each user can access
3. **Admins bypass permissions** — always have full access to all modules
4. **Existing users get full access by default** — no disruption on rollout
5. **Scale operators managed from main users page** — single location for all user management

## Database Schema

### New Table: `UserModuleAccess`

```prisma
model UserModuleAccess {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  moduleKey   String   // e.g., "/app/purchases", "/app/sales"
  grantedById String?
  grantedAt   DateTime @default(now())

  @@unique([userId, moduleKey])
  @@index([userId])
  @@index([moduleKey])
}
```

### User Model Update

```prisma
model User {
  // ... existing fields
  moduleAccess  UserModuleAccess[]
}
```

### Controllable Modules

| Module Key | Display Name |
|------------|--------------|
| `/app/dashboard` | Dashboard |
| `/app/customers` | Accounts |
| `/app/purchases` | Purchases |
| `/app/sales` | Sales |
| `/app/payments` | Payments |
| `/app/expenses` | Expenses |
| `/app/cashup` | Cash Up |
| `/app/float` | Float |
| `/app/stock` | Stock |
| `/app/stocktake` | Stocktake |
| `/app/products` | Products |
| `/app/price-groups` | Price Groups |
| `/app/reports` | Reports |
| `/app/loans` | Loans |
| `/app/police-register` | Police Register |
| `/app/audit-log` | Audit Log |
| `/app/settings` | Settings |

## Permission Checking Logic

### JWT Token Approach

Since middleware runs on Edge Runtime (no Prisma access), allowed modules are encoded in the JWT token at login time.

**auth.config.ts callbacks:**
```typescript
jwt({ token, user }) {
  if (user) {
    // ... existing fields
    token.allowedModules = user.allowedModules // string[]
  }
  return token
}

session({ session, token }) {
  // ... existing fields
  session.user.allowedModules = token.allowedModules as string[]
  return session
}
```

### Middleware Permission Check

**middleware.ts** — for `/app/*` routes:

```typescript
if (pathname.startsWith('/app')) {
  // 1. Redirect to login if no session
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // 2. Admins bypass all permission checks
  if (session.user.role === 'admin') {
    return NextResponse.next()
  }

  // 3. Scale operators blocked from main app
  if (session.user.role === 'scale_operator') {
    return NextResponse.redirect(new URL('/scale', req.url))
  }

  // 4. Force password change redirect
  if (session.user.forcePasswordChange && pathname !== '/app/change-password') {
    return NextResponse.redirect(new URL('/app/change-password', req.url))
  }

  // 5. Check module access
  const allowedModules = session.user.allowedModules ?? []

  // Empty array = full access (backwards compatibility)
  if (allowedModules.length === 0) {
    return NextResponse.next()
  }

  // Find matching module for current path
  const moduleKey = findModuleKey(pathname) // matches /app/purchases/new → /app/purchases
  if (moduleKey && !allowedModules.includes(moduleKey)) {
    return NextResponse.redirect(new URL('/app/dashboard?denied=1', req.url))
  }

  return NextResponse.next()
}
```

### Module Key Matching Logic

```typescript
function findModuleKey(pathname: string): string | null {
  const MODULE_KEYS = [
    '/app/dashboard',
    '/app/customers',
    '/app/purchases',
    '/app/sales',
    '/app/payments',
    '/app/expenses',
    '/app/cashup',
    '/app/float',
    '/app/stock',
    '/app/stocktake',
    '/app/products',
    '/app/price-groups',
    '/app/reports',
    '/app/loans',
    '/app/police-register',
    '/app/audit-log',
    '/app/settings',
  ]

  // Exact match
  if (MODULE_KEYS.includes(pathname)) return pathname

  // Prefix match (e.g., /app/purchases/new → /app/purchases)
  return MODULE_KEYS.find(key => pathname.startsWith(key + '/')) ?? null
}
```

## Scale Operator Login Blocking

### Main Login Page (`/login`)

After successful credential check, block scale operators:

```typescript
async function onSubmit(data: LoginInput) {
  const result = await signIn('credentials', { ...data, redirect: false })

  if (result?.error) {
    // ... handle error
    return
  }

  const sess = await getSession()

  // Block scale operators from main login
  if (sess?.user?.role === 'scale_operator') {
    await signOut({ redirect: false })
    setError('Scale operators must use the Scale Station login')
    return
  }

  router.push('/app/dashboard')
}
```

## User Management UI Changes

### Users Page (`/app/settings/users`)

1. Add `scale_operator` to role filter dropdown
2. Show permissions indicator (badge or icon) for users with restricted access

### Create User Modal

1. Add `scale_operator` to role dropdown options
2. Add module selection section (checkboxes) — hidden for admin and scale_operator roles
3. "Select All" / "Clear All" buttons for convenience

### Edit User Modal

1. Add module permissions section
2. Checkbox grid for all modules
3. Disabled/greyed out for admin users (always full access)
4. Hidden for scale_operator users (no main app access)

### Module Selection UI

```
┌─────────────────────────────────────────┐
│ Module Access                           │
│ [Select All]  [Clear All]               │
├─────────────────────────────────────────┤
│ ☑ Dashboard        ☑ Customers         │
│ ☑ Purchases        ☐ Sales             │
│ ☑ Payments         ☐ Expenses          │
│ ☐ Cash Up          ☐ Float             │
│ ☑ Stock            ☐ Stocktake         │
│ ☐ Products         ☐ Price Groups      │
│ ☐ Reports          ☐ Loans             │
│ ☐ Police Register  ☐ Audit Log         │
│ ☐ Settings                              │
└─────────────────────────────────────────┘
```

## Migration Strategy

### Prisma Migration

1. Create `UserModuleAccess` table
2. Add relation to `User` model

### Data Migration

Grant full access to all existing non-admin, non-scale_operator users:

```typescript
// In migration or seed script
const modules = [
  '/app/dashboard', '/app/customers', '/app/purchases',
  '/app/sales', '/app/payments', '/app/expenses',
  '/app/cashup', '/app/float', '/app/stock',
  '/app/stocktake', '/app/products', '/app/price-groups',
  '/app/reports', '/app/loans', '/app/police-register',
  '/app/audit-log', '/app/settings',
]

const users = await prisma.user.findMany({
  where: { role: { notIn: ['admin', 'scale_operator'] } }
})

for (const user of users) {
  await prisma.userModuleAccess.createMany({
    data: modules.map(moduleKey => ({
      userId: user.id,
      moduleKey,
    })),
    skipDuplicates: true,
  })
}
```

### Backwards Compatibility

- Empty `allowedModules` array = full access (no restrictions)
- Admins always bypass permission checks
- Environment variable `SKIP_MODULE_PERMISSIONS=true` disables checks entirely (emergency rollback)

## Auth Service Changes

### Login Function

Fetch user's module access records and include in returned user object:

```typescript
// In authService.ts login()
const moduleAccess = await prisma.userModuleAccess.findMany({
  where: { userId: user.id },
  select: { moduleKey: true },
})

return {
  user,
  forcePasswordChange: user.forcePasswordChange,
  allowedModules: moduleAccess.map(m => m.moduleKey),
}
```

### Create User Function

Accept `allowedModules` array and create records:

```typescript
// In authService.ts createUser()
async function createUser(data: CreateUserInput & { allowedModules?: string[] }, createdById: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { ... } })

    if (data.allowedModules?.length) {
      await tx.userModuleAccess.createMany({
        data: data.allowedModules.map(moduleKey => ({
          userId: user.id,
          moduleKey,
          grantedById: createdById,
        })),
      })
    }

    return user
  })
}
```

### Update User Permissions Function

New function to update module access:

```typescript
async function updateUserModuleAccess(
  userId: string,
  moduleKeys: string[],
  grantedById: string
) {
  return prisma.$transaction(async (tx) => {
    // Delete existing
    await tx.userModuleAccess.deleteMany({ where: { userId } })

    // Insert new
    if (moduleKeys.length > 0) {
      await tx.userModuleAccess.createMany({
        data: moduleKeys.map(moduleKey => ({
          userId,
          moduleKey,
          grantedById,
        })),
      })
    }
  })
}
```

## API Changes

### GET `/api/users`

Include `moduleAccess` in response:

```typescript
const users = await prisma.user.findMany({
  include: { moduleAccess: { select: { moduleKey: true } } },
})
```

### POST `/api/users`

Accept `allowedModules` array in request body.

### PUT `/api/users/[id]/permissions`

New endpoint to update user's module permissions:

```typescript
// Request body: { moduleKeys: string[] }
// Response: { success: true }
```

## Files to Modify

1. `prisma/schema.prisma` — add UserModuleAccess model
2. `src/auth.config.ts` — add allowedModules to JWT/session
3. `src/auth.ts` — update type declarations
4. `src/middleware.ts` — add module permission check
5. `src/lib/services/authService.ts` — fetch/manage module access
6. `src/lib/schemas/auth.ts` — update CreateUserSchema
7. `src/app/login/page.tsx` — block scale operators
8. `src/app/api/users/route.ts` — include module access
9. `src/app/api/users/[id]/permissions/route.ts` — new endpoint
10. `src/components/users/CreateUserModal.tsx` — add module selection
11. `src/components/users/EditUserModal.tsx` — add module permissions
12. `src/app/app/(modules)/settings/users/page.tsx` — add scale_operator filter

## Testing Checklist

- [ ] Scale operator cannot log in via `/login`
- [ ] Scale operator can log in via `/scale/login`
- [ ] Admin can access all modules regardless of permissions
- [ ] Manager with restricted permissions cannot access blocked modules
- [ ] Cashier with restricted permissions cannot access blocked modules
- [ ] Existing users retain full access after migration
- [ ] New user with no modules assigned gets full access
- [ ] Module permissions update correctly via edit modal
- [ ] JWT token contains correct allowedModules array
- [ ] Middleware redirects to dashboard when access denied
