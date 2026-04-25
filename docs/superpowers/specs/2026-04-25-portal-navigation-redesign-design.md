# Portal & Navigation Redesign — Design Spec

**Date:** 2026-04-25  
**Project:** RecycleProX Basic  
**Status:** Approved for implementation

---

## Goal

Replace the current dashboard (stats cards + quick-links) with a full-screen tile launcher ("the portal") that mirrors the legacy desktop home screen. Each module becomes an independent page with only its own sub-feature buttons in the top toolbar. Navigation between the portal and modules uses a breadcrumb.

---

## 1. Routing Architecture

The portal must render without the AppShell chrome (no top toolbar, no module nav). To achieve this cleanly in Next.js App Router, we use route groups inside `src/app/app/`:

```
src/app/app/
├── (portal)/
│   ├── layout.tsx          ← auth-only, no AppShell
│   └── dashboard/
│       └── page.tsx        ← portal home (URL: /app/dashboard)
└── (modules)/
    ├── layout.tsx          ← existing layout.tsx moved here (auth + AppShell)
    ├── expenses/
    ├── purchases/
    ├── customers/
    └── ... (all other existing module folders)
```

**Why route groups:** Next.js App Router layouts stack; there is no per-page layout override. Route groups (`(portal)` and `(modules)`) let each section define its own layout without affecting the URL.

**Migration steps:**
1. Create `src/app/app/(portal)/layout.tsx` — auth check + SessionProvider only (no AppShell)
2. Move `src/app/app/dashboard/` → `src/app/app/(portal)/dashboard/`
3. Create `src/app/app/(modules)/layout.tsx` — copy of current `src/app/app/layout.tsx`
4. Move all remaining module folders under `(modules)/`
5. Delete `src/app/app/layout.tsx` (replaced by the two group layouts)

Login redirect (`/app/dashboard`) remains unchanged.

---

## 2. Portal Home Page (`/app/dashboard`)

### Layout

Standalone full-screen page — no AppShell. The page renders its own 3-zone structure:

```
┌─────────────────────────────────────────────────────┐
│ TOP BAR: ⊞ RecycleProX          John Smith · Admin  │
│                                              Log Out  │
├─────────────────────────────────────────────────────┤
│ STATS STRIP: Today's Purchases | Cash-Up | Sales | ⏱ │
├─────────────────────────────────────────────────────┤
│                                                       │
│   TILE GRID (4 columns, colour-grouped)               │
│                                                       │
├─────────────────────────────────────────────────────┤
│ FOOTER: RecycleProX Management Software · v3.0        │
└─────────────────────────────────────────────────────┘
```

### Stats Strip

Fetches from `/api/reports/today` (existing endpoint already used by the current dashboard):
- **Today's Purchases** — sum of purchases created today (amber)
- **Cash-Up Status** — Open / Closed badge (green/red)
- **Today's Sales** — sum of sales created today (amber)
- **Timestamp** — current date + time (client-side, auto-updates every minute)

### Tile Grid

4-column CSS grid, tiles grouped by colour. All 15 tiles always shown. Tiles for unbuilt modules render dimmed (opacity 0.45) with a "Coming Soon" badge and no click handler.

**Colour groups and tiles:**

| Colour | Group | Tiles |
|--------|-------|-------|
| Navy `#1B3A6B` | Customers & Transactions | Accounts, Casual Details, Purchases, Unpaid Purchases |
| Blue `#185ABD` | Sales & Payments | Sales, Sales Payments, Photo Viewer, Weighbridge |
| Green `#217346` | Stock & Products | Stock Level Grid, Products, Top Product Prices, Reports |
| Amber `#C9A020` | Finance | Cash Up, Expenses, Float |
| Grey `#374151` | System | Settings |

**Unbuilt tiles** (Coming Soon): Casual Details, Photo Viewer, Weighbridge, Top Product Prices, Float, Loans (if shown)

Each tile: icon (lucide SVG, not emoji — matches production icon set), bold label, small subtitle, hover highlight, click → `router.push(href)`.

### Tile Definitions

