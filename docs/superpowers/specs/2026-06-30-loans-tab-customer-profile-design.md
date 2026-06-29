# Loans Tab in Customer Profile — Design Specification

**Date:** 2026-06-30
**Status:** Approved
**Module:** Customers / Loans

## Overview

Move loan functionality from a standalone module into the customer profile page as a new "Loans" tab. This consolidates loan management within the customer context, since loans are inherently tied to specific account customers.

## Requirements

### Functional Requirements

1. **Loans tab** added to customer profile at main tab level (alongside Transactions, Documents, Blacklist)
2. **Account customers only** — tab is hidden for casual customers
3. **Create loans** via dialog within the tab
4. **View loan history** in a minimal table format
5. **Void loans** via row action (manager/admin only, only if no repayments exist)
6. **No manual repayment** — repayments happen automatically via purchase deductions
7. **Outstanding balance** displayed as header in tab and in sidebar panel
8. **Role-based permissions** for loan creation using existing UserModuleAccess system

### Non-Functional Requirements

- UI consistent with existing customer profile tabs
- Uses existing loan service and API routes
- No changes to loan data model

## Architecture

### New Files

```
src/components/customers/LoansTab.tsx    — Main tab component
```

### Modified Files

```
src/app/app/(modules)/customers/[id]/page.tsx  — Add Loans tab integration
```

### Deleted Files

```
src/app/app/(modules)/loans/page.tsx     — Standalone loans page (remove entire directory)
```

### Navigation Changes

- Remove "Loans" entry from sidebar navigation

### Retained (No Changes)

- `src/lib/services/loanService.ts` — All service functions still needed
- `src/lib/schemas/loan.ts` — Validation schemas still needed
- `src/app/api/loans/*` — All API routes still needed
- `src/app/api/customers/[id]/loans/` — Used by LoansTab

## Component Design

### LoansTab Component

**File:** `src/components/customers/LoansTab.tsx`

**Props:**
```typescript
interface LoansTabProps {
  customerId: string
  customerName: string
  userRole: string
  userAllowedModules: string[]
}
```

**Data fetching:**
- GET `/api/customers/[customerId]/loans` — returns `{ loans, summary, total, page, pageSize, pageCount }`
- Uses SWR for caching and revalidation (matches existing patterns)

**State:**
- `showCreateDialog: boolean`
- `voidingLoan: Loan | null`
- Loading and error states

### Loans Tab Layout

```
┌─────────────────────────────────────────────────────┐
│ [Outstanding Balance: R 1,250.00]      [+ New Loan] │
├─────────────────────────────────────────────────────┤
│ Reference    │ Amount    │ Balance │ Status │ Date  │
├──────────────┼───────────┼─────────┼────────┼───────┤
│ LOA-20250630 │ R 500.00  │ R 0.00  │ Settled│ 30 Jun│
│ LOA-20250615 │ R 750.00  │ R 750.00│ Active │ 15 Jun│
│ LOA-20250601 │ R 500.00  │ R 500.00│ Voided │ 01 Jun│
└─────────────────────────────────────────────────────┘
```

**Header row:**
- Outstanding balance on left (bold)
- "New Loan" button on right (hidden if no create permission)

**Table columns:**
| Column    | Field           | Notes                              |
|-----------|-----------------|------------------------------------|
| Reference | `refNumber`     | LOA-YYYYMMDD-XXXX format          |
| Amount    | `principalAmount` | Currency formatted               |
| Balance   | `balanceAmount` | Currency formatted                 |
| Status    | `status`        | Badge: green=Settled, blue=Active, grey=Voided |
| Date      | `createdAt`     | Formatted as DD MMM               |

**Row actions:**
- Void action in kebab menu (only for Active loans with no repayments, manager/admin only)

**Empty state:**
- "No loans for this customer" with "Create Loan" button

### Create Loan Dialog

**Trigger:** "New Loan" button

**Fields:**
| Field          | Type     | Validation                  | Default |
|----------------|----------|-----------------------------|---------|
| Amount         | number   | Required, positive decimal  | —       |
| Payment Method | select   | Required                    | Cash    |
| Notes          | textarea | Optional, max 500 chars     | —       |

**Payment Method options:** Cash, EFT, Cheque

