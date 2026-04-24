# Customer Account Enhancements — Design Spec
**Date:** 2026-04-24  
**Status:** Approved

---

## 1. Problem & Goal

The current customer model treats all account holders the same. In practice the yard deals with two very different supplier types — formal scrap yards (with VAT numbers, trading licences, company registrations) and informal street sellers — plus multiple dealer pricing tiers. The system needs to:

- Classify customers by market sector and dealer category
- Auto-assign price groups based on dealer category
- Filter the purchase product list to only the commodities a supplier trades in
- Support zero-rated VAT per customer
- Capture company details and banking details at account creation time
- Store compliance documents (trading licences, SARS certs, etc.) against the account

---

## 2. Decisions Made

| Question | Decision |
|---|---|
| Parent company structure | Option A — one account per company, `companyName` + `contactPerson` fields (already exist) |
| Formal vs Informal | Drives behaviour — prices, VAT, document requirements |
| Dealer categories | Auto-assign price group (Dealer 1 → Group A, 2 → B, 3 → C, Casual → default) |
| Product filtering | Strictly hidden — only matching commodities shown at purchase |
| Payment mode | No restriction — banking details captured on account for EFT use |
| Account creation UX | Full-page form (`/app/customers/new`) with required section + collapsible optional sections; documents uploaded after save |

---

## 3. Schema Changes

### 3.1 New Enums

```prisma
enum MarketSector {
  formal
  informal
}

enum DealerCategory {
  casual
  dealer_1
  dealer_2
  dealer_3
}

enum CustomerDocumentType {
  trading_licence
  sars_certificate
  company_registration
  id_copy
  other
}
```

### 3.2 Customer Model — New Fields

```prisma
model Customer {
  // ... existing fields unchanged ...

  // NEW
  marketSector    MarketSector?
  dealerCategory  DealerCategory?
  zeroRated       Boolean          @default(false)

  documents       CustomerDocument[]
}
```

`marketSector` and `dealerCategory` are optional so existing customers are unaffected until updated.

### 3.3 New CustomerDocument Model

```prisma
model CustomerDocument {
  id             String               @id @default(uuid())
  customerId     String
  customer       Customer             @relation(fields: [customerId], references: [id], onDelete: Cascade)
  documentType   CustomerDocumentType
  r2Key          String
  fileName       String
  notes          String?
  uploadedAt     DateTime             @default(now())
  uploadedByUserId String?

  @@index([customerId])
}
```

### 3.4 Dealer Category → Price Group Auto-Assignment

When `dealerCategory` is set on a customer, the API automatically resolves and assigns `priceGroupId` by looking up a price group whose `name` matches the dealer level. Convention:

| Dealer Category | Price Group Name |
|---|---|
| `dealer_1` | `Dealer 1` |
| `dealer_2` | `Dealer 2` |
| `dealer_3` | `Dealer 3` |
| `casual` | clears priceGroupId (uses default prices) |

Price groups must be pre-created in the system with those names. If no matching group exists, `priceGroupId` is left unchanged (no silent failure — API returns a warning in the response).

---

## 4. New Account Creation Page

**Route:** `src/app/app/customers/new/page.tsx`  
**Accessible from:** "New Account" toolbar button on the Customers tab

### 4.1 Page Structure

```
/app/customers/new
├── Page header: "← Customers / New Account"  +  [Cancel]  [Save Account]
│
├── ★ REQUIRED DETAILS (blue border — always visible, cannot collapse)
│     ID Number*, First Name*, Last Name*, Phone*
│     Market Sector* (Formal / Informal pill toggle)
│     Dealer Category* (dropdown → shows auto-assigned price group below)
│
├── 🏢 Company Details (collapsible, optional)
│     Company Name, Contact Person, VAT Number, Company Reg No
│
├── 🏷️ Classification & VAT (collapsible, optional)
│     Zero-Rated VAT toggle (yellow highlight, clear label)
│     Primary Function dropdown, Credit Limit
│
├── 🪙 Trade Commodities (collapsible, optional)
│     Checkbox grid — Ferrous, Non-Ferrous, Copper, Aluminium,
│     Plastic, Paper, E-Waste, Batteries, Stainless Steel, Lead,
│     Brass, Iron, Catalytic Converters, Other
│
├── 🏦 Banking Details (collapsible, optional)
│     Bank Name, Account Number, Branch Code
│
└── 📎 Documents (locked until account saved)
      Shows 4 upload slots: Trading Licence, SARS Certificate,
      Company Registration, Other
      Unlocks and becomes functional after Save Account
```

### 4.2 Save Behaviour

