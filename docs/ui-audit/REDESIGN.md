# Renovo Pro — Redesign List

Pages/areas where [`BACKLOG.md`](./BACKLOG.md)'s patch-level fixes aren't enough because the underlying **pattern**, not just the tokens, is wrong. Each entry: why the current structure fails, the Win7 pattern that replaces it, and a proposed layout. These are scoping proposals for the lead auditor to approve — no code has been written against any of them.

Not every page that scored below 3 in [`AUDIT.md`](./AUDIT.md)'s Aero-commitment table is here — several of those (audit-log, payments/balances, settings/users, reports, price-groups, `PinLockOverlay`/`LicenseGate`) just need an existing pattern applied correctly, which is why they're in `BACKLOG.md` instead. This list is only the cases where no correct pattern exists yet in the codebase to apply.

---

## 1. Auth entry points — `/login`, `/gate/login`, `/scale/login`

**Why it fails:** three independent hand-rolled full-screen layouts (`LoginForm.tsx`, `gate/login/page.tsx`, `scale/login/page.tsx`), each a `rounded-lg`/`shadow-lg` or `rounded-2xl`/`shadow-2xl` centered card — the generic modern-SaaS auth pattern, unrelated to the house style, with three separate places to fix if the look ever changes. (`/login` does get the one thing right nobody else does — correct `htmlFor`/`id` label association — which the replacement must preserve.)

**Win7 pattern:** a Task Dialog — centered, `CARD_BORDER`/`BAR_GRAD` chrome at 3px radius, the new `colors.mainInstruction` blue for the "Sign in to continue" line, fields via `inp`/`lbl`, button row bottom-right.

```
┌──────────────────────────────────────────┐
│   [navy background — reuse KIOSK_HEADER_GRAD  │
│    for kiosk logins, or plain colors.bg for   │
│    the main portal login]                     │
│                                                │
│         ┌────────────────────────┐            │
│         │ ▓▓ logo    Renovo Pro  │ <- BAR_GRAD strip, CARD_BORDER
│         ├────────────────────────┤
│         │  Sign in to continue    │ <- colors.mainInstruction (#003399)
│         │                          │
│         │  Username   [________]   │ <- inp + lbl, htmlFor preserved
│         │  Password   [________]   │
│         │  [ ] Show password       │
│         │                          │
│         │  [error banner if any]   │ <- colors.dangerBg/danger
│         │                          │
│         │              [Sign in]   │ <- Btn variant="primary", bottom-right
│         └────────────────────────┘
└──────────────────────────────────────────┘
```

**Proposal:** one shared `AuthShell`/`AuthCard` component, parameterized by title + kiosk-vs-portal background, used by all three. Carries the `htmlFor` discipline outward as a side effect of consolidation rather than a separate accessibility task.

---

## 2. Gate + Scale kiosk workflows

**Why it fails:** the two kiosks that should read as siblings share no chrome (`GateClientLayout.tsx:36`'s gradient navy header vs. `ScaleClientLayout.tsx:111`'s flat `slate-900`), no accent hue (Gate = `blue-600`, Scale = emerald), and — more importantly than the color mismatch — neither implements an actual Aero Wizard command layout. Every step is a full-bleed mobile-web screen with one "Continue →" button; there is no back arrow, no explicit Cancel, and no consistent place a command row lives.

**Win7 pattern:** the Aero Wizard — back arrow at top-left of the frame, blue main-instruction text, step content, Back/Next command buttons bottom-right. Kiosk touch-target sizing (48px+ tap zones) is a legitimate, worth-keeping departure from the 30px desktop control height — the fix is applying Aero *visual* language on top of the existing touch-friendly sizing, not shrinking targets to desktop scale.

```
┌────────────────────────────────────────────────┐
│ ← [KIOSK_HEADER_GRAD strip]    Guard Station     │ <- shared header/back-arrow, both kiosks
│    ●───●───○───○───○  (step progress)            │
├────────────────────────────────────────────────┤
│                                                  │
│   Visitor details                                │ <- colors.mainInstruction
│   Enter the visitor's name and purpose           │
│                                                  │
│   First name *  [________________]              │ <- kiosk-scale inp (48px+), Aero chrome
│   Last name  *  [________________]              │
│   Vehicle reg   [________________]              │
│                                                  │
├────────────────────────────────────────────────┤
│                              [ Back ]  [ Next → ]│ <- bottom-right command row, both kiosks
└────────────────────────────────────────────────┘
```

**Proposal:** extract one `KioskShell` (header + step-progress + bottom command bar), parameterized by accent color (kept distinct per module, unlike the header which should be shared) and consumed by both Gate and Scale. This also gives Scale's admin section (§3 below) something to sit inside instead of building its own nav from scratch.

---

## 3. Scale admin — `/scale/admin`, `/scale/admin/orders`

**Why it fails:** `scale/admin/layout.tsx:4-10` is an auth check with zero chrome — the two pages under it each independently reinvent their own top nav, and the result (raw Tailwind slate dashboard, hand-rolled `fixed inset-0 bg-black/50` modals with no `role="dialog"`) has no relationship to the rest of the app at all. This is the only `0`-scoring live route in the whole audit.

