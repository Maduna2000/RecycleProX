# RecycleProX — Master UI + Build Rules
# Read this file before starting ANY module build.
# This file works alongside CLAUDE.md. Both must be followed.

---

## The One Rule That Prevents Empty Screens

**Build vertically, not horizontally.**

This means: pick the smallest meaningful slice of a module and take it
all the way from schema → service → API route → fetch hook → UI rendering
BEFORE moving to the next slice.

Do NOT:
- Build all UI components first, then write API routes, then wire them
- Build the entire service layer then go back to add routes
- Leave fetch calls as `// TODO: wire this up`

DO:
- Schema change (if needed) → migrate
- Service function → unit test passes
- API route → returns real data when curled
- Fetch hook → actually calls that route
- UI component → renders that real data
- VERIFY IN BROWSER: data appears on screen
- THEN move to next slice

If the page loads but shows empty data, the module is NOT done.
A module is only done when every piece of data it should show is
visibly rendering from the real database.

---

## Application Layout (No Sidebar — Ever)

Every page in the app uses this exact three-zone layout.
This is defined in `src/components/layout/AppShell.tsx`.

```
┌─────────────────────────────────────────────────────┐
│ ZONE 1 — TOP NAV BAR (48px, fixed, never scrolls)   │
│ Logo | [Tab1] [Tab2] [Tab3]... | 🔔 👤              │
├─────────────────────────────────────────────────────┤
│ ZONE 2 — CONTEXTUAL TOOLBAR (36px, fixed)           │
│ [Action Btn] [Action Btn] | search input            │
├─────────────────────────────────────────────────────┤
│ ZONE 3 — CONTENT AREA (fills rest, scrolls inside)  │
│                                                     │
│  [page content here]                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**NEVER add a sidebar.** If you find yourself writing a sidebar,
stop and re-read this file.

Zone 1 and Zone 2 are fixed — they never scroll.
Zone 3 scrolls internally with `overflow-y: auto`.
Zone 3 padding: `p-6` (24px all sides).

---

## Design Tokens — Use These Exact Values

These are defined in `src/lib/design-tokens.ts` and as Tailwind
config extensions. Always use the token names, never raw hex.

### Colours

```ts
// Brand
primary:    '#1B3A6B'   // Navy — top nav background, active tab
action:     '#217346'   // Green — primary action buttons (confirm, save)
process:    '#185ABD'   // Blue — secondary buttons, links, info
warning:    '#C9A020'   // Amber — pending states, warnings
danger:     '#C0392B'   // Red — void, delete, errors, blacklisted

// Surfaces
surface:    '#FFFFFF'   // White — all cards and tables
bg:         '#F1F3F4'   // Light grey — page background
toolbar:    '#F8F9FA'   // Slightly off-white — toolbar zone

// Text
textPrimary:   '#212529'
textSecondary: '#6C757D'
textMuted:     '#9CA3AF'

// Borders
border:     '#E0E0E0'
borderFocus:'#185ABD'
```

### Typography

```
Font family: Segoe UI → -apple-system → Arial (set in globals.css)

Sizes:
  xs:   11px  — status bar, timestamps, badges
  sm:   12px  — table column headers, form labels
  base: 13px  — table row data, button text, body copy
  md:   14px  — section titles, modal headers
  lg:   16px  — page titles
  xl:   20px  — stat card labels
  2xl:  24px  — stat card values

Weights: 400 regular, 500 medium, 600 semibold, 700 bold
```

### Spacing

```
All spacing uses Tailwind's scale.
Common values:
  Component padding:    p-4   (16px)
  Section gap:          gap-6 (24px)
  Row height (tables):  h-10  (40px)
  Card border radius:   rounded-lg (8px)
  Button border radius: rounded-md (6px)
```

---

## Component Contracts

Every component listed here has its own spec file in
`.claude/skills/components/`. Read the relevant spec before
building any instance of that component.

| Component      | Spec file                              | Used for                        |
|---------------|----------------------------------------|---------------------------------|
| DataTable      | `.claude/skills/components/DATA_TABLE.md`   | Every data list in the app |
| FormPanel      | `.claude/skills/components/FORM_PANEL.md`   | Every create/edit form     |
| PageShell      | `.claude/skills/components/PAGE_SHELL.md`   | Every page's wrapper       |
| StatCard       | `.claude/skills/components/STAT_CARD.md`    | Dashboard KPI cards        |

**Rule:** Before writing any table, form, or page wrapper, read the
relevant spec file. Do not improvise component structure.

---

## API Route Contract

Every API route must follow this exact pattern:

```ts
// src/app/api/[resource]/route.ts