- **Save Account** validates required fields only; all optional sections can be empty
- On success → redirects to `/app/customers/[id]` (the new account's detail page)
- Documents section unlocks on the detail page after save
- Duplicate ID number → shows inline error with link to existing customer (same as current modal)

### 4.3 Keep Existing Quick-Create Modal

`CreateCustomerModal.tsx` stays unchanged for quick creation from the purchase/sale screen customer lookup widget. The new page is only for the Customers section.

---

## 5. Purchase Screen — Product Filtering

**File:** `src/app/app/purchases/new/page.tsx`

### 5.1 Current Behaviour
Products fetched via `GET /api/products?active=true` — all products returned, no filtering.

### 5.2 New Behaviour

After customer is selected:

1. Read `customer.tradeCommodities` (string array, e.g. `["Ferrous","Non-Ferrous"]`)
2. Map commodity names to `ProductCategory` enum values
3. Filter the already-fetched product list client-side to only products whose `category` is in the mapped set
4. If `customer.tradeCommodities` is empty or null → show all products (no restriction)
5. Show a small info badge: `"Showing Ferrous, Non-Ferrous products for this account"` with an "Show all" override link for edge cases

### 5.3 Commodity → ProductCategory Mapping

```ts
const COMMODITY_MAP: Record<string, ProductCategory[]> = {
  'Ferrous':            ['ferrous'],
  'Non-Ferrous':        ['non_ferrous'],
  'Copper':             ['copper'],
  'Aluminium':          ['aluminium'],
  'Plastic':            ['plastic'],
  'Paper / Cardboard':  ['paper'],
  'E-Waste (Electronics)': ['e_waste'],
  'Batteries':          ['other'],   // no dedicated category — shows under Other
  'Stainless Steel':    ['ferrous', 'non_ferrous'],
  'Lead':               ['non_ferrous'],
  'Brass':              ['non_ferrous'],
  'Iron':               ['ferrous'],
  'Catalytic Converters': ['other'],
  'Other':              ['other'],
}
```

Filtering is client-side only — no API change needed. Products are already fetched; we just filter the array before rendering the dropdown.

### 5.4 Dealer Price Group

When customer has `priceGroupId` set (auto-assigned via dealer category), price lookup already works via existing `GET /api/products/[id]?priceGroupId=...` — no change needed.

### 5.5 Zero-Rated VAT

When `customer.zeroRated === true`:
- The VAT line item is hidden from the purchase totals
- No VAT is calculated or stored on the purchase
- A `ZERO RATED` badge appears on the customer info row

Implementation: pass `customer.zeroRated` into the purchase form state and conditionally render/calculate VAT. Exact VAT calculation hook is in `src/lib/services/purchaseService.ts` — check there before implementation.

---

## 6. Document Uploads

**New API routes:**

```
POST   /api/customers/[id]/documents        — upload a document (presign R2 + create record)
GET    /api/customers/[id]/documents        — list documents for customer
DELETE /api/customers/[id]/documents/[docId] — delete document (remove R2 object + DB record)
```

Document upload uses the same R2 presigned URL pattern already used for ID photos and purchase photos.

**Document types displayed:**
- Trading Licence
- SARS Certificate
- Company Registration
- ID Copy
- Other (free-label)

**UI location:** Documents tab on the customer detail page (`/app/customers/[id]`). A new "Compliance Documents" sub-section sits above the existing "ID Photo" section.

---

## 7. Customer Detail Page Updates

**File:** `src/app/app/customers/[id]/page.tsx`

The Overview tab gains two new display rows in the "Business Details" section:

```
Market Sector:    [Formal] badge  /  [Informal] badge
Dealer Category:  [Dealer 1] badge  +  "Price Group A" sub-label
Zero-Rated VAT:   [Zero Rated] yellow badge  /  "VAT Applied" grey
```

The Documents tab is enhanced with a "Compliance Documents" sub-section showing uploaded files with type labels, upload date, and delete action.

---

## 8. Zod Schema Updates

**File:** `src/lib/schemas/customer.ts`

Add to `CreateCustomerSchema` and `UpdateCustomerSchema`:

```ts
marketSector:   z.enum(['formal','informal']).optional(),
dealerCategory: z.enum(['casual','dealer_1','dealer_2','dealer_3']).optional(),
zeroRated:      z.boolean().optional().default(false),
```

New schema for document upload:
```ts
export const UploadCustomerDocumentSchema = z.object({
  documentType: z.enum(['trading_licence','sars_certificate','company_registration','id_copy','other']),
  fileName:     z.string().min(1),
  notes:        z.string().optional(),
})
```

---

## 9. Files to Create / Modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add enums, fields, CustomerDocument model |
| `prisma/migrations/...` | Auto-generated migration |
| `src/lib/schemas/customer.ts` | Add new fields + UploadCustomerDocumentSchema |
| `src/app/app/customers/new/page.tsx` | **CREATE** — full-page account creation form |
| `src/app/app/customers/[id]/page.tsx` | Show new fields; enhance Documents tab |
| `src/app/api/customers/route.ts` | Handle marketSector, dealerCategory (auto-assign priceGroupId), zeroRated |
| `src/app/api/customers/[id]/route.ts` | Same for update |
| `src/app/api/customers/[id]/documents/route.ts` | **CREATE** — list + upload documents |
| `src/app/api/customers/[id]/documents/[docId]/route.ts` | **CREATE** — delete document |
| `src/app/app/purchases/new/page.tsx` | Filter products by tradeCommodities; show/hide VAT for zeroRated |
| `src/components/layout/AppShell.tsx` | Update "New Account" toolbar button `href` from modal trigger to `/app/customers/new` |

---

## 10. Verification

1. Create a new account → full-page form loads at `/app/customers/new`
2. Fill required fields only → save succeeds, redirects to customer profile
3. Set Dealer 1 → Price Group A badge appears immediately; `priceGroupId` saved correctly
4. Set Formal + commodities Ferrous + Non-Ferrous → go to new purchase → only ferrous/non-ferrous products in dropdown
5. Customer with no commodities → all products show
6. Toggle Zero-Rated VAT → go to purchase → VAT line hidden, totals correct
7. After saving account → Documents tab → upload Trading Licence → appears in list
8. Delete document → removed from R2 and DB
9. Edit existing customer → new fields visible and editable in edit modal
10. Casual customer (informal, no commodities) — purchase flow unchanged from today