| Label | Icon | Subtitle | Href |
|-------|------|----------|------|
| Accounts | `Users` | Customers & Dealers | `/app/customers` |
| Casual Details | `UserRound` | Walk-in Sellers | `/app/casual` |
| Purchases | `ShoppingCart` | Buy Scrap | `/app/purchases` |
| Unpaid Purchases | `AlertCircle` | Outstanding Balances | `/app/purchases/unpaid` |
| Sales | `Tag` | Sell Stock | `/app/sales` |
| Sales Payments | `CreditCard` | Record Payments | `/app/payments` |
| Photo Viewer | `Image` | ID & Purchase Photos | `/app/photos` |
| Weighbridge | `Scale` | Scale Integration | `/app/weighbridge` |
| Stock Level Grid | `Package` | Inventory View | `/app/stock` |
| Products | `ClipboardList` | Catalogue & Pricing | `/app/products` |
| Top Product Prices | `TrendingUp` | Price Groups | `/app/price-groups` |
| Reports | `BarChart2` | Analytics & Exports | `/app/reports` |
| Cash Up | `Archive` | Daily Reconciliation | `/app/cashup` |
| Expenses | `Wallet` | Record & Approve | `/app/expenses` |
| Float | `Landmark` | Opening & Closing | `/app/float` |
| Settings | `Settings` | System Configuration | `/app/settings` |

---

## 3. Module Pages — AppShell Changes

### Breadcrumb Navigation

The AppShell title bar currently shows the module name as static text. Change it to a breadcrumb:

```
⊞  Portal ›  Expenses
```

- "Portal" is a `<Link href="/app/dashboard">` styled as a muted clickable link
- "›" is a separator
- Module name is bold, current colour — not a link

This replaces Option B selected during brainstorming (breadcrumb style).

### Toolbar — Per-Module Buttons Only

The existing `useToolbarButtons(activeTab, role, pathname)` hook already handles per-path overrides (expenses done). Extend this pattern to every module. Remove the tab-based (`TabId`) system entirely — replace with pathname-driven lookup.

New signature:
```ts
function useToolbarButtons(pathname: string, role: string): ToolbarButton[]
```

Toolbar button definitions per module:

| Module path | Buttons |
|-------------|---------|
| `/app/customers*` | Add Account |
| `/app/purchases*` | New Purchase, View Unpaid |
| `/app/sales*` | New Sale |
| `/app/payments*` | Record Payment |
| `/app/expenses*` | Add Expense, Add Expense Type |
| `/app/cashup*` | Open Cash-Up |
| `/app/stock*` | Stocktake |
| `/app/products*` | Add Product, Price Groups |
| `/app/price-groups*` | Add Price Group |
| `/app/reports*` | *(no buttons — report selection is inline)* |
| `/app/settings*` | *(no buttons — settings are inline)* |
| `/app/photos*` | *(no buttons)* |
| `/app/casual*` | Add Casual |
| `/app/float*` | Open Float |
| `/app/loans*` | Add Loan |
| `/app/police-register*` | *(no buttons)* |
| `/app/audit-log*` | *(no buttons)* |
| `/app/stocktake*` | *(no buttons)* |

---

## 4. Content Fitting

Each module page should not require vertical scrolling to reach primary content. Guidelines:

- Tables use a fixed-height scrollable container (`flex-1 overflow-auto`) rather than expanding the page height
- Modals handle form entry — the list page itself stays stable
- Stats/summary row (if any) stays above the fold
- The AppShell content zone uses `h-full flex flex-col` so the table fills available height

No changes to page content logic — only layout/sizing adjustments where tables currently overflow the viewport.

---

## 5. Files to Create / Modify

| File | Action |
|------|--------|
| `src/app/app/(portal)/layout.tsx` | CREATE — auth + SessionProvider only |
| `src/app/app/(portal)/dashboard/page.tsx` | CREATE — portal tile grid page |
| `src/app/api/reports/today/route.ts` | EXISTING — already provides today's totals |
| `src/app/app/(modules)/layout.tsx` | CREATE — copy of current app layout |
| `src/app/app/layout.tsx` | DELETE — replaced by group layouts |
| `src/app/app/dashboard/` | MOVE → `(portal)/dashboard/` |
| `src/app/app/expenses/`, `customers/`, etc. | MOVE → `(modules)/` subfolders |
| `src/components/layout/AppShell.tsx` | MODIFY — breadcrumb, pathname-driven toolbar |

---

## 6. Out of Scope

- Building the Weighbridge, Float, or Photo Viewer modules (Coming Soon tiles only)
- Changing any existing module's internal layout or data logic
- Role-based tile visibility (all users see all tiles; access control remains on the module page itself)
- Dark mode or theme switching