import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export async function GET(req: NextRequest) {
  // 1. Auth check — ALWAYS FIRST
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // 2. Role check (if route requires elevated role)
  if (session.user.role !== 'manager' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Input parsing + validation
  const { searchParams } = new URL(req.url)
  // parse and validate with Zod here

  // 4. Business logic via service (never inline DB calls in routes)
  try {
    const result = await someService.doThing(params)
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'Route handler failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

Rules:
- Auth check is line 1 inside every handler. No exceptions.
- Never call Prisma directly in a route — always go through a service.
- Always return typed responses (use Zod to define response shape).
- Errors are logged with pino, never console.log.

---

## Fetch Hook Contract

Every page that shows data must have a custom fetch hook.
This is what connects UI to API and prevents the empty-screen problem.

```ts
// src/hooks/use[Resource].ts

import { useQuery } from '@tanstack/react-query'

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const params = new URLSearchParams(/* filters */)
      const res = await fetch(`/api/customers?${params}`)
      if (!res.ok) throw new Error('Failed to fetch customers')
      return res.json() as Promise<CustomerListResponse>
    },
    staleTime: 30_000,
  })
}
```

Rules:
- Every page that shows a list has a `use[Resource]` hook.
- The hook is imported and called in the page component.
- Loading state: show skeleton rows in the table.
- Error state: show inline error banner inside the content area.
- Empty state: show empty state component (icon + message + CTA button).
- Data state: render the DataTable with real data.

**A page component that does not call its fetch hook is incomplete.**

---

## Module Definition of Done

A module is COMPLETE when ALL of the following are true.
Check each one before committing.

### Data
- [ ] Every list on the page shows real records from the database
- [ ] Empty state shows when there are no records (not blank screen)
- [ ] Loading state shows skeleton while fetching
- [ ] Error state shows if the API call fails

### Actions
- [ ] Every "create" button opens a form that submits and refreshes the list
- [ ] Every "edit" action pre-fills the form with existing data
- [ ] Every "delete/void" action asks for confirmation and then removes/voids
- [ ] All action buttons that require a role are hidden from lower roles

### Forms
- [ ] All required fields validated client-side before submit
- [ ] Server validation errors shown inline under the relevant field
- [ ] Form clears/closes after successful submit
- [ ] Submit button shows loading state while request is in-flight

### API
- [ ] All routes return correct HTTP status codes
- [ ] All routes require auth (401 if no session)
- [ ] Role-gated routes return 403 for insufficient role
- [ ] All routes log errors with pino

### Integration
- [ ] Changes in this module are reflected in other modules that depend on it
  (e.g. completing a purchase increases stock on-hand)
- [ ] Audit log has an entry for every create/update/delete action

### UI consistency
- [ ] Uses DataTable component (not a custom table)
- [ ] Uses FormPanel component (not a custom modal)
- [ ] Uses PageShell wrapper (not a custom layout)
- [ ] Matches design tokens exactly (no hardcoded hex colours)
- [ ] No sidebar anywhere on any page

---

## Cross-Module Wiring Map

When you build a module, check this map to know what else must update.

```
Purchases completed
  → Stock: stockService.recordMovement(direction:'in') per line
  → CashUp: feeds systemCashPurchases aggregate
  → PhotoViewer: MediaFile rows created for photos/signatures

Sales completed  
  → Stock: stockService.recordMovement(direction:'out') per line
  → CashUp: feeds systemCashSales aggregate

Payment recorded
  → Customer: balance recalculated
  → CashUp: feeds systemCashPayments aggregate

Expense approved
  → CashUp: feeds expensesTotal via getExpenseTotalsForDate()

Float set
  → CashUp: feeds openingBalance on session open

Loan advance given
  → CashUp: feeds loanAdvancesGiven
  → Purchase form: shows popup if customer has outstanding loan

Loan repayment received
  → CashUp: feeds loanRepaymentsReceived
```

If you are building any of the trigger modules above, verify the
→ effect actually happens by checking the target module's data.