**Actions:**
- Cancel: closes dialog
- Create Loan: POST to `/api/loans`, refresh list, show success toast

### Void Loan Dialog

**Trigger:** Row action menu on eligible loans

**Eligibility:**
- Loan status is `active`
- Loan has zero repayments
- User has manager/admin role

**Fields:**
| Field  | Type     | Validation                      |
|--------|----------|---------------------------------|
| Reason | textarea | Required, 5-500 characters      |

**Actions:**
- Cancel: closes dialog
- Void Loan: POST to `/api/loans/[id]/void`, refresh list, show toast

**Button styling:** Red/destructive

## Customer Profile Integration

### Tab Array Update

```typescript
// Conditional based on customer type
const TABS = customer.customerType === 'account'
  ? ['Overview', 'Transactions', 'Loans', 'Documents', 'Blacklist'] as const
  : ['Overview', 'Transactions', 'Documents', 'Blacklist'] as const
```

### Tab Content Rendering

```tsx
{tab === 'Loans' && (
  <LoansTab
    customerId={id}
    customerName={customer.name}
    userRole={session.user.role}
    userAllowedModules={session.user.allowedModules ?? []}
  />
)}
```

### Sidebar Panel Update

Add loan balance field to sidebar (only for account customers with outstanding balance > 0):

```
Profile
─────────────────
Type        Account
Function    Seller
Status      Active
Registered  15 Jan 2025
Price Group Standard
Loan Balance   R 1,250.00   ← Only shown when > 0
```

## Permissions

The existing module access system uses route paths (e.g., `/app/loans`) stored in `UserModuleAccess`. Since the `/app/loans` route is being removed, permissions work as follows:

### Module Options Update

Keep `/app/loans` in `MODULE_OPTIONS` array in [EditUserModal.tsx](src/components/users/EditUserModal.tsx) and [CreateUserModal.tsx](src/components/users/CreateUserModal.tsx) as a permission key for loan actions. The route doesn't need to exist for the permission to be valid.

### Create Loan

- Check if user's `allowedModules` includes `/app/loans`
- Admins: always have access (full access to all modules)
- Managers/Cashiers: check `allowedModules` array
- Scale Operators: no access (restricted to scale station)
- If no access: hide "New Loan" button

### Void Loan

- Requires manager or admin role (existing API check in `/api/loans/[id]/void`)
- UI hides void action for non-manager/admin users

### View Loans Tab

- Visible to all authenticated users viewing an account customer
- The tab itself has no permission gate (anyone can view loan history)
- Only the "New Loan" action is permission-gated

### Implementation

Pass user session to `LoansTab` component:
```typescript
interface LoansTabProps {
  customerId: string
  customerName: string
  userRole: string
  userAllowedModules: string[]
}
```

Check permission in component:
```typescript
const canCreateLoan =
  userRole === 'admin' ||
  userAllowedModules.length === 0 ||  // Empty = full access
  userAllowedModules.includes('/app/loans')
```

## API Routes (Existing, No Changes)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/loans` | POST | Create loan |
| `/api/loans/[id]` | GET | Get single loan |
| `/api/loans/[id]/void` | POST | Void loan |
| `/api/customers/[id]/loans` | GET | List customer loans + summary |

## Cleanup Tasks

1. Delete `src/app/app/(modules)/loans/` directory
2. Remove "Loans" from sidebar navigation config
3. Remove any imports/references to deleted pages

**Note:** Keep `/app/loans` in `MODULE_OPTIONS` in user modals — it remains a valid permission key for loan actions even though the route no longer exists.

## Styling Guidelines

- Use existing style objects from customer page (`lbl`, `inp`, `sectionHdr`)
- Table styling matches Transactions tab
- Dialog styling matches existing dialogs in codebase
- Status badges: use existing badge component with color variants
- Button styles: green primary, red destructive for void
- Currency formatting: use existing formatters with "R" prefix

## Error Handling

- Network errors: show toast with error message
- Validation errors: inline field errors in dialogs
- Permission denied: gracefully hide actions (don't show then fail)

## Testing Considerations

- Tab visibility: account vs casual customers
- Create loan: validation, success, error states
- Void loan: permission checks, eligibility rules
- Sidebar balance: visibility rules, formatting
- Empty state rendering
