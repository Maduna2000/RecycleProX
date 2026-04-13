# Component Spec: DataTable
# Every list/grid of records in the app uses this component.
# File: src/components/ui/DataTable.tsx

---

## Purpose

One table component, used everywhere. This enforces visual consistency
across all 14 modules. Never write a custom table — always use this.

---

## Props Interface

```ts
interface DataTableProps<T> {
  // Data
  columns:     ColumnDef<T>[]      // column definitions (see below)
  data:        T[]                 // the rows to render
  isLoading?:  boolean             // show skeleton rows
  error?:      string | null       // show error banner
  
  // Interaction
  onRowClick?: (row: T) => void    // opens inline detail panel
  
  // Selection (optional — for bulk actions)
  selectable?:    boolean
  selectedIds?:   string[]
  onSelectChange?: (ids: string[]) => void
  
  // Filtering (renders above the table)
  searchPlaceholder?: string
  searchValue?:       string
  onSearchChange?:    (val: string) => void
  filters?:           FilterConfig[]  // see below
  
  // Pagination
  totalCount:     number
  page:           number
  pageSize?:      number           // default 50
  onPageChange:   (page: number) => void
  
  // Empty state
  emptyMessage?:  string           // default "No records found"
  emptyAction?:   { label: string; onClick: () => void }
}
```

---

## Column Definition

```ts
interface ColumnDef<T> {
  key:       string                          // maps to T property
  header:    string                          // column header label
  width?:    string                          // e.g. 'w-32', 'w-48'
  render?:   (value: any, row: T) => ReactNode  // custom cell render
  sortable?: boolean
  align?:    'left' | 'center' | 'right'    // default 'left'
}
```

Common column patterns:

```ts
// Avatar + name column
{
  key: 'name',
  header: 'Customer',
  render: (_, row) => (
    <div className="flex items-center gap-2">
      <Avatar name={row.name} size="sm" />
      <div>
        <p className="text-sm font-medium text-textPrimary">{row.name}</p>
        <p className="text-xs text-textMuted">{row.idNumber}</p>
      </div>
    </div>
  )
}

// Status badge column
{
  key: 'status',
  header: 'Status',
  width: 'w-28',
  render: (value) => <StatusBadge status={value} />
}

// Money column (right-aligned)
{
  key: 'amount',
  header: 'Amount',
  align: 'right',
  render: (value) => <span className="font-mono">R {value.toFixed(2)}</span>
}

// Actions column (always last)
{
  key: 'actions',
  header: '',
  width: 'w-12',
  render: (_, row) => <RowActionsMenu row={row} actions={[...]} />
}
```

---

## Visual Spec

```
Table wrapper:
  background: white
  border: 1px solid #E0E0E0
  border-radius: 8px
  overflow: hidden

Column header row:
  background: #F8F9FA
  height: 36px
  font-size: 12px
  font-weight: 600
  text-transform: uppercase
  letter-spacing: 0.05em
  color: #6C757D
  border-bottom: 1px solid #E0E0E0

Data rows:
  height: 40px (h-10)
  font-size: 13px
  color: #212529
  border-bottom: 1px solid #F1F3F4

Row colours:
  odd rows:   background white
  even rows:  background #F8F9FA
  hover:      background #EBF3FC, transition 100ms
  selected:   border-left 3px solid #185ABD, background #EBF3FC

Cells:
  padding: 0 12px (px-3)
  vertical-align: middle
```

---

## States

### Loading state
Show 5 skeleton rows. Each skeleton row has the same height as a
data row (40px) with a pulsing grey rectangle per cell.

```tsx
// Skeleton row
<tr className="animate-pulse">
  {columns.map(col => (
    <td key={col.key} className="px-3 py-2">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
    </td>
  ))}
</tr>
```

### Error state
Show above the table, not replacing it:

```tsx
<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md 
                flex items-center gap-2 text-sm text-red-700">
  <AlertCircle className="h-4 w-4 flex-shrink-0" />
  {error}
</div>
```