**Win7 pattern:** the standard Explorer list/details pattern already used correctly elsewhere in the app — breadcrumb/address bar, a simple command/nav bar, `DataTable` for the orders list, `RpxDialogContent` for the void/detail modals.

```
┌──────────────────────────────────────────────────┐
│ Scale Admin › Orders                    [Export]  │ <- breadcrumb + command bar
├──────────────────────────────────────────────────┤
│ [Dashboard]  [Orders]                              │ <- simple nav shared by both pages
├──────────────────────────────────────────────────┤
│ Order #   Customer    Product    Qty    Status     │ <- DataTable, HEADER_GRAD header, 30px rows
│ ────────────────────────────────────────────────  │
│ ...rows, StatusBadge from statusStyle()...         │
└──────────────────────────────────────────────────┘
```

**Proposal:** either wrap `/scale/admin/*` in `AppShell` directly (if it's meant to be an extension of the main portal a manager can reach), or build a minimal `ScaleAdminShell` sharing the breadcrumb/command-bar language if it needs to stay a separate surface — either way, replace the raw modals with `RpxDialogContent` and the table with `DataTable`. This is the largest single-area rebuild on this list; budget it as its own pass rather than folding it into a token/control batch.

---

## 4. Dashboard — `/app/dashboard`

**Why it fails:** 16 `rounded-xl` tiles in a fixed 4×4 grid, diagonal `bg-gradient-to-br` fills (the app's only diagonal gradients — everything else is vertical 180°), and a `hover:shadow-xl hover:scale-[1.02]` / `active:scale-[0.97]` interaction — the app's only glow+scale hover. Functionally fine, but it reads as a Windows 8/10 Start-menu tile launcher, not a Win7 desktop or Control Panel.

**Win7 pattern:** Control Panel "category view" — grouped sections with a small icon + label row per item, not large glossy tiles. The existing color-grouping logic (navy/blue/green/amber per functional area) maps cleanly onto category section headers instead of per-tile background colors.

```
┌────────────────────────────────────────────────┐
│ Welcome, Simiso · admin   Purchases R X  Sales R Y │ <- existing AppShell stats strip, keep as-is
├────────────────────────────────────────────────┤
│  Sales & Purchases                                │ <- category header, BAR_GRAD strip
│   🛒 Purchases     💰 Sales     📋 Unpaid           │ <- icon + label row, 2-3px radius, flat hover
│                                                    │
│  Stock & Inventory                                │
│   📦 Stock On Hand   🔄 Movements   ▦ Grid           │
│                                                    │
│  Back Office                                       │
│   🧾 Expenses   💳 Payments   📊 Reports             │
└────────────────────────────────────────────────┘
```

**Proposal:** keep the existing tile registry/data (module list, icons, disabled/"coming soon" state) — only the visual container changes from a tile grid to a categorized list. Lowest-risk redesign on this list since no new data model is needed, only new markup around existing data.

---

## 5. Purchases/new & Sales/new (POS entry wizards)

**Why it fails:** these are the most-used screens in the app and the ones furthest from any wizard pattern despite being the most wizard-shaped workflows in the product (weigh → price → pay). Neither has a back or cancel control anywhere — confirmed structurally: the single footer action bar in each contains exactly one button ("Submit"/"Save Sale"). The only way "back" is the global breadcrumb, which discards in-progress entry with no confirmation.

**Win7 pattern:** retrofit the existing footer bar with an explicit Cancel beside the primary submit button. Given the two-column layout (line items + scale/photo) is already a reasonable dense desktop-forms layout, this doesn't need a full step-wizard rebuild — just the missing command-row half of the Aero Wizard pattern.

```
┌──────────────────────────────────────────────────┐
│ [title bar: Casual/Account toggle, GRV, Invoice]   │
├──────────────────────────┬───────────────────────┤
│  Line items                │  Scale reading         │
│  ...                       │  [LCD-style readout]   │ <- keep, it's a genuine Aero-adjacent touch
│                             │  Photo capture         │
├──────────────────────────┴───────────────────────┤
│ Sub total   R x      VAT R y     Total R z           │
├──────────────────────────────────────────────────┤
│                          [ Cancel ]   [ Submit → ]  │ <- add Cancel; currently missing entirely
└──────────────────────────────────────────────────┘
```

**Proposal:** add a Cancel button (with a confirm-dialog if line items are already entered, to avoid silent data loss) beside the existing Submit/Save button in both wizards. Bundle with `BACKLOG.md` Batch-1's gradient cleanup for these two files, since both changes touch the same footer region.

---

## Explicitly out of scope for this pass

- **`CustomerProfileModal.tsx` vs. the real `customers/[id]` page** — whether the app should keep a full parallel modal implementation of the customer-detail view, or delete it in favor of always navigating to the real page, is a product/scope decision (does anything rely on being able to view a customer profile without leaving the current page context?), not a pattern the audit can resolve unilaterally. Flagged in `AUDIT.md`'s page-by-page notes; needs the lead's call before either patching or deleting it.
