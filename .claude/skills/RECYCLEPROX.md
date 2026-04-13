# RecycleProX Basic — Complete System Skill
# Place this file at: .claude/skills/RECYCLEPROX.md
# Read this file before building ANY module in this project.
# This works alongside CLAUDE.md — both must be followed.

---

## THE ONE RULE THAT PREVENTS EMPTY SCREENS

Build vertically, not horizontally.

Pick the smallest meaningful slice and take it ALL THE WAY:
schema → service → API route → fetch hook → UI renders real data
BEFORE moving to the next slice.

NEVER:
- Build all UI first, then add API routes, then wire them
- Leave fetch calls as "// TODO: wire this up"
- Declare a module done when it shows empty lists

A module is only DONE when every piece of data it should show
is visibly rendering from the real database.

---

## APPLICATION LAYOUT — NO SIDEBAR EVER

Three zones. No exceptions.

```
┌──────────────────────────────────────────────────┐
│ ZONE 1 — TOP NAV (48px, fixed, never scrolls)    │
│ Logo  [Tab][Tab][Tab]...        🔔  👤            │
├──────────────────────────────────────────────────┤
│ ZONE 2 — TOOLBAR (36px, fixed)                   │
│ [+ New]  [Action]  [Action]  |  🔍 search...     │
├──────────────────────────────────────────────────┤
│ ZONE 3 — CONTENT (fills rest, scrolls inside)    │
│  p-6 padding                                     │
└──────────────────────────────────────────────────┘
```

NEVER add a sidebar. If you find yourself writing one, stop.

---

## DESIGN TOKENS

```
Colours:
  primary:   #1B3A6B   navy — top nav, active states
  action:    #217346   green — confirm, save, complete
  process:   #185ABD   blue — secondary buttons, links
  warning:   #C9A020   amber — pending, warnings
  danger:    #C0392B   red — void, delete, errors
  surface:   #FFFFFF   white — cards, tables
  bg:        #F1F3F4   light grey — page background
  toolbar:   #F8F9FA   off-white — toolbar strip
  textPrimary:   #212529
  textSecondary: #6C757D
  border:    #E0E0E0

Typography:
  Font: Segoe UI → -apple-system → Arial
  Table headers:  12px, 600 weight, uppercase, #6C757D
  Table rows:     13px, 400 weight, #212529
  Row height:     40px (h-10)
  Stat values:    24px, 700 weight
  Page titles:    16px, 600 weight
```

---

## API ROUTE CONTRACT — EVERY ROUTE FOLLOWS THIS

