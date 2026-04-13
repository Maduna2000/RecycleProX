# MODULE SKILL FILE TEMPLATE
# Copy this file when creating a new module skill.
# Replace every [PLACEHOLDER] with module-specific content.
# Delete this header section before using.

---
name: recycleprox-[module-name]
description: Spec for building the [Module Name] module in RecycleProX Basic.
  Read this when asked to build, fix, or validate [Module Name].
---

# Module: [Module Name]

## What This Module IS

[2-3 sentences describing what this module does in plain English,
from the perspective of a cashier at a recycling yard.
What problem does it solve? What does the user DO here every day?]

## Source of Truth

This spec is based on:
- RecycleProX Basic brochure (BASIC-BRO.pdf), Page [X], Section [Y]
- Screenshot evidence showing [what the screenshot shows]

---

## Workflow (How It Works Step by Step)

[Number every step. Be specific. This is what Claude follows to build the UX.]

1. User arrives at this module from the Portal tile or tab bar
2. They see [describe the initial view]
3. To [do main action], they [describe the steps]
4. After [action] completes, [describe what happens — what updates, what shows]
5. [Continue until the full workflow is covered]

---

## UI Components Required

List every component this module needs. For each one, say:
- What component it is (DataTable / FormPanel / PageShell / custom)
- What data it shows
- What actions it has

### 1. [ComponentName] — [type: DataTable / FormPanel / etc]

**Shows:**
- [field 1] — [description]
- [field 2] — [description]

**Columns (if DataTable):**
| Column | Source field | Notes |
|--------|-------------|-------|
| [Col]  | [field]     | [note]|

**Actions:**
- [Action 1]: [what it does]
- [Action 2]: [what it does, what role it requires]

---

## API Routes Required

| Method | Path | Auth | Body/Params | Returns |
|--------|------|------|-------------|---------|
| GET    | /api/[resource] | any | ?page=&search= | { data: [], total: number } |
| POST   | /api/[resource] | any | [Schema] | { id, ...fields } |
| PUT    | /api/[resource]/[id] | manager+ | [Schema] | { id, ...fields } |
| DELETE | /api/[resource]/[id] | manager+ | — | { success: true } |

---

## Service Functions Required

File: `src/lib/services/[resource]Service.ts`

```ts
// List every function the service must export
list(opts: ListOptions): Promise<{ data: Resource[], total: number }>
getById(id: string): Promise<Resource>
create(data: CreateInput, userId: string): Promise<Resource>
update(id: string, data: UpdateInput, userId: string): Promise<Resource>
delete(id: string, userId: string): Promise<void>
```

---

## Database Schema

```prisma
model [Resource] {
  id          String   @id @default(uuid())
  // ... all fields
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

---

## Fetch Hooks Required

File: `src/hooks/use[Resource].ts`

```ts
// List every hook this module needs
useResourceList(filters) — for the DataTable
useResourceById(id) — for the detail panel
```

---

## Cross-Module Effects

When [action] happens in this module:
- → [other module] must [update/refresh/recalculate]
- → [other module] must [update/refresh/recalculate]

Verify these effects by checking the other module after the action.

---

## Build Order (Vertical Slices)

Build in this exact order. Do NOT move to next slice until current
slice shows real data in the browser.

**Slice 1 — [Name of first slice]:**
1. Schema change if needed → `npx prisma migrate dev`
2. Service function: `[functionName]()`
3. API route: `GET /api/[resource]`
4. Fetch hook: `use[Resource]()`
5. DataTable renders with real data ← VERIFY BEFORE CONTINUING

**Slice 2 — [Name of second slice]:**
1. Zod schema in `src/lib/schemas/[resource].ts`
2. Service function: `create()`
3. API route: `POST /api/[resource]`
4. FormPanel with all fields
5. Submit → list refreshes with new record ← VERIFY BEFORE CONTINUING

**Slice 3 — [Name of third slice, e.g. edit/delete]:**
[same pattern]

---

## Validation Checklist

Run through every item. The module is NOT done until all pass.

### Data loads correctly
- [ ] Table shows real records from the database (not empty, not mocked)
- [ ] Pagination works — changing page fetches the next set of records
- [ ] Search filters the list (if search is in spec)
- [ ] Loading skeleton shows while data is fetching
- [ ] Empty state shows with meaningful message when no records exist
- [ ] Error state shows if the API call fails (test by stopping the server)

### Create works
- [ ] "New [Resource]" button opens the drawer
- [ ] All required fields have red * in their label
- [ ] Submitting empty required fields shows validation errors
- [ ] Successful submit closes the drawer
- [ ] Successful submit adds the new record to the top of the list
- [ ] New record is in the database (verify with Prisma Studio)
- [ ] Audit log has an INSERT entry for the new record

### Edit works (if applicable)
- [ ] Clicking edit opens the drawer with existing values pre-filled
- [ ] Saving changes updates the record in the list immediately
- [ ] Updated record is in the database (verify with Prisma Studio)
- [ ] Audit log has an UPDATE entry

### Delete / Void works (if applicable)
- [ ] Delete/void shows confirmation before proceeding
- [ ] After confirm: record removed from list or status changes
- [ ] Change reflected in database
- [ ] Audit log has a DELETE/UPDATE entry

### API security
- [ ] GET /api/[resource] without session → 401
- [ ] POST /api/[resource] without session → 401
- [ ] Manager-only route accessed as cashier → 403
- [ ] Test these with curl or a REST client

### UI consistency
- [ ] Uses PageShell wrapper (no custom layout)
- [ ] Uses DataTable component (no custom table)
- [ ] Uses FormPanel / drawer (no custom modal)
- [ ] Design tokens only — no hardcoded hex colours
- [ ] No sidebar anywhere on the page
- [ ] Toolbar action buttons are in PageShell `actions` prop

### Cross-module wiring
- [ ] [Specific cross-module effect 1] — verified working
- [ ] [Specific cross-module effect 2] — verified working
