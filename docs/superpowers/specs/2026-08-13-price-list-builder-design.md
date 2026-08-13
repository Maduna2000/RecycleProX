# Price List Builder Design

**Date:** 2026-08-13
**Module:** Products (M3/M4) + Purchases (M5) integration
**Status:** Approved for implementation

## Summary

Recycling yards print a daily materials price sheet (reference: the legacy
"TODAY'S PRICES" A4 document — logo/company header, date, MATERIAL |
INC VAT | EX VAT table, footer disclaimer). This feature adds a Price List
builder to the Products module: managers create, edit, duplicate, and print
price list documents built from selected products and/or whole categories,
with an optional company logo. One list at a time can be marked **active for
purchases**; the new-purchase screen replaces its Product Photo capture box
with a live "Today's Prices" panel showing that active list, so cashiers can
see current day prices without leaving the purchase screen.

## Decisions (confirmed with owner)

1. **Prices are an editable snapshot.** Adding a product pre-fills its
   current `defaultBuyPrice`; the user may overtype any price. The document
   stores its own prices — later product price changes do not alter an
   existing list.
2. **INC VAT entered, EX VAT computed.** The user enters/edits the INC VAT
   price only. EX VAT = INC ÷ (1 + VAT_RATE) using the existing
   `VAT_RATE` util (`src/lib/utils/vat.ts`), computed at display/print
   time, never stored. A per-document toggle hides the EX VAT column.
3. **Prices are per kg**, matching the product's stored buy price (what a
   cashier keys into a purchase). Footer text is free-editable per document.
4. **Logo saved once, reused.** Uploaded to R2 via the existing upload
   route with a new `price_list_logo` context; the R2 key is stored in
   `SystemSettings` under key `price_list_logo_key`. Each document has a
   `showLogo` toggle. Replaceable anytime from the builder page.
5. **Photo removal is UI-only.** The Product Photo box on
   `purchases/new` is removed (including its state/upload code in that
   page); the purchase-photo API and photos on historical purchases remain
   untouched and still display elsewhere (purchase details, photos module,
   police register).

## Logo Rules

- Accepted: PNG, JPG/JPEG, WebP. Max file size 2 MB (rejected at upload
  with a clear error).
- Rendered at a fixed max height — 60 pt on the PDF, ~90 px on screen —
  width scaled from the image's own aspect ratio.
- Width additionally capped at 40% of the printable page width; an image
  exceeding the cap is scaled down further (never cropped, never
  distorted).
- If no logo is uploaded or `showLogo` is off, the header simply omits it
  (company name/title layout unchanged).

## Schema Changes

### Prisma (`prisma/schema.prisma` + migration)

```prisma
model PriceList {
  id                   String          @id @default(uuid())
  tenantId             String
  title                String          @default("TODAY'S PRICES")
  listDate             DateTime        // date printed on the document
  footerText           String          @default("Prices subject to change without notice. VAT rate applied as per current legislation.")
  showLogo             Boolean         @default(true)
  showExVat            Boolean         @default(true)
  isActiveForPurchases Boolean         @default(false)
  createdByUserId      String?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt
  items                PriceListItem[]

  @@index([tenantId])
  @@index([tenantId, isActiveForPurchases])
}

model PriceListItem {
  id          String    @id @default(uuid())
  tenantId    String
  priceListId String
  productId   String?   // nullable: free-text lines allowed
  displayName String
  priceIncVat Decimal   @db.Decimal(18, 2)
  sortOrder   Int       @default(0)
  priceList   PriceList @relation(fields: [priceListId], references: [id], onDelete: Cascade)
  product     Product?  @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([tenantId, priceListId])
}
```

`Product` gains the back-relation `priceListItems PriceListItem[]`.

**Active-list invariant:** at most one `PriceList` per tenant has
`isActiveForPurchases = true`. Enforced in the service: activation runs in a
single transaction that clears the flag on all others then sets it on the
target. Deleting the active list leaves no active list (purchases panel
shows its placeholder).

### Zod (`src/lib/schemas/priceList.ts`)

- `PriceListItemSchema`: `productId` (uuid, optional/nullable),
  `displayName` (min 1, max 80), `priceIncVat` (positive, ≤ 2 dp,
  validated as string/number then handled as Decimal server-side),
  `sortOrder` (int ≥ 0).
- `CreatePriceListSchema`: `title` (min 1, max 80), `listDate` (date
  string), `footerText` (max 500, may be empty), `showLogo`, `showExVat`
  (booleans), `items` (array of `PriceListItemSchema`, min 1, max 200).
- `UpdatePriceListSchema`: same shape, full-replace of items on update
  (delete + recreate inside one transaction — documents are small, and
  full-replace keeps ordering/removal logic trivial), plus `updatedAt`
  for optimistic locking (same pattern as expenses).

## Service (`src/lib/services/priceListService.ts`)

- `listPriceLists()` — id, title, listDate, item count, active flag,
  updatedAt; newest first.
- `getPriceList(id)` — with ordered items.
- `createPriceList(input, userId)` / `updatePriceList(id, input)` —
  single transaction (header + items).
