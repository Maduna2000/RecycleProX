# Price lists scoped to Price Groups — design

Date: 2026-08-14

## Problem

Scrap prices change daily, and different dealer tiers (Price Groups: Casual,
Dealer 1/2/3, or any custom group) can be paid different rates via
`PriceGroupProductOverride`. Today's price list feature has exactly one
tenant-wide "active" list (`PriceList.isActiveForPurchases`), shown as a
read-only reference on the New Purchase screen regardless of which customer
is selected. There's no way to publish different daily prices per price
group, and no way for the reference panel to reflect the specific customer's
pricing tier.

## Existing pricing mechanics this must plug into (do not change)

- `resolvePrice(productId, priceGroupId)` in `productService.ts`: no group →
  `Product.defaultBuyPrice`/`defaultSellPrice`; a group → its
  `PriceGroupProductOverride` if one exists, else the same product default.
- `Customer.priceGroupId` is nullable. `dealerCategory: 'casual'` always
  means `priceGroupId: null`. `dealer_1`/`dealer_2`/`dealer_3` auto-resolve
  to whichever `PriceGroup` has that `dealerTier`. A customer can also be
  assigned an arbitrary custom `PriceGroup` directly.
- `PriceGroup.isDefault` exists today but is purely cosmetic (pins one group
  to the top of pickers, blocks its deletion) — this design gives it real
  meaning: it's the fallback scope for Casual customers and for "no customer
  selected yet".

## Decisions made

- **Casual has no scope of its own.** Every price list is scoped to a real
  `PriceGroup`. A Casual customer (or no customer selected) resolves to
  whichever group is flagged `isDefault` — reusing the existing flag rather
  than inventing a null-scope concept.
- **"Import from a price group" is a one-time copy**, not a live link — same
  pattern as the existing Duplicate action. Prices are pre-filled once, then
  the list is edited independently (daily scrap prices need manual tuning
  regardless of what a group override says).
- **No new "import" button.** Selecting a Price Group on the editor just
  changes what `addProduct`/`addCategory` resolve prices *from* going
  forward — the existing add-product/add-category/custom-line workflow is
  otherwise untouched.
- **Switching a list's Price Group after adding items does not retroactively
  reprice existing rows** — only affects items added afterward. Avoids
  silently overwriting hand-tuned prices.
- **One active list per Price Group**, not one tenant-wide — enforced at the
  DB level with a partial unique index, mirroring the existing "at most one
  open CashUp session" pattern.
- **Fallback chain on the Purchases screen**: customer's own group's active
  list → if none, the `isDefault` group's active list → if none, empty
  state (same as today's "no price list selected").
- Existing production price lists backfill to whichever group is currently
  flagged `isDefault` (confirmed one exists).

## 1. Schema

`PriceList` gains `priceGroupId String` (required FK to `PriceGroup`).
`isActiveForPurchases` stays a plain `Boolean`; its invariant moves from
"one active list tenant-wide" to "one active list per `(tenantId,
priceGroupId)`", enforced via a partial unique index (Postgres can't express
`WHERE` in a Prisma-level `@@unique`, so this is raw SQL in the migration,
same as `CashUp_tenantId_one_open_key`).

**Migration (single file):**
1. Add `priceGroupId` nullable + FK.
2. Backfill: `UPDATE "PriceList" SET "priceGroupId" = (SELECT id FROM "PriceGroup" WHERE "PriceGroup"."tenantId" = "PriceList"."tenantId" AND "isDefault" = true LIMIT 1)`.
3. Alter `priceGroupId` to `NOT NULL`.
4. Drop the old `@@index([tenantId, isActiveForPurchases])`.
5. `CREATE UNIQUE INDEX "PriceList_tenantId_priceGroupId_one_active_key" ON "PriceList"("tenantId", "priceGroupId") WHERE "isActiveForPurchases" = true;`

## 2. Service layer (`priceListService.ts`)

- `getActivePriceList()` → `getActivePriceListForCustomer(customerPriceGroupId: string | null)`. Tries the customer's own group's active list first; falls back to the `isDefault` group's active list if the customer has no group, or if their group has no active list of its own; returns `null` if neither resolves.
- `activatePriceList`: the clear-then-set `updateMany` scopes its `where` to `priceGroupId: target.priceGroupId` instead of every list tenant-wide.
- `createPriceList`/`updatePriceList`: accept and persist `priceGroupId`.
- `duplicatePriceList`: copy carries the source's `priceGroupId`.
- `listPriceLists`: accepts an optional `priceGroupId` filter param.

## 3. Schema validation (`lib/schemas/priceList.ts`)

`CreatePriceListSchema` gains `priceGroupId: z.string().uuid()` (required).
`UpdatePriceListSchema` continues to `.extend()` it — no `.partial()`
landmine risk since the field is required either way.

## 4. API

- `GET /api/price-lists?priceGroupId=` — optional filter, threaded to `listPriceLists`.
- `GET /api/price-lists/active?priceGroupId=` — optional, threaded to `getActivePriceListForCustomer`.
- `POST`/`PATCH /api/price-lists` — no route changes beyond schema validation picking up the new required field.
- Everything else (PDF, preview, duplicate, activate, logo) unchanged at the route level.

## 5. Editor UI (`products/price-lists/[id]/page.tsx`)

- New required "Price Group" `<select>` in the Document panel, populated
  from `GET /api/price-groups` (already exists, already sorts `isDefault`
  first). Pre-selects the `isDefault` group on a brand-new list.
- `addProduct`/`addCategory` become async: instead of always seeding
  `priceExVat` from `product.defaultBuyPrice`, they call
  `GET /api/products/:id?priceGroupId=<selected group>` (the same endpoint
  `resolveProductPrice` already uses elsewhere in the app) to get the
  group-resolved price. "Add whole category" resolves each product's price
  in parallel.
- Everything else (reorder, custom lines, per-row editing, INC VAT column,
  preview, colors, save/print) is unchanged.

## 6. List page (`products/price-lists/page.tsx`)

- New "Price Group" column showing each list's group name.
- "Shown in Purchases" badge becomes group-qualified (e.g. "Today's List ·
  Dealer 1") since multiple lists can be simultaneously active now.
- New `FilterBar` with a Price Group filter `<select>`, matching the
  Purchases/Sales list pages' existing filter pattern.
- "Set as Today's List" action is unchanged from the manager's side — the
  per-group scoping happens server-side.

## 7. Purchases screen (`TodaysPricesPanel.tsx` + `PurchaseForm.tsx`)

- `TodaysPricesPanel` gains an optional `priceGroupId: string | null` prop;
  its SWR key becomes `` `/api/price-lists/active${priceGroupId ? `?priceGroupId=${priceGroupId}` : ''}` ``
  so switching customers refetches automatically.
- `PurchaseForm` passes `customer?.priceGroupId ?? null` down — `customer`
  state already carries `priceGroupId` today (used for line-item price
  resolution), so this is threading an existing value, not sourcing a new
  one.
- Visual behavior, stale-list warning, and empty state are unchanged; only
  *which* list resolves changes.

## Testing

`tsc` + lint clean before commit, per this project's established flow — no
dev-server/Playwright pass. Scenarios worth exercising by hand: creating and
independently activating a Dealer 1 list and a Casual/default-group list;
selecting a Dealer 1 account customer on New Purchase and confirming the
panel switches; a Casual customer falling back to the default group's list;
a Dealer 2 customer when Dealer 2 has no active list, confirming fallback;
duplicating a list and confirming the copy keeps its group; the new Price
Group filter and column on the list page.
