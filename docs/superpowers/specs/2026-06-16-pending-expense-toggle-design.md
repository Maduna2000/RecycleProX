# Pending Expense Toggle Design

**Date:** 2026-06-16
**Module:** Expenses (M15)
**Status:** Approved for implementation

## Summary

Add a "Mark as pending expense" checkbox to the Add Expense modal. When unchecked (default), expenses are auto-approved on creation. When checked, expenses remain pending and can be edited before approval.

## Requirements

1. Checkbox on Add Expense modal: "Mark as pending expense"
2. Unchecked (default) = expense auto-approved immediately
3. Checked = expense created as pending, editable later
4. Pending expenses editable by creator + managers/admins
5. All fields editable except ref number
6. No additional amount history tracking (audit log suffices)

## Schema Changes

### Zod Schema (`src/lib/schemas/expense.ts`)

Add to `CreateExpenseSchema`:
```typescript
isPending: z.boolean().default(false)
```

Add new `UpdateExpenseSchema`:
```typescript
export const UpdateExpenseSchema = z.object({
  expenseTypeId: z.string().uuid().optional(),
  description: z.string().min(1).optional(),
  amount: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : parseFloat(String(v))),
    z.number().positive().optional(),
  ),
  includesVat: z.boolean().optional(),
  paymentMethod: z.enum(['cash', 'eft', 'cheque']).optional(),
  chequeNo: z.string().optional().nullable(),
  updatedAt: z.string().datetime(), // For optimistic locking - pass expense.updatedAt from when modal opened
})
```

### Prisma Schema

No changes required. Existing `ExpenseStatus` enum already supports `pending` and `approved`.

## API Changes

### POST `/api/expenses` (Create)

- Accept `isPending` field from request body
- If `isPending === false` (default):
  - Create with `status: 'approved'`
  - Set `approvedById` to current user
  - Set `approvedAt` to current timestamp
- If `isPending === true`:
  - Create with `status: 'pending'`
  - `approvedById` and `approvedAt` remain null
- Remove existing auto-approval logic (cash + CashUp open)

### PATCH `/api/expenses/[id]` (Edit) - NEW

- **Auth:** Required
- **Allowed:** Creator of expense OR Manager/Admin role
- **Precondition:** Expense `status === 'pending'`
- **Body:** `UpdateExpenseSchema` + `updatedAt` (ISO string from expense fetched when modal opened)
- **Logic:**
  1. Fetch expense by ID
  2. Verify status is pending (else 403)
  3. Verify user is creator or has manager/admin role (else 403)
  4. Check `updatedAt` matches for optimistic locking (else 409)
  5. Recalculate VAT if amount or includesVat changed
  6. Update expense in transaction
  7. Return updated expense with relations
- **Errors:**
  - 403: "Expense already approved" or "Expense has been voided"
  - 403: "Not authorized to edit this expense"
  - 409: "Expense was modified by another user"
  - 404: "Expense not found"

## Service Layer Changes

### `src/lib/services/expenseService.ts`

**Modify `createExpense()`:**
- Add `isPending` parameter to function signature
- Remove auto-approval logic (cash + CashUp open check)
- Apply status based on `isPending`:
  ```typescript
  const status = isPending ? 'pending' : 'approved'
  const approvedById = isPending ? null : userId
  const approvedAt = isPending ? null : new Date()
  ```

**Add `updateExpense()` function:**
```typescript
export async function updateExpense(
  expenseId: string,
  userId: string,
  userRole: string,
  data: UpdateExpenseInput,
  expectedUpdatedAt: Date
): Promise<Expense> {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id: expenseId } })

    if (!expense) throw new NotFoundError('Expense not found')
    if (expense.status !== 'pending') {
      throw new ForbiddenError(`Expense ${expense.status === 'approved' ? 'already approved' : 'has been voided'}`)
    }

    const isCreator = expense.createdByUserId === userId
    const isManagerOrAdmin = ['admin', 'manager'].includes(userRole)
    if (!isCreator && !isManagerOrAdmin) {
      throw new ForbiddenError('Not authorized to edit this expense')
    }

    if (expense.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictError('Expense was modified by another user')
    }

    // Recalculate VAT if needed
    let vatAmount = expense.vatAmount
    if (data.amount !== undefined || data.includesVat !== undefined) {
      const amount = new Decimal(data.amount ?? expense.amount)
      const includesVat = data.includesVat ?? expense.includesVat
      const vatRate = await getVatRate(tx)
      vatAmount = includesVat
        ? amount.times(vatRate.div(vatRate.plus(1))).toDecimalPlaces(2)
        : new Decimal(0)
    }

    return tx.expense.update({
      where: { id: expenseId },
      data: { ...data, vatAmount },
      include: { expenseType: true },
    })
  })
}
```

## UI Changes

### Add Expense Modal

Add checkbox below "Amount includes 15% VAT":
- Label: "Mark as pending expense"
- Default: Unchecked
- Helper text: "Pending expenses can be edited before approval"

### Expenses List Page

Add "Edit" action to row dropdown:
- Visible on pending expenses only
- Visible to: expense creator + managers/admins
- Opens modal in edit mode

### Edit Expense Modal

Reuse `AddExpenseModal` component with props:
- `mode: 'create' | 'edit'`
- `expense?: Expense` (for edit mode)

In edit mode:
- Title: "Edit Expense"
- Pre-populate all fields from expense data
- Hide "Mark as pending" checkbox
- Submit button: "Update Expense"
- On submit: PATCH `/api/expenses/[id]`

## Permission Matrix

| Action | Auth Required | Allowed Roles |
|--------|---------------|---------------|
| Create expense | Yes | Any |
| Edit pending expense | Yes | Creator OR Manager/Admin |
| Approve expense | Yes | Manager/Admin |
| Void expense | Yes | Manager/Admin |

## Error Handling

| Scenario | HTTP Status | Message |
|----------|-------------|---------|
| Edit approved expense | 403 | "Expense already approved" |
| Edit voided expense | 403 | "Expense has been voided" |
| Non-authorized edit attempt | 403 | "Not authorized to edit this expense" |
| Concurrent modification | 409 | "Expense was modified by another user" |
| Expense not found | 404 | "Expense not found" |

## Audit Trail

All changes logged via existing Prisma middleware. No additional audit code required.

## Migration Notes

- No database migration required
- Existing pending expenses remain pending
- Existing approved expenses remain approved
- Feature is backwards compatible