- `duplicatePriceList(id, userId)` — copies header (title suffixed
  " (copy)", listDate = today, `isActiveForPurchases: false`) and items.
- `deletePriceList(id)` — hard delete (cascade removes items). Price
  lists are display documents, not financial records; the audit
  middleware records the deletion.
- `activatePriceList(id)` — transaction: clear all actives, set target.
- `getActivePriceList()` — active list with items, or null.
- All monetary values handled with Decimal.js; no floats.

## API Routes

| Route | Methods | Auth |
|---|---|---|
| `/api/price-lists` | GET (list), POST (create) | GET: any session; POST: admin/manager |
| `/api/price-lists/active` | GET | any session (cashier panel) |
| `/api/price-lists/[id]` | GET, PATCH, DELETE | GET: any session; writes: admin/manager |
| `/api/price-lists/[id]/activate` | POST | admin/manager |
| `/api/price-lists/[id]/pdf` | GET | any session |
| `/api/price-lists/logo` | GET (current key/url), PUT (set after R2 upload), DELETE | GET: any; writes: admin/manager |

Every route checks session (and role for writes) before logic; inputs Zod-
validated; errors logged with pino and returned typed. The R2 upload itself
reuses `POST /api/r2/upload` with `context: 'price_list_logo'` (added to
that route's allowed contexts, enforcing the 2 MB/image-type rules).

## Builder UI

### Toolbar (`src/components/layout/AppShell.tsx`)

Products module toolbar gains **Price Lists** (icon: `ReceiptText`,
manager-only, `href: '/app/products/price-lists'`), alongside Add
Product / Categories / Bulk Price. On the price-lists pages the toolbar
shows **New Price List** (primary) and **Products** (back-link,
secondary) following the Stock module's sibling-page pattern.

### List page (`src/app/app/(modules)/products/price-lists/page.tsx`)

DataTable of documents: Title, Date, Items (count), Active badge (green
"Shown in Purchases"), Updated. Row actions: Edit, Duplicate, Print / PDF
(opens `/api/price-lists/[id]/pdf` in a new tab), Set as Today's List
(hidden when already active), Delete (danger, confirm dialog). A small
logo card above the table shows the current saved logo with
Upload/Replace/Remove controls and the size rules as hint text.

### Editor page (`src/app/app/(modules)/products/price-lists/[id]/page.tsx`)

`[id]` = `new` for creation, else edit. Layout:

- **Header fields:** Title, List Date (date input, default today), Footer
  Text (textarea), toggles: Show logo, Show EX VAT column.
- **Add products:** a product picker (search select) adding one product
  per pick, and an "Add category…" select that appends all active
  products of that category not already on the list. Categories can be
  freely combined on one document.
- **Items table:** rows with drag-free reorder (up/down arrow buttons,
  consistent with the app's compact style), Display Name (editable text,
  pre-filled with product name), INC VAT price (editable, pre-filled from
  `defaultBuyPrice`), computed EX VAT preview (read-only, live), Remove.
  Free-text row via an "Add custom line" button (no product link).
- **Footer actions:** Save, Save & Print, Cancel. Save validates via Zod
  client-side before POST/PATCH.

## PDF Template (`src/lib/pdf/priceList.ts`)

pdf-lib, A4 portrait, mirroring the reference sheet:

- Header: logo (per Logo Rules) left, company name (from tenant/session
  company info, gold `#C9A227`-style accent as per reference) and page
  number right.
- Title block: list title (large, bold, centered) + list date.
- Table: MATERIAL | INC VAT | EX VAT (EX VAT column omitted when
  `showExVat` is false; MATERIAL column widens). Currency prefix "E"
  (Emalangeni) consistent with the app's other documents' conventions;
  amounts to 2 decimal places via Decimal.
- Rows flow to additional pages automatically with repeated table header.
- Footer: `footerText` centered, small type.

## Purchases Integration (`src/app/app/(modules)/purchases/new/page.tsx`)

- Remove: photo state (`photoFile`, `photoPreview`, `photoInputRef`), the
  Product Photo box in the right column, and the post-create photo upload
  block. Scale 1 / Scale 2 untouched.
- Add in its place a **Today's Prices** panel filling the remaining right-
  column height: fetches `/api/price-lists/active` via SWR; renders the
  list title's date (highlighted amber when older than today, so a stale
  list is visible at a glance) and a compact scrollable table — Display
  Name | INC | EX (EX only when the document's `showExVat` is on) — sized
  for the 250 px column (small type, monospace prices).
- Empty state: "No price list selected — set one in Products → Price
  Lists."

## Testing

Vitest unit tests for `priceListService` following existing service test
patterns:

1. Create persists header + items in order; prices stored as Decimal
   strings.
2. Activate sets target and clears any previously active list (single
   transaction).
3. Duplicate copies items, resets active flag, re-dates to today.
4. Update replaces items atomically; optimistic-lock conflict rejected.
5. EX VAT computation helper: E230.00 INC → E200.00 EX at 15%.

## Out of Scope

- Thermal printing of price lists (A4 PDF only, like other documents).
- Per-document logo overrides (single saved logo).
- Price list history/versioning beyond the audit log.
- Any change to purchase-photo APIs or historical photo display.