```ts
export async function GET(req: NextRequest) {
  // 1. Auth ALWAYS first
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  // 2. Role check if needed
  if (session.user.role !== 'manager' && session.user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // 3. Validate input with Zod
  // 4. Call service (never Prisma directly in routes)
  try {
    const result = await service.doThing(params)
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, 'Route failed')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

---

## FETCH HOOK CONTRACT — EVERY PAGE THAT SHOWS DATA

```ts
// src/hooks/use[Resource].ts
export function useCustomers(filters: Filters) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const res = await fetch(`/api/customers?${new URLSearchParams(filters)}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() as Promise<CustomerListResponse>
    },
    staleTime: 30_000,
  })
}
```

After every successful form submit:
`queryClient.invalidateQueries({ queryKey: ['resource'] })`
THIS IS MANDATORY. Missing this = list never refreshes.

---

## DATA TABLE SPEC — EVERY TABLE IN THE APP

File: `src/components/ui/DataTable.tsx`

Visual:
- Column headers: 36px, #F8F9FA bg, 12px uppercase 600 weight #6C757D
- Rows: 40px, alternating white / #F8F9FA, hover #EBF3FC
- Selected row: 3px left border #185ABD + #EBF3FC bg
- Border: 1px #E0E0E0, rounded-lg, overflow hidden

States (ALL REQUIRED):
- Loading: 5 skeleton rows with animate-pulse grey bars
- Error: red banner above table with error message
- Empty: centred icon + message + CTA button inside table body

Pagination: "Showing X-Y of Z" left + prev/next arrows right

Actions column: always last, uses ⋯ dropdown (RowActionsMenu)

Money values: always `R {value.toFixed(2)}` font-mono right-aligned

Checklist before committing:
- [ ] isLoading connected to fetch hook
- [ ] error connected to fetch hook
- [ ] data connected to fetch hook (not mocked)
- [ ] totalCount connected to API response
- [ ] onPageChange updates state passed to fetch hook
- [ ] Empty state has message + CTA button
- [ ] Money uses Decimal.toFixed(2) not JS .toFixed()

---

## FORM PANEL SPEC — EVERY FORM IN THE APP

File: `src/components/ui/FormPanel.tsx`
Variant: Drawer sliding from RIGHT, 480px wide, full height

Structure:
- Header 56px: title + × close button
- Body: scrollable, form fields
- Footer 64px sticky: Cancel + Submit (green bg-action)

Submit button states:
- Default: green, label text
- Submitting: grey disabled + spinner + "Saving..."
- After success: close drawer + reset form + invalidateQueries

All forms use React Hook Form + Zod resolver.
Zod schema lives in src/lib/schemas/ — never inline.
Server errors shown via form.setError('root', { message }).

FormField wrapper for every input:
- Label with red * if required
- Input component
- Error message in red below field

---

## PAGE SHELL SPEC — EVERY PAGE'S WRAPPER

File: `src/components/layout/PageShell.tsx`

Props: title, subtitle, actions[], searchConfig, children

Actions render as toolbar buttons in Zone 2.
Role-gated buttons: hidden entirely (not dimmed) for wrong role.
Children render in Zone 3 with p-6 padding.

Button variants:
- primary: bg-action green — "New Purchase", "Confirm"
- secondary: white + border — "Export", "Filter"
- danger: white + danger border/text — "Void", "Blacklist"

---

## MODULE DEFINITION OF DONE

Before committing any module, ALL of these must pass:

Data:
- [ ] Table shows real records from database (not empty, not mocked)
- [ ] Pagination works and fetches correct pages
- [ ] Search/filter works (if in spec)
- [ ] Loading skeleton visible during fetch
- [ ] Empty state shown when no records exist
- [ ] Error state shown when API fails

Create:
- [ ] New button opens form drawer
- [ ] Required fields show red * validation errors on empty submit
- [ ] Success: drawer closes, list refreshes with new record
- [ ] New record visible in database (check Prisma Studio)
- [ ] Audit log has INSERT entry

Edit:
- [ ] Edit opens drawer with existing values pre-filled
- [ ] Save updates record in list immediately
- [ ] Audit log has UPDATE entry

Delete/Void:
- [ ] Confirmation shown before action
- [ ] After confirm: record removed or status changed
- [ ] Audit log has DELETE/UPDATE entry

API:
- [ ] All routes return correct HTTP status codes
- [ ] No session → 401 on every route
- [ ] Wrong role → 403 on protected routes

UI:
- [ ] Uses PageShell, DataTable, FormPanel components
- [ ] Design tokens only — no hardcoded hex colours
- [ ] No sidebar anywhere
- [ ] npx tsc --noEmit — zero errors

---

## CROSS-MODULE WIRING MAP

When building any module, check what else must update.

```
Purchase completed
  → Stock: recordMovement(direction:'in') per line — IN SAME TRANSACTION
  → CashUp: feeds systemCashPurchases aggregate
  → PhotoViewer: MediaFile rows created for photos/signatures
  → Loans: check if customer has outstanding loan → show popup BEFORE confirming

Purchase voided
  → Stock: recordVoidReversal — reverse the stock movement

Sale completed
  → Stock: recordMovement(direction:'out') per line — IN SAME TRANSACTION
  → CashUp: feeds systemCashSales aggregate

Payment recorded
  → Customer: balance recalculated (sum purchases - sum payments)
  → CashUp: feeds systemCashPayments aggregate

Expense approved
  → CashUp: feeds expensesTotal via getExpenseTotalsForDate()

Float set
  → CashUp: feeds openingBalance when session opens

Loan advance given
  → CashUp: feeds loanAdvancesGiven
  → Purchase form: popup warning if customer has outstanding loan

Loan repayment received
  → CashUp: feeds loanRepaymentsReceived
  → Loan record: recalculate outstanding balance
```

After building a module that has → effects, VERIFY the effect
works by checking the target module's data.

---

# MODULE 1 — PORTAL

## What It Is
The first screen after login. A shortcut tile launcher — a grid of
clickable tiles, one per module. NOT a dashboard with charts/KPIs.
Also shows live scale readings top-right.

## Workflow
1. Login → Portal opens (navy bg, tile grid)
2. Top-right: live scale weight readings (poll every 1s)
3. Bottom: status bar with version, user, date, live time
4. Click tile → module opens + tab added to tab bar
5. Multiple modules can be open simultaneously as tabs
6. Portal tab always present, cannot be closed
7. Users can customise which tiles show via cog button

## Components Required

### PortalGrid
File: src/components/portal/PortalGrid.tsx
- Full viewport, navy #1B3A6B background
- CSS grid auto-fill, min tile 160px, max content 900px, gap 16px
- All 16 tiles rendered, role-gated tiles at opacity 0.35 (not hidden)

### ModuleTile
File: src/components/portal/ModuleTile.tsx
- Size: 160×140px
- Bg: rgba(255,255,255,0.08), border rgba(255,255,255,0.15), radius 12px
- Hover (accessible): scale(1.04), brighter bg, 150ms transition
- Icon: 40px white centred, Label: 13px white 500 weight
- Active (tab open): 3px amber bottom border #F2AB1A
- Inaccessible: opacity 0.35, no hover, click shows toast

Tiles and roles:
```
cashier:  Accounts, Purchases, Sales, Casual Details, Stock Level Grid, Photo Viewer
manager:  + Payments, Cash-Up, Expenses, Float, Unpaid Purchases, Police Register, Loans, Reports
admin:    + Pricing, Settings
```

Icons:
```ts
Accounts=Users, Purchases=ShoppingCart, Sales=TrendingUp,
Payments=DollarSign, CashUp=Calculator, Expenses=Receipt,
Float=Wallet, CasualDetails=UserCheck, UnpaidPurchases=Clock,
StockLevelGrid=BarChart2, PhotoViewer=Camera, PoliceRegister=Shield,
Loans=Landmark, Pricing=Tag, Reports=FileText, Settings=Settings
```

### ScaleReadingPanel
File: src/components/portal/ScaleReadingPanel.tsx
- Position: top-right, absolute
- Polls GET /api/scales/{n}/read every 1000ms
- Per configured scale: "Scale 1: ● 23.450 kg"
- Connected=green dot, Error=red dot + '---', Unconfigured=hide row
- Background: rgba(0,0,0,0.35), monospace font, border rgba(255,255,255,0.15)

### ModuleTabBar
File: src/components/portal/ModuleTabBar.tsx
State: src/stores/tabStore.ts (Zustand)
```ts
interface TabStore {
  tabs: { id: string, label: string, href: string }[]
  activeTabId: string
  openTab(tab): void    // add if new, activate if exists
  closeTab(id): void    // remove, activate Portal
  setActiveTab(id): void
}
```
- Height 32px, bg #0F2040
- Portal tab: always first, no × button
- Active: white bg, navy text bold
- Inactive: transparent, rgba(255,255,255,0.5)
- Opening tile: openTab() + router.push(href)
- No duplicate tabs

### PortalStatusBar
File: src/components/portal/PortalStatusBar.tsx
- Fixed bottom, full width, height 24px, bg #0A1628
- Content: "RecycleProX Basic v{version}  |  {user} ({role})  |  {date}  {time HH:MM:SS}  CAPS  NUM"
- Clock updates every second
- CAPS/NUM: bright white when active, dim when not

## API Routes
- GET /api/scales/[n]/read → { weight: '23.450', unit: 'kg' } or 503
- PATCH /api/users/[id]/portal-preferences → { visibleModules: string[] }

## Schema Addition
```prisma
// Add to User:
portalModules String[] @default([])
```

## Build Order
1. Static PortalGrid + ModuleTile → verify tiles show on navy bg
2. ModuleTabBar + tabStore → verify tabs open/close correctly
3. ScaleReadingPanel + API route → verify live readings appear
4. PortalStatusBar → verify live clock at bottom
5. CustomisePortal + PATCH route → verify preferences persist

## Validation Checklist
- [ ] Navy background, no sidebar, no KPI cards
- [ ] All 16 tiles present, inaccessible at opacity 0.35
- [ ] Tile hover: scale(1.04) + brighter bg
- [ ] Accessible tile click: navigates + adds tab
- [ ] Inaccessible tile click: toast message
- [ ] Portal tab always present, cannot close
- [ ] Opening same module twice: no duplicate tab
- [ ] Tab × closes module, returns to Portal
- [ ] ScaleReadingPanel top-right, polls every 1s
- [ ] Unconfigured scale: row hidden entirely
- [ ] Disconnected scale: red dot + '---'
- [ ] Status bar at bottom: version, user, role, date, live time
- [ ] CAPS/NUM indicators respond to keyboard state
- [ ] Customise portal: hide/show tiles, persists after reload
- [ ] npx tsc --noEmit → zero errors

---

# MODULE 2 — ACCOUNTS (Customer Management)

## What It Is
Manage all customers and suppliers. Every person who sells scrap to
the yard is a customer. Account customers have credit balances.
Casual/walk-in customers are registered quickly at purchase time.

## Source: BASIC-BRO.pdf Page 3, Section 2

## Workflow
1. Open Accounts from Portal
2. See paginated list of all customers (search by name/ID)
3. "Add Customer" opens drawer — fill in details, save
4. Click a customer row → inline detail panel shows balance + history
5. Actions: Edit, Blacklist, Police Register, View Loans
6. Casual tab shows walk-in sellers only

## Components Required

### CustomerList (DataTable)
Columns:
| Column | Source | Notes |
|--------|--------|-------|
| Customer | firstName + lastName, avatar circle, idNumber below | |
| Type | customerType | Badge: "Account" blue / "Casual" grey |
| Balance | computed: purchases - payments | Red if > 0, green if 0 |
| Phone | phone | |
| Status | isActive + blacklisted | "Active" green / "Blacklisted" red |
| Actions | — | View, Edit, Blacklist/Unblacklist (manager), Police Register (manager) |

Tabs above table: All | Account | Casual | Blacklisted

### CustomerDrawer (FormPanel)
Fields:
```
Personal:    firstName*, lastName*, idNumber* (SA ID validated), dateOfBirth (auto from ID), gender (auto from ID), phone, email
Business:    companyName, customerType* (account/casual), priceGroupId, primaryFunction (customer/supplier/both)
Compliance:  policeRegisterNo, tradeCommodities (checkboxes: Ferrous, Non-Ferrous, Copper, Aluminium, Plastic, Paper, E-Waste, Other), nationality, licenseNumber, licenseExpiry
Flags:       blacklisted (manager only), isActive
```

### CustomerDetailPanel (InlineDetailPanel)
Left: name, ID, type badge, phone, balance
Centre: last 5 transactions (mini table)
Right: [View Full History] [Edit] [Record Payment] [Add Loan] [Police Register] [Blacklist]

### Casual Details Sub-page (/app/casual)
Separate view filtered to customerType='casual'
A-Z quick filter tabs (A B C ... Z ALL)
Same DataTable but columns: Name, ID No, Phone, Last Transaction, Status

## API Routes
```
GET    /api/customers?type=&search=&page=&status=  → { data: Customer[], total }
POST   /api/customers                              → Customer
GET    /api/customers/[id]                         → Customer + balance + recent transactions
PUT    /api/customers/[id]                         → Customer
POST   /api/customers/[id]/blacklist               → { success } (manager+)
POST   /api/customers/[id]/unblacklist             → { success } (manager+)
GET    /api/customers/[id]/balance                 → { balance: Decimal, purchasesTotal, paymentsTotal }
GET    /api/customers/lookup?idNumber=             → Customer | null (used in purchase form)
POST   /api/customers/quick-create                 → Customer (casual, minimal fields, used at purchase time)
```

## Service: customerService.ts
```ts
list(opts): Promise<{ data: Customer[], total: number }>
getById(id): Promise<Customer>
create(data, userId): Promise<Customer>       // validates SA ID uniqueness
update(id, data, userId): Promise<Customer>
blacklist(id, reason, userId): Promise<void>  // sets blacklisted=true, blacklistReason, blacklistedAt
unblacklist(id, userId): Promise<void>
getBalance(id): Promise<Decimal>              // Decimal.js: SUM(purchases) - SUM(payments)
lookupByIdNumber(idNumber): Promise<Customer | null>
quickCreate(data, userId): Promise<Customer>  // returns existing if idNumber already in DB
```

## Schema
```prisma
model Customer {
  id              String    @id @default(uuid())
  idNumber        String    @unique
  firstName       String
  lastName        String
  companyName     String?
  phone           String?
  email           String?
  physicalAddress String?
  postalAddress   String?
  vatNumber       String?
  customerType    String    @default("casual")   // casual | account
  primaryFunction String    @default("customer") // customer | supplier | both
  priceGroupId    String?
  policeRegisterNo String?
  tradeCommodities Json     @default("[]")
  dateOfBirth     DateTime?
  gender          String?
  nationality     String?
  licenseNumber   String?
  licenseExpiry   DateTime?
  blacklisted     Boolean   @default(false)
  blacklistReason String?
  blacklistedAt   DateTime?
  isActive        Boolean   @default(true)
  idPhotoR2Key    String?
  createdByUserId String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

## Build Order
1. Schema + migrate → list API → fetch hook → DataTable with real customers
2. Create drawer → POST route → submit → list refreshes with new customer
3. Edit drawer pre-fill → PUT route → submit → row updates
4. Blacklist action → confirm → POST route → status badge updates
5. Balance calculation → CustomerDetailPanel with real balance
6. Casual sub-page with A-Z filter

## Validation Checklist
- [ ] Customer list shows real records from database
- [ ] Search by name or ID filters the list live
- [ ] Type filter tabs (All/Account/Casual/Blacklisted) work
- [ ] Add Customer drawer opens, validates, saves, refreshes list
- [ ] SA ID validation: invalid format shows error
- [ ] Duplicate ID number: server error shown in form
- [ ] Edit pre-fills all existing values correctly
- [ ] Blacklist shows confirmation, updates badge immediately
- [ ] Balance shows correctly: R 0.00 green / R X.XX red
- [ ] Clicking row opens inline panel with balance + transactions
- [ ] /app/casual shows only casual customers
- [ ] A-Z tabs on casual page filter correctly
- [ ] Quick-create from purchase form: returns existing if duplicate ID
- [ ] GET /api/customers without session → 401
- [ ] POST /api/customers/[id]/blacklist as cashier → 403

---

# MODULE 3+4 — PRODUCTS + PRICING

## What It Is
Products are the materials the yard buys and sells (Copper, Steel etc).
Pricing allows special price lists per customer group (dealers, casuals).

## Source: BASIC-BRO.pdf Page 5, Section 9

## Workflow — Products
1. Admin opens Products from Settings or Pricing tab
2. Sees list of all products with current buy/sell prices
3. Can add, edit, toggle active, bulk update prices
4. Price changes auto-write PriceHistory entry

## Workflow — Top Product Prices
1. Manager opens Pricing
2. Sees a grid: products as rows, price tiers as columns (Casual / Standard / Preferred / Premium)
3. Can edit any cell inline
4. "Copy Category Prices" copies one tier's prices to another

## Components Required

### ProductList (DataTable)
Columns: Name, Category badge, Unit, Buy Price, Sell Price, Active toggle, Actions

### TopProductPricesGrid
Special component — not a standard DataTable.
Rows: products grouped by category
Columns: Product | Stock | Default Buy | Default Sell | Standard | Preferred | Premium
Cells editable inline (admin only)
"Save All" bulk updates all changes in one transaction

### ProductDrawer (FormPanel)
Fields: code*, name*, category* (ferrous/non_ferrous/copper/aluminium/plastic/paper/e_waste/other), unit* (kg/ton/each), defaultBuyPrice*, defaultSellPrice*, isActive, minStockLevel, marginPercent

### PriceGroupDrawer
Fields: name*, description, isDefault toggle
Below: per-product override table (buy + sell input per product)

## API Routes
```
GET    /api/products?category=&active=&search= → { data: Product[], total }
POST   /api/products                           → Product (admin)
PUT    /api/products/[id]                      → Product (admin)
POST   /api/products/bulk-price                → { updated: number } (admin)
GET    /api/price-groups                       → PriceGroup[]
POST   /api/price-groups                       → PriceGroup (admin)
PUT    /api/price-groups/[id]                  → PriceGroup (admin)
POST   /api/price-groups/[id]/overrides        → { updated: number } (admin)
GET    /api/pricing/top-prices                 → products with prices per group
```

## Service: productService.ts
```ts
listProducts(opts): Promise<{ data: Product[], total }>
createProduct(data, userId): Promise<Product>
updateProduct(id, data, userId): Promise<Product>  // writes PriceHistory if price changed
bulkUpdatePrices(updates, userId): Promise<void>   // single transaction
resolvePrice(productId, priceGroupId?): Promise<{ buyPrice: Decimal, sellPrice: Decimal, source: string }>
// source: 'default' | 'group_override'
```

## Schema
```prisma
model Product {
  id             String   @id @default(uuid())
  code           String   @unique
  name           String
  category       String   // ferrous|non_ferrous|copper|aluminium|plastic|paper|e_waste|other
  unit           String   @default("kg")
  defaultBuyPrice  Decimal @db.Decimal(10,4)
  defaultSellPrice Decimal @db.Decimal(10,4)
  isActive       Boolean  @default(true)
  sortOrder      Int      @default(0)
  minStockLevel  Decimal? @db.Decimal(10,3)
  marginPercent  Decimal? @db.Decimal(5,2)
  createdAt      DateTime @default(now())
}

model PriceGroup {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  isDefault   Boolean  @default(false)
  isActive    Boolean  @default(true)
  overrides   PriceGroupProductOverride[]
}

model PriceGroupProductOverride {
  priceGroupId String
  productId    String
  buyPrice     Decimal @db.Decimal(10,4)
  sellPrice    Decimal @db.Decimal(10,4)
  @@id([priceGroupId, productId])
}

model PriceHistory {
  id          String   @id @default(uuid())
  productId   String
  buyPrice    Decimal  @db.Decimal(10,4)
  sellPrice   Decimal  @db.Decimal(10,4)
  changedById String
  reason      String?
  createdAt   DateTime @default(now())
}
```

## Validation Checklist
- [ ] Product list shows all active products
- [ ] Price edit auto-writes PriceHistory entry
- [ ] resolvePrice: returns group override if customer has price group
- [ ] resolvePrice: falls back to default if no override
- [ ] Top Product Prices grid shows all tiers side by side
- [ ] Inline cell edit saves correctly
- [ ] Price group override saves for all products in one transaction
- [ ] npx tsc --noEmit → zero errors

---

# MODULE 5 — PURCHASES

## What It Is
The core daily operation. A cashier buys scrap from a seller.
They weigh the material on a scale, record the seller's details,
and pay them. VAT264 PDF and purchase note are auto-generated.
Stock goes up. Cash goes out. Cashup is affected.

## Source: BASIC-BRO.pdf Pages 3-4, Section 4 and 6

## Workflow
1. Open Purchases
2. See list of today's purchases (tabs: All / Completed / Pending / Voided)
3. Click "New Purchase" → opens purchase form (full-screen or right panel)
4. Select or quick-create customer
   - If customer has outstanding loan: show LoanAlertModal FIRST
   - If customer is blacklisted: show warning, block the purchase
4. Add product lines:
   - Select product
   - Click "Weigh" → reads live weight from scale into grossQty field
   - Enter tare weight if needed → netQty = gross - tare
   - Enter deduction if needed (e.g. dirt, packaging) → netQty = gross - tare - deduction
   - Price auto-resolves from customer's price group
   - Can override price with manager PIN
   - Add more lines (no limit)
5. Select payment method (Cash / EFT / Cheque / Card)
   - Split payment: can add multiple payment rows if total matches
6. Customer signs on signature canvas → signature uploaded to R2
7. Click "Confirm Purchase"
   - Validates all fields
   - Single Prisma transaction:
     → Creates Purchase + PurchaseLines
     → recordMovement(direction:'in') per line (stock IN)
     → Links signature R2 key
   - After transaction: async PDF generation
     → generateVAT264() → upload to R2 → store vat264R2Key on purchase
     → generatePurchaseNote() → upload to R2 → store purchaseNoteR2Key
     → If customer.autoSendReceipts: send email via Resend → set pdfEmailed=true
8. PrintResultModal appears:
   - Print Slip (thermal printer)
   - Download VAT264
   - Download Purchase Note
   - Email to Customer
9. Purchase appears in list at top, stock on-hand updated

## Components Required

### PurchaseList (DataTable)
Columns: Ref#, Date, Customer (avatar+name), Products summary, Total, Payment Method, Status badge, Actions
Actions: View, Print Slip, Download VAT264, Void (manager)

### PurchaseForm
This is a FULL-SCREEN or large panel form, not a standard drawer.
Layout:
```
Left panel (60%):          Right panel (40%):
  Customer lookup              Scale reading (live)
  Product lines table          Payment method
  [+ Add Line] button          Signature canvas
  Line totals                  [Confirm Purchase]
```

Customer lookup:
- Search by name or ID number
- If not found: "Quick Create" button → minimal casual form
- If found: show name, ID, balance, price group
- LOAN CHECK: if customer has active loans → LoanAlertModal

Product line row:
```
[Product select] [Gross qty] [Weigh btn] [Tare qty] [Net qty] [Price/unit] [Deduction] [Deduction reason] [Line total] [×]
```

Scale buttons:
- "Weigh Gross": calls GET /api/scales/{n}/read → fills grossQty
- "Weigh Tare": calls GET /api/scales/{n}/read → fills tareQty
- Net = gross - tare - deduction (Decimal.js, computed live)
- Scale selector: Scale 1 / Scale 2 / Scale 3

Price override: pencil icon on price cell → enter new price → manager enters PIN → approved

Payment section:
- Default: single payment method select
- "+ Add Payment Method" button for split payments
- Each row: method select + amount input + reference (if EFT/cheque)
- Running total shown: "Allocated: R300 / Total: R450 — Remaining: R150"
- Cannot confirm until allocated = total (Decimal.js comparison)

Signature canvas:
- HTML5 canvas, 400×150px, white bg
- Touch + mouse drawing
- "Clear" button
- "Confirm" exports as JPEG blob → uploads to R2 → key stored

### LoanAlertModal
Shows when customer has active loans before purchase proceeds.
- "This customer has an outstanding loan of R X,XXX.XX"
- List of active loans
- Option 1: "Record Repayment Now" → inline repayment form
- Option 2: "Continue Without Repayment"
- Modal cannot be dismissed without choosing one

### PrintResultModal
Shows after purchase completes:
- "Purchase {refNumber} Recorded"
- [Print Slip] button → POST /api/print/purchase/{id}
- [Download VAT264] button → GET /api/r2/view-url?key=vat264R2Key (poll if not ready yet)
- [Download Purchase Note] button → same
- [Email Customer] button (if customer has email)
- [Done] button → closes modal, resets form

### UnpaidPurchasesList (/app/purchases/unpaid)
Shows purchases with status='pending' (created as "Save as Unpaid").
Grouped by customer.
Per group: customer name, number of tickets, total owed.
"Pay All" button → payment form for all selected tickets.
After payment: PrintResultModal appears.

## API Routes
```
GET    /api/purchases?status=&search=&date=&page=  → { data: Purchase[], total }
POST   /api/purchases                              → Purchase
GET    /api/purchases/[id]                         → Purchase with lines + customer
POST   /api/purchases/[id]/void                    → Purchase (manager+, with voidReason)
GET    /api/purchases/[id]/receipt                 → thermal receipt text
PATCH  /api/purchases/[id]/mark-paid               → Purchase (pending→completed)
GET    /api/purchases/unpaid                       → grouped unpaid purchases
```

## Service: purchaseService.ts
```ts
create(data, userId): Promise<Purchase>
  // 1. Validate customer not blacklisted, isActive
  // 2. Validate all products isActive
  // 3. resolvePrice() per line using customer.priceGroupId
  // 4. Single Prisma transaction:
  //    - Create Purchase + PurchaseLines
  //    - stockService.recordMovement(direction:'in') per line IN SAME TRANSACTION
  // 5. After transaction (setImmediate, non-blocking):
  //    - generateVAT264() → upload R2 → update purchase.vat264R2Key
  //    - generatePurchaseNote() → upload R2 → update purchase.purchaseNoteR2Key
  //    - if autoSendReceipts: resend email → set pdfEmailed=true

voidPurchase(id, reason, userId): Promise<void>
  // 1. Single transaction:
  //    - Set status=voided, voidedAt, voidedById, voidReason
  //    - stockService.recordVoidReversal() per line IN SAME TRANSACTION
```

## Schema
```prisma
model Purchase {
  id               String   @id @default(uuid())
  refNumber        String   @unique  // PUR-YYYYMMDD-NNNN
  customerId       String
  status           String   @default("completed")  // completed|pending|voided
  totalAmount      Decimal  @db.Decimal(18,2)
  paymentMethod    String?  // for single payment
  vehicleReg       String?
  wbTicketNumber   String?
  workPlace        String?
  pdfEmailed       Boolean  @default(false)
  signatureR2Key   String?
  vat264R2Key      String?
  purchaseNoteR2Key String?
  hasOutstandingBalance Boolean @default(false)
  notes            String?
  voidedAt         DateTime?
  voidedById       String?
  voidReason       String?
  createdByUserId  String
  createdAt        DateTime @default(now())
  lines            PurchaseLine[]
  payments         TransactionPayment[]
}

model PurchaseLine {
  id             String   @id @default(uuid())
  purchaseId     String
  productId      String
  grossQty       Decimal? @db.Decimal(10,3)
  tareQty        Decimal? @db.Decimal(10,3)
  deductionQty   Decimal? @db.Decimal(10,3)
  deductionReason String?
  quantity       Decimal  @db.Decimal(10,3)  // = gross - tare - deduction
  unitPrice      Decimal  @db.Decimal(10,4)
  lineTotal      Decimal  @db.Decimal(18,2)
  priceSource    String   // 'default' | 'group_override' | 'manager_override'
  overrideApprovedById String?
  paymentSettled Boolean  @default(false)
}

model TransactionPayment {
  id            String   @id @default(uuid())
  purchaseId    String?
  saleId        String?
  amount        Decimal  @db.Decimal(18,2)
  paymentMethod String   // cash|eft|cheque|card
  referenceNo   String?
  recordedById  String
  recordedAt    DateTime @default(now())
}
```

## Build Order
1. Schema + migrate → list API → DataTable with real purchases
2. Customer lookup in form → verify live search works
3. Product line add/remove → price auto-resolve → line totals compute
4. Scale integration → Weigh button → gross/tare/net
5. Payment section (single) → Confirm → purchase saved → stock updated
6. VAT264 + purchase note PDF generation (async)
7. PrintResultModal + thermal print
8. Split payments
9. Manager PIN price override
10. Void purchase → stock reversal
11. Unpaid purchases list + mark-paid flow

## Validation Checklist
- [ ] Purchase list shows real records from DB
- [ ] Status tabs work (All/Completed/Pending/Voided)
- [ ] New Purchase opens correct form layout
- [ ] Customer search finds existing customers
- [ ] Blacklisted customer: blocked with clear warning
- [ ] Customer with loan: LoanAlertModal appears BEFORE form continues
- [ ] Add product line: product select populates price fields
- [ ] Gross - Tare - Deduction = Net (Decimal.js, no floats)
- [ ] Weigh button calls scale API and fills grossQty
- [ ] Price resolves from customer's price group (not always default)
- [ ] Confirm: purchase saved in DB (verify Prisma Studio)
- [ ] Confirm: StockMovement IN written per line, SAME transaction
- [ ] If purchase saved but stock write fails: ENTIRE transaction rolled back
- [ ] VAT264 PDF: vat264R2Key set on purchase within 30s of confirm
- [ ] Purchase note PDF: purchaseNoteR2Key set within 30s
- [ ] PrintResultModal: VAT264 download works
- [ ] Thermal print: POST /api/print/purchase/{id} → receipt printed
- [ ] Void: confirmation shown, stock reversed, status=voided
- [ ] Split payment: two methods sum to total → allowed
- [ ] Split payment: two methods don't sum to total → blocked
- [ ] Manager price override: cashier can't change without PIN
- [ ] Audit log: INSERT for purchase, INSERT for each line
- [ ] POST /api/purchases without session → 401

---

# MODULE 6 — SALES

## What It Is
The yard sells processed/sorted materials to buyers.
Works like Purchases but stock goes OUT and money comes IN.
Can be to a named account customer or a walk-in.

## Workflow
1. Open Sales → see list of today's sales
2. "New Sale" → form
3. Optional: select account customer (gets their price group)
4. Add product lines (sell price from resolvePrice)
5. Confirm → stock OUT per line (same transaction)
6. Print packing list + receipt

## API Routes
```
GET    /api/sales?status=&search=&date=&page= → { data: Sale[], total }
POST   /api/sales                             → Sale
GET    /api/sales/[id]                        → Sale with lines
POST   /api/sales/[id]/void                   → Sale (manager+)
GET    /api/sales/[id]/packing-list           → PDF stream
```

## Schema
```prisma
model Sale {
  id              String   @id @default(uuid())
  refNumber       String   @unique  // SAL-YYYYMMDD-NNNN
  customerId      String?  // optional — walk-in sales have no customer
  status          String   @default("completed")  // completed|voided
  totalAmount     Decimal  @db.Decimal(18,2)
  paymentMethod   String
  notes           String?
  voidedAt        DateTime?
  voidedById      String?
  voidReason      String?
  createdByUserId String
  createdAt       DateTime @default(now())
  lines           SaleLine[]
}

model SaleLine {
  id         String  @id @default(uuid())
  saleId     String
  productId  String
  quantity   Decimal @db.Decimal(10,3)
  unitPrice  Decimal @db.Decimal(10,4)
  lineTotal  Decimal @db.Decimal(18,2)
  priceSource String
}
```

## Cross-Module Effects
- Stock: recordMovement(direction:'out') per line, SAME transaction
- CashUp: feeds systemCashSales aggregate

## Validation Checklist
- [ ] Sale list shows real records
- [ ] New sale without customer: works as walk-in
- [ ] New sale with account customer: resolves sell prices from price group
- [ ] Stock reduced per line (verify on-hand after sale)
- [ ] Void: stock reversed (verify on-hand after void)
- [ ] Packing list PDF downloadable

---

# MODULE 7 — PAYMENTS (Account Customer Payouts)

## What It Is
Account customers sell material on credit. Payments module records
when the yard PAYS these customers their outstanding balance.

## Source: BASIC-BRO.pdf Page 4, Section 6

## Workflow
1. Open Payments
2. See list of account customers with outstanding balances
3. "Record Payment" opens modal:
   - Shows customer name, phone, outstanding balance
   - Amount input (with "Use full balance" shortcut link)
   - Payment method select
   - Notes (optional)
4. Submit → payment recorded, balance reduces

## Components Required

### AccountBalanceList (DataTable)
Tabs: Payment History | Account Balances

Account Balances tab columns: Customer, Phone, Outstanding, Last Payment, Actions
Outstanding: red if > 0, green if R 0.00

### RecordPaymentModal
- Account Customer card: name, phone, "Outstanding: R {balance}" in amber
- "Change" button to switch customer
- Amount input with "Use full balance (R X.XX)" link below
- Payment method select
- Notes
- [Cancel] [Record Payment] buttons

## API Routes
```
GET    /api/payments?customerId=&page=         → { data: Payment[], total }
POST   /api/payments                           → Payment
GET    /api/payments/balances                  → { data: AccountBalance[], total } (manager+)
POST   /api/payments/[id]/void                 → Payment (manager+)
```

## Service: paymentService.ts
```ts
create(data, userId): Promise<Payment>
  // Validates customerType = 'account'
  // Creates Payment record
  // NO stock effect

getCustomerBalance(customerId): Promise<Decimal>
  // Decimal.js: SUM(completed purchases) - SUM(non-voided payments)

listAccountBalances(): Promise<AccountBalance[]>
  // All active account customers with computed balance
```

## Schema
```prisma
model Payment {
  id              String   @id @default(uuid())
  refNumber       String   @unique  // PAY-YYYYMMDD-NNNN
  customerId      String
  amount          Decimal  @db.Decimal(18,2)
  paymentMethod   String   // cash|eft|cheque|card
  referenceNo     String?
  notes           String?
  voidedAt        DateTime?
  voidedById      String?
  voidReason      String?
  createdByUserId String
  createdAt       DateTime @default(now())
}
```

## Cross-Module Effects
- Customer balance recalculates (computed on demand, not stored)
- CashUp: feeds systemCashPayments aggregate

## Validation Checklist
- [ ] Account balances list shows real balances from DB
- [ ] Balance = SUM(purchases) - SUM(payments) (Decimal.js)
- [ ] Record Payment modal: outstanding balance shown correctly
- [ ] "Use full balance" fills the amount field
- [ ] After payment: balance in list updates immediately
- [ ] Cashier cannot access /api/payments/balances → 403
- [ ] Void payment: balance recalculates correctly

---

# MODULE 8 — STOCK

## What It Is
Stock is movement-based — there is NO stored quantity on the Product.
On-hand is always computed: SUM(movements IN) - SUM(movements OUT).
Manual adjustments and product transfers are also recorded as movements.

## Workflow
1. Open Stock Level Grid
2. See grid with tabs: Daily | Weekly | MTD | Movements | Stocktake | Adjust
3. On Hand tab shows: product, opening, in, out, closing, value per period
4. Movements tab: searchable history of all stock movements
5. Adjust: manual in/out with required reason
6. Transfer: move stock from one product to another (upgrade/downgrade)
7. Stocktake: monthly enforced physical count

## API Routes
```
GET    /api/stock/on-hand?view=daily|weekly|mtd&date= → StockPosition[]
GET    /api/stock/movements?productId=&source=&date=  → StockMovement[]
POST   /api/stock/adjust                              → StockMovement (manager+)
POST   /api/stock/transfer                            → 2x StockMovement (manager+)
GET    /api/stock/export?view=&date=                  → Excel file
GET    /api/stock/low-stock                           → products below minStockLevel
POST   /api/stocktake                                 → Stocktake
POST   /api/stocktake/[id]/complete                   → Stocktake (manager+)
```

## Service: stockService.ts
```ts
recordMovement(tx, opts): Promise<void>
  // MUST be called inside a Prisma transaction (pass tx)
  // opts: { productId, direction: 'in'|'out', quantity: Decimal, source, sourceId, userId }

getStockOnHand(productId?, view?, date?): Promise<StockPosition[]>
  // Computes: opening + IN - OUT = closing
  // All Decimal.js

manualAdjustment(opts, userId): Promise<void>
  // source = 'manual_adjustment'

transferStock(fromProductId, toProductId, qty, reason, userId): Promise<void>
  // Single transaction: OUT from source + IN to target
  // source = 'product_transfer'

getLowStockProducts(): Promise<LowStockAlert[]>
  // Products where minStockLevel IS NOT NULL AND onHand < minStockLevel
```

## Schema
```prisma
model StockMovement {
  id              String   @id @default(uuid())
  productId       String
  direction       String   // in | out
  quantity        Decimal  @db.Decimal(10,3)
  source          String   // purchase|sale|manual_adjustment|void_reversal|product_transfer|stocktake_adjustment
  sourceId        String?  // purchaseId / saleId etc
  notes           String?
  createdByUserId String
  createdAt       DateTime @default(now())
  @@index([productId, createdAt])
}

model Stocktake {
  id            String          @id @default(uuid())
  month         Int
  year          Int
  status        String          @default("in_progress")  // in_progress|completed
  completedById String?
  completedAt   DateTime?
  createdAt     DateTime        @default(now())
  entries       StocktakeEntry[]
  @@unique([month, year])
}

model StocktakeEntry {
  id             String   @id @default(uuid())
  stocktakeId    String
  productId      String
  systemQuantity Decimal  @db.Decimal(10,3)
  physicalCount  Decimal  @db.Decimal(10,3)
  variance       Decimal  @db.Decimal(10,3)
  notes          String?
}
```

## Validation Checklist
- [ ] On Hand: SUM of movements correct (verify manually)
- [ ] Purchase completion: StockMovement IN written, same transaction as purchase
- [ ] Purchase void: StockMovement reversal written
- [ ] Sale completion: StockMovement OUT written, same transaction as sale
- [ ] Manual adjust: movement written with source=manual_adjustment
- [ ] Transfer: OUT from source + IN to target, same transaction
- [ ] MTD view: opening = balance at start of month, correct
- [ ] Excel export downloads valid .xlsx file
- [ ] Low stock alert appears on dashboard for products below minimum
- [ ] Stocktake: completing writes adjustment movements for all variances

---

# MODULE 9 — CASH FLOAT

## What It Is
The physical cash kept in the till at start of each day.
Tracked as a running ledger of movements, not a single field.

## Workflow
1. Open Float
2. See current float balance (large display)
3. Record top-up or withdrawal with reference note
4. History table shows all movements

## Schema
```prisma
model FloatMovement {
  id            String   @id @default(uuid())
  movementType  String   // top_up|withdrawal|opening|adjustment
  amount        Decimal  @db.Decimal(18,2)
  balanceAfter  Decimal  @db.Decimal(18,2)  // running balance
  referenceNote String?
  cashupId      String?
  recordedById  String
  recordedAt    DateTime @default(now())
}
```

## Service: floatService.ts
```ts
getCurrentFloat(): Promise<Decimal>
  // latest FloatMovement.balanceAfter, or Decimal(0) if none

recordMovement(type, amount, note, userId): Promise<FloatMovement>
  // withdrawal: validate amount <= currentFloat
  // newBalance = type=withdrawal ? current - amount : current + amount
  // All Decimal.js

getFloatForDate(date): Promise<Decimal>
  // Used by CashUp on session open
```

## Cross-Module Effects
- CashUp: openingBalance = floatService.getFloatForDate(sessionDate)
- CashUp approval: set next day's float = declaredCash

## Validation Checklist
- [ ] Current float shows correct balance (sum of all movements)
- [ ] Top-up: balance increases, movement recorded
- [ ] Withdrawal > current float: error, blocked
- [ ] History table shows all movements with correct running balance
- [ ] Float feeds openingBalance when cashup opens (verify cashup shows float amount)

---

# MODULE 10 — CASH-UP

## What It Is
End-of-day financial reconciliation. Compares expected cash
(from all transactions) against physical cash counted.

## Source: BASIC-BRO.pdf Page 4, Section 7

## Workflow
1. Manager opens Cash-Up
2. If no session today: "Open Session" button
3. Session opens → openingBalance auto-populated from FloatLedger
4. During the day: system auto-computes all lines from actual transactions
5. At end of day: cashier counts denominations, enters physicalCount
6. Submit: computes variance = physicalCount - expectedCash
7. Manager approves → session closed → next day's float set to declaredCash

## Components

### CashUpForm (4 collapsible sections)

Section 1 — Opening:
```
Opening Float (from Float Ledger):    R 2,425.40  [View Float]
Owner Drawings Received:              R 0.00      [editable]
```

Section 2 — Cash In:
```
Cash Purchases Received (+):          R 12,450.00  [View 23 transactions]
Loan Repayments Received (+):         R 0.00       [View]
Card / EFT Payments (info only):      R 3,200.00   [View]
```

Section 3 — Cash Out:
```
Operational Costs Paid (-):           R 850.00    [View]  [amber if drafts uncommitted]
Loan Advances Given (-):              R 0.00      [editable]
Miscellaneous Spend (-):              R 0.00      [editable + reason]
```

Section 4 — Reconcile:
```
Calculated Float:                     R 14,025.40
Physical Cash Counted:                [R ___.__]  ← cashier types this
VARIANCE:                             R 0.00      ← green if ≤ R10, amber ≤ R100, red > R100
Fin Period Cumulative Balance:        R X,XXX.XX
```

"View" links open a SlideOverPanel with the transactions for that line.

### DenominationBreakdown
Grid input for counting cash by note/coin denomination.
Sum auto-populates the Physical Cash Counted field.

## API Routes
```
GET    /api/cashup?today=1                    → CashUp | null
POST   /api/cashup                            → CashUp (open new session)
PUT    /api/cashup/[id]                       → CashUp (submit declaration)
POST   /api/cashup/[id]/approve               → CashUp (manager+)
GET    /api/cashup/[id]/breakdown/[line]      → transactions for a cashup line
```

## Service: cashUpService.ts
```ts
openCashUp(userId): Promise<CashUp>
  // openingBalance = floatService.getFloatForDate(today)

calcSystemTotals(sessionDate): Promise<CashUpTotals>
  // ALL Decimal.js:
  // systemCashPurchases = SUM(Purchase WHERE paymentMethod=cash AND today AND completed)
  // systemCashSales     = SUM(Sale WHERE paymentMethod=cash AND today AND completed)
  // systemCashPayments  = SUM(Payment WHERE paymentMethod=cash AND today AND !voided)
  // cardPaymentsTotal   = SUM(Sale WHERE paymentMethod IN [eft,card] AND today)
  // expensesTotal       = expenseService.getExpenseTotalsForDate(today)
  // loanAdvancesGiven   = loanService.getLoanTotalsForDate(today).advances
  // loanRepaymentsRec   = loanService.getLoanTotalsForDate(today).repayments
  // expectedCash = openingBalance + cashPurchases - cashSales - expenses
  //              - loanAdvances + loanRepayments + ownerDrawings - miscSpend

submitCashUp(id, data, userId): Promise<CashUp>
  // 1. calcSystemTotals()
  // 2. Link today's approved expenses to this cashup (updateMany expenses.cashUpId)
  // 3. computeFinancialPeriodBalance() = SUM this month's cashup variances
  // 4. variance = declaredCash - expectedCash
  // 5. status = 'submitted'

approveCashUp(id, userId): Promise<CashUp>
  // 1. status = 'approved'
  // 2. floatService.recordMovement(type='opening', amount=declaredCash, next day)
  //    → sets tomorrow's opening float
```

## Schema
```prisma
model CashUp {
  id              String   @id @default(uuid())
  sessionDate     DateTime @unique
  status          String   @default("open")  // open|submitted|approved
  openedByUserId  String
  openedAt        DateTime @default(now())
  closedByUserId  String?
  closedAt        DateTime?
  approvedByUserId String?
  approvedAt      DateTime?
  // System-calculated
  openingBalance      Decimal @db.Decimal(18,2) @default(0)
  systemCashPurchases Decimal @db.Decimal(18,2) @default(0)
  systemCashSales     Decimal @db.Decimal(18,2) @default(0)
  systemCashPayments  Decimal @db.Decimal(18,2) @default(0)
  expensesTotal       Decimal @db.Decimal(18,2) @default(0)
  cardPaymentsTotal   Decimal @db.Decimal(18,2) @default(0)
  loanAdvancesGiven   Decimal @db.Decimal(18,2) @default(0)
  loanRepaymentsReceived Decimal @db.Decimal(18,2) @default(0)
  // Cashier-entered
  declaredCash        Decimal @db.Decimal(18,2) @default(0)
  ownerDrawings       Decimal @db.Decimal(18,2) @default(0)
  miscellaneousSpend  Decimal @db.Decimal(18,2) @default(0)
  denominations       Json    @default("{}")
  // Computed on submit
  systemCashExpected  Decimal @db.Decimal(18,2) @default(0)
  variance            Decimal @db.Decimal(18,2) @default(0)
  financialPeriodBalance Decimal @db.Decimal(18,2) @default(0)
  notes               String?
}
```

## Validation Checklist
- [ ] Open session: openingBalance = today's float from FloatLedger
- [ ] systemCashPurchases: changes when a purchase is completed (verify by adding a purchase then refreshing cashup)
- [ ] systemCashSales: changes when a sale is completed
- [ ] expensesTotal: changes when an expense is approved
- [ ] All arithmetic uses Decimal.js (check service code — no parseFloat)
- [ ] "View" links open slide-over with correct transactions
- [ ] Variance = declaredCash - expectedCash
- [ ] Variance colour: green (≤R10), amber (≤R100), red (>R100)
- [ ] Approve: next day's float set to declaredCash (verify FloatMovement created)
- [ ] Cashier cannot approve → 403

---

# MODULE 11 — EXPENSES (OPERATIONAL COSTS)

## What It Is
Daily operational costs: wages, fuel, repairs, office supplies.
Tracked with a category tree. Draft until committed to cashup.

## Workflow
1. Cashier records an expense (draft)
2. Manager approves it
3. On cashup close: all approved expenses auto-link to that cashup session
4. expensesTotal on cashup = SUM(approved expenses for today)

## Schema
```prisma
model CostCategory {
  id              String          @id @default(uuid())
  name            String
  parentId        String?
  isVatApplicable Boolean         @default(false)
  sortOrder       Int             @default(0)
  isActive        Boolean         @default(true)
  parent          CostCategory?   @relation("CatTree", fields:[parentId], references:[id])
  children        CostCategory[]  @relation("CatTree")
}

model Expense {
  id              String   @id @default(uuid())
  refNumber       String   @unique  // EXP-NNNNN
  costCategoryId  String
  description     String
  amount          Decimal  @db.Decimal(18,2)
  vatAmount       Decimal  @db.Decimal(18,2) @default(0)
  includesVat     Boolean  @default(false)
  paymentMethod   String
  chequeNo        String?
  status          String   @default("pending")  // pending|approved|voided
  approvedById    String?
  approvedAt      DateTime?
  cashUpId        String?
  createdByUserId String
  createdAt       DateTime @default(now())
}
```

Default seed categories:
- General → Office Supplies, Communication
- Wages → Full-time Staff, Casual Labour, Drivers
- Transport → Fuel, Vehicle Maintenance
- Other

## Service: expenseService.ts
```ts
create(data, userId): Promise<Expense>
approveExpense(id, userId): Promise<Expense>  // manager+
voidExpense(id, userId): Promise<Expense>     // manager+
getExpenseTotalsForDate(date): Promise<Decimal>
  // SUM(approved expenses WHERE createdAt = date)
  // Called by cashUpService.calcSystemTotals()
```

## Validation Checklist
- [ ] Expense list shows pending/approved tabs
- [ ] Add expense: category tree select works
- [ ] Approve: status changes to approved, approvedById set
- [ ] getExpenseTotalsForDate: returns correct sum (Decimal.js)
- [ ] CashUp expensesTotal reflects approved expenses (end-to-end test)
- [ ] cashUpId set on expense after cashup close
- [ ] Cashier cannot approve → 403

---

# MODULE 12 — LOANS

## What It Is
Yard gives cash advances to customers. Customers repay over time.
Outstanding loans affect cashup totals.
Purchase form must alert if customer has an outstanding loan.

## Source: BASIC-BRO.pdf Page 5, Section 10

## Workflow
1. Manager adds loan advance for a customer
2. Customer comes in to sell material → Purchase form shows LoanAlertModal
3. Cashier records repayment (partial or full) from the alert modal
4. Loan shows as settled when fully repaid
5. Loan advances/repayments feed into CashUp

## Schema
```prisma
model Loan {
  id              String          @id @default(uuid())
  refNumber       String          @unique  // LOAN-NNNNNN
  customerId      String
  description     String
  advanceAmount   Decimal         @db.Decimal(18,2)
  advanceMethod   String
  transactionRef  String?
  status          String          @default("active")  // active|settled
  settledAt       DateTime?
  cashUpId        String?
  createdByUserId String
  createdAt       DateTime        @default(now())
  repayments      LoanRepayment[]
}

model LoanRepayment {
  id              String   @id @default(uuid())
  loanId          String
  amount          Decimal  @db.Decimal(18,2)
  repaymentMethod String
  repaymentDate   DateTime @default(now())
  notes           String?
  cashUpId        String?
  createdByUserId String
}
```

## Service: loanService.ts
```ts
createLoan(data, userId): Promise<Loan>  // manager+
addRepayment(loanId, amount, method, userId): Promise<LoanRepayment>
  // validate amount <= outstanding balance
  // if fully repaid: set loan.status = 'settled'
getLoanBalance(loanId): Promise<Decimal>
  // advanceAmount - SUM(repayments.amount) — Decimal.js
getActiveLoansForCustomer(customerId): Promise<Loan[]>
getTotalOutstanding(customerId): Promise<Decimal>
getLoanTotalsForDate(date): Promise<{ advances: Decimal, repayments: Decimal }>
  // used by cashUpService
```

## Validation Checklist
- [ ] Loan list shows all active loans
- [ ] Add loan: advance recorded, balance = advance amount
- [ ] Repayment: balance decreases correctly (Decimal.js)
- [ ] Full repayment: loan status = settled
- [ ] Purchase form: customer with active loan → LoanAlertModal shown
- [ ] Recording repayment from alert modal works
- [ ] CashUp loanAdvancesGiven/loanRepaymentsReceived correct
- [ ] Repayment > balance → error, blocked
- [ ] Cashier cannot add loan → 403

---

# MODULE 13 — POLICE REGISTER

## What It Is
Legal compliance document required by SAPS under the
SA Second-Hand Goods Act 6 of 2009. Must include BOTH
acquisitions (purchases from sellers) AND disposals (sales to buyers).

## Source: BASIC-BRO.pdf Page 4, Section 8

## Workflow
1. Manager opens Police Register
2. Selects date range (default: from last police visit to today)
3. System generates A4 PDF with:
   - Section A: Acquisitions (completed purchases in range)
   - Section B: Disposals (completed sales in range)
   - ID photos embedded if available
   - Signatures embedded if available
4. Download or print
5. After visit: manager records police visit (date, officer name, badge)

## Schema
```prisma
model PoliceVisit {
  id           String   @id @default(uuid())
  visitDate    DateTime
  officerName  String
  badgeNumber  String?
  stationName  String?
  fromDate     DateTime
  toDate       DateTime
  notes        String?
  recordedById String
  createdAt    DateTime @default(now())
}
```

## PDF Generation: src/lib/pdf/policeRegister.ts
```
HEADER:
  "POLICE REGISTER"
  "In terms of the Second-Hand Goods Act 6 of 2009"
  Dealer details (from SystemSettings): name, address, VAT number
  Date range

SECTION A — ACQUISITIONS:
  Columns: #, Date/Time, Ref, Seller Name, ID Number, DOB, Address, Product, Qty (kg), Price
  Per row: embed signature image if signatureR2Key exists
  Per row: embed ID photo thumbnail if customer.idPhotoR2Key exists

SECTION B — DISPOSALS:
  Columns: #, Date/Time, Ref, Buyer Name/Walk-in, Product, Qty, Price

FOOTER:
  Grand totals
  "SAPS Officer Signature: ___________  Badge: ___________  Date: ___________"
```

## Validation Checklist
- [ ] Date range defaults to last police visit → today
- [ ] PDF includes BOTH acquisitions AND disposals
- [ ] Acquisitions: customer details correct
- [ ] Disposals: sale details correct (buyer name or "Walk-in")
- [ ] Signatures embedded when available (not blank box)
- [ ] ID photos embedded when available
- [ ] PoliceVisit: record visit, show last visit on page
- [ ] PDF downloads without errors

---

# MODULE 14 — PHOTO VIEWER

## What It Is
Central browser for all photos and documents in the system.
Every purchase photo, ID photo, signature, and generated PDF
is accessible here with search and filtering.

## Source: BASIC-BRO.pdf Page 4, Section 5

## Workflow
1. Open Photo Viewer
2. Select category: Purchases | Sales | Casual ID Photos | Documents | WB Notes
3. Filter by date, customer, ref number
4. Top table: transactions matching filters
5. Click a transaction → bottom table shows its line items
6. Click "View Photo" on a line → lightbox opens
7. "Gen PDFs" for selected transactions → bulk PDF download
8. "Export" → CSV/Excel of the list

## MediaFile Model
```prisma
model MediaFile {
  id           String   @id @default(uuid())
  r2Key        String   @unique
  category     String   // purchase_photo|sale_photo|casual_id|signature|vat264|purchase_note|wb_note
  linkedToType String   // purchase|sale|customer|stocktake
  linkedToId   String
  capturedAt   DateTime @default(now())
  capturedById String
  mimeType     String   @default("image/jpeg")
  @@index([category])
  @@index([linkedToType, linkedToId])
}
```

All existing R2 uploads must create a MediaFile row.
This is the key fix that makes Photo Viewer work.

## Validation Checklist
- [ ] MediaFile created when purchase signature uploaded
- [ ] MediaFile created when VAT264 generated
- [ ] MediaFile created when customer ID photo uploaded
- [ ] Photo Viewer shows purchases with photos
- [ ] Casual ID Photos category shows customer ID photos
- [ ] Documents category shows VAT264/purchase note PDFs
- [ ] Clicking row shows line items in bottom table
- [ ] "View Photo" opens lightbox with real image
- [ ] Signed URL fetched fresh per request (not stored in DB)
- [ ] Date + customer filters work

---

# MODULE 15 — REPORTS

## What It Is
Financial and operational reports across all modules.
Two-panel layout: report tree on left, output on right.

## Source: BASIC-BRO.pdf Page 6, Section 13

## Report Categories
```
Transactions:
  - Sales Report
  - Purchases Report
  - Cancelled Purchases
  - Cancelled Sales per Customer

Finance:
  - Cashup Summary
  - Float Log
  - Cash On Hand
  - Daily Expenses

Stock:
  - Stock Level MTD
  - Stock Value Report
  - Stock Movements

Loans:
  - Cash Loans
  - Cash Loans Repayments

Customers:
  - Casual Details List
  - Customer Balances
```

## API Routes
```
GET /api/reports/today                        → today's KPIs
GET /api/reports?from=&to=                    → full date range report
GET /api/reports/cash-on-hand?date=           → cash position
GET /api/reports/float-log?from=&to=          → float history
GET /api/reports/cancelled?type=&from=&to=    → voided transactions
GET /api/reports/cash-loans?from=&to=         → loan advances
GET /api/reports/cash-loans-repay?from=&to=   → loan repayments
GET /api/reports/profit-summary?from=&to=     → margin per product
GET /api/reports/[any]?format=csv             → same data as CSV
GET /api/reports/[any]?format=excel           → same data as Excel
```

## Validation Checklist
- [ ] Report tree shows all categories expandable
- [ ] Clicking a report loads it in the right panel
- [ ] Date range picker works and updates the report
- [ ] Today's KPIs on dashboard poll /api/reports/today every 30s
- [ ] CSV download produces valid CSV
- [ ] Excel download produces valid .xlsx
- [ ] Manager-only reports return 403 for cashier

---

# MODULE 16 — AUDIT LOG

## What It Is
Automatic record of every create, update, delete action.
Written by Prisma middleware — never called directly.

## Schema
```prisma
model AuditLog {
  id        String   @id @default(uuid())
  action    String   // CREATE|UPDATE|DELETE
  model     String   // Prisma model name
  recordId  String
  userId    String?
  changes   Json
  createdAt DateTime @default(now())
}
```

## Middleware (src/lib/db/prisma.ts)
Uses AsyncLocalStorage to capture userId from request context.
Intercepts every create/update/delete Prisma operation.
Writes AuditLog row in the SAME transaction when possible.

Fix for null userId: set up AsyncLocalStorage in middleware.ts,
read in prisma middleware via getRequestUserId().

## Validation Checklist
- [ ] Every purchase create: AuditLog INSERT row exists
- [ ] Every customer update: AuditLog UPDATE row exists
- [ ] Every void: AuditLog UPDATE row exists
- [ ] userId is NOT null on any audit entry (fix AsyncLocalStorage)
- [ ] Admin can view audit log at /app/audit-log
- [ ] Audit log not accessible to cashier or manager

---

# FINAL SYSTEM VALIDATION

Run this after all modules are built. ALL must pass.

## End-to-End Scenarios

### Scenario 1 — Full purchase day
1. Login as cashier → Portal shows tiles on navy bg
2. Open Purchases → list is empty (first run)
3. New Purchase → quick-create casual customer → add Copper 31kg → Cash payment
4. Confirm → stock on-hand increases by 31kg (check Stock tab)
5. VAT264 downloadable from PrintResultModal
6. Open Cash-Up → systemCashPurchases reflects R108.50
7. Set float → open cashup → submit (declaredCash = expectedCash) → approve
8. Check FloatMovement: tomorrow's opening = today's declaredCash

### Scenario 2 — Loan popup
1. Add loan to existing customer (R1000 cash)
2. New Purchase → select that customer → LoanAlertModal appears
3. Record R200 repayment in modal → continue with purchase
4. Cash-Up: loanAdvancesGiven = R1000, loanRepaymentsReceived = R200

### Scenario 3 — Stock transfer
1. Stock Level Grid → Transfer: move 10kg "Mixed Copper" → "Bare Bright Copper"
2. Mixed Copper on-hand: -10kg, Bare Bright: +10kg (verify both)

### Scenario 4 — Police register
1. Complete 3 purchases and 1 sale
2. Open Police Register → generate for last 7 days
3. PDF has Section A (3 acquisitions) AND Section B (1 disposal)

## Code Quality
- [ ] grep -r "parseFloat\|Math.round\|\.toFixed" src/lib/services/ → 0 results
- [ ] grep -r "console\.log" src/ → 0 results
- [ ] npx tsc --noEmit → 0 errors
- [ ] No sidebar in any page
- [ ] Every page uses PageShell
- [ ] Every table uses DataTable component
- [ ] Every form uses FormPanel / drawer