### Empty state
Show inside the table body, spanning all columns:

```tsx
<tr>
  <td colSpan={columns.length} className="py-12 text-center">
    <div className="flex flex-col items-center gap-3 text-textMuted">
      <FileX className="h-8 w-8" />
      <p className="text-sm">{emptyMessage}</p>
      {emptyAction && (
        <Button variant="outline" size="sm" onClick={emptyAction.onClick}>
          {emptyAction.label}
        </Button>
      )}
    </div>
  </td>
</tr>
```

---

## Pagination

```tsx
// Bottom bar below the table
<div className="flex items-center justify-between px-4 py-3 
                border-t border-gray-200 text-sm text-textSecondary">
  <span>Showing {start}–{end} of {totalCount}</span>
  <div className="flex items-center gap-1">
    <Button variant="ghost" size="sm" disabled={page === 1}
            onClick={() => onPageChange(page - 1)}>
      <ChevronLeft className="h-4 w-4" />
    </Button>
    {/* page number pills */}
    <Button variant="ghost" size="sm" disabled={page === lastPage}
            onClick={() => onPageChange(page + 1)}>
      <ChevronRight className="h-4 w-4" />
    </Button>
  </div>
</div>
```

---

## Row Actions Menu

```tsx
// RowActionsMenu component — use for the actions column
// Shows a ⋯ button that opens a dropdown

interface RowAction {
  label:    string
  icon?:    LucideIcon
  onClick:  () => void
  variant?: 'default' | 'danger'   // danger = red text
  role?:    UserRole                // hide if user lacks this role
}
```

Standard actions per module type:

```
Customer row:    View | Edit | Blacklist (manager) | Generate Police Register (manager)
Purchase row:    View | Print Slip | Download VAT264 | Void (manager)
Sale row:        View | Print Slip | Void (manager)
Expense row:     View | Approve (manager) | Void (manager)
Loan row:        View | Add Repayment | Print Statement
Stock row:       View Movements | Adjust (manager)
```

---

## Filter Config

```ts
interface FilterConfig {
  key:       string
  label:     string
  type:      'select' | 'date-range' | 'toggle'
  options?:  { value: string; label: string }[]  // for select
}
```

Filters render as a horizontal row above the table:
- Select filters: shadcn Select component
- Date range: two date inputs (From / To)
- Toggle: shadcn Switch with label

Active filters shown as pills below the filter bar.
"Clear all" link on the right when any filter is active.

---

## InlineDetailPanel

When `onRowClick` is provided and a row is clicked, an
InlineDetailPanel slides up from the bottom of the table.

File: `src/components/ui/InlineDetailPanel.tsx`

```
Behaviour:
  - Slides up: translateY(100%) → translateY(0), 200ms ease-out
  - Height: 240px (fixed)
  - Background: white
  - Border-top: 2px solid #185ABD
  - Close: × button top-right OR pressing Escape OR clicking the same row
  - Contents: defined per module (passed as children)

Layout inside panel:
  Left 40%:   record summary (name, ID, key fields)
  Centre 35%: relevant data (product lines, payment history etc)
  Right 25%:  action buttons stacked vertically
```

---

## Checklist Before Committing DataTable Usage

- [ ] `isLoading` prop connected to fetch hook's `isLoading`
- [ ] `error` prop connected to fetch hook's `error`
- [ ] `data` prop connected to fetch hook's `data` (not hardcoded)
- [ ] `totalCount` prop connected to API response count
- [ ] `onPageChange` updates a state variable passed to the fetch hook
- [ ] Empty state has a meaningful message and a CTA action button
- [ ] `onRowClick` is wired to open InlineDetailPanel (if module needs it)
- [ ] All money values use `Decimal.toFixed(2)` — never `toFixed()` on a JS number
- [ ] Actions column uses `RowActionsMenu` — no custom dropdown
