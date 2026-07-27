# Renovo Pro — UI Inventory (Phase 0 Discovery)

Read-only discovery pass. No code was changed. This is the raw map that Phase 1/2 judgment (AUDIT.md) is built on.

**Coverage note:** this pass is 100% static-code reading (Read/Grep/Glob across the repo). No dev server was started and no browser screenshots were taken — per this project's established working convention, the user verifies running UI in-browser themselves rather than having Claude drive a dev server/Playwright session. Every finding below is a claim about source code, not about rendered pixels; visual-only defects (actual color rendering, real layout breakage, true contrast ratios) are not verifiable from this pass and are called out as such where relevant.

---

## 1. Route map

44 `page.tsx` files + 8 `layout.tsx` files under `src/app`.

| Route | File | Purpose | Page type |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Redirect to `/app/dashboard` | redirect (no UI) |
| `/login` | `src/app/login/page.tsx` + `LoginForm.tsx` | Main portal login | auth |
| `/gate` | `src/app/gate/page.tsx` (+ `layout.tsx`, `GateClientLayout.tsx`) | Guard Station kiosk — visitor check-in/out | wizard/kiosk |
| `/gate/login` | `src/app/gate/login/page.tsx` | Guard login | auth |
| `/scale` | `src/app/scale/page.tsx` (+ `layout.tsx`, `ScaleClientLayout.tsx`) | Scale Station kiosk — weigh-in workflow | wizard/kiosk |
| `/scale/login` | `src/app/scale/login/page.tsx` | Operator login | auth |
| `/scale/admin` | `src/app/scale/admin/page.tsx` (+ `layout.tsx`) | Scale admin dashboard | dashboard |
| `/scale/admin/orders` | `src/app/scale/admin/orders/page.tsx` | Scale order management + void | list/dialog-heavy |
| `/police` | `src/app/police/page.tsx` (+ `layout.tsx`) | Officer Portal — register search, log visit (**stated reference design**, see rpx/styles.ts:1-11) | dialog-heavy kiosk |
| `/app/dashboard` | `src/app/app/(portal)/dashboard/page.tsx` (+ `(portal)/layout.tsx`) | Portal home | dashboard |
| `/app/customers` | `.../customers/page.tsx` | Customer accounts list | list |
| `/app/customers/[id]` | `.../customers/[id]/page.tsx` | Customer profile (tabs: transactions/loans/business-loans) | detail |
| `/app/customers/new` | `.../customers/new/page.tsx` | Add-account form | form |
| `/app/casual` | `.../casual/page.tsx` | Casual (walk-in) sellers list | list |
| `/app/casual/[id]` | `.../casual/[id]/page.tsx` | Casual seller detail | detail |
| `/app/purchases` | `.../purchases/page.tsx` | Purchases list + inline detail/void | list |
| `/app/purchases/new` | `.../purchases/new/page.tsx` (1338 lines) | POS-style purchase entry (weigh, price, pay) | wizard |
| `/app/purchases/[id]` | `.../purchases/[id]/page.tsx` | Purchase detail | detail |
| `/app/purchases/unpaid` | `.../purchases/unpaid/page.tsx` | Unpaid purchases + payment | list |
| `/app/sales` | `.../sales/page.tsx` | Sales list + inline detail/void | list |
| `/app/sales/new` | `.../sales/new/page.tsx` (1298 lines) | POS-style sale entry | wizard |
| `/app/sales/[id]` | `.../sales/[id]/page.tsx` | Sale detail | detail |
| `/app/sales/unpaid` | `.../sales/unpaid/page.tsx` | Unpaid sales + payment | list |
| `/app/products` | `.../products/page.tsx` | Product catalogue CRUD, bulk pricing | list/dialog-heavy |
| `/app/price-groups` | `.../price-groups/page.tsx` | Customer pricing tiers | list/dialog |
| `/app/stock` | `.../stock/page.tsx` | Stock on hand | list |
| `/app/stock/grid` | `.../stock/grid/page.tsx` | Opening/purchased/sold/closing grid | list/report |
| `/app/stock/movements` | `.../stock/movements/page.tsx` | Stock movement ledger | list |
| `/app/stocktake` | `.../stocktake/page.tsx` | Stocktake sessions list | list |
| `/app/stocktake/[id]` | `.../stocktake/[id]/page.tsx` | Count-entry workspace | dialog-heavy/form |
| `/app/cashup` | `.../cashup/page.tsx` (1290 lines) | Daily cash reconciliation | dashboard/dialog-heavy |
| `/app/float` | `.../float/page.tsx` | Till float management | dashboard |
| `/app/expenses` | `.../expenses/page.tsx` | Expenses list (tabs: pending/approved/all) | list/dialog-heavy |
| `/app/expenses/[id]` | `.../expenses/[id]/page.tsx` | Expense detail + attachments | detail |
| `/app/payments` | `.../payments/page.tsx` | Unified payment ledger | list |
| `/app/payments/balances` | `.../payments/balances/page.tsx` | Outstanding customer balances | list |
| `/app/audit-log` | `.../audit-log/page.tsx` | Admin audit trail | list |
| `/app/reports` | `.../reports/page.tsx` + `_components/*` | Report catalog + viewer | master-detail/dashboard |
| `/app/photos` | `.../photos/page.tsx` | Photo/document gallery | card gallery |
| `/app/police-register` | `.../police-register/page.tsx` | Register admin (generate/history) | tabbed form+list |
| `/app/settings` | `.../settings/page.tsx` | System settings | form |
| `/app/settings/users` | `.../settings/users/page.tsx` | User management | list/dialog-heavy |
| `/app/change-password` | `.../change-password/page.tsx` | Forced password change | form |
| `/app/support` | `.../support/page.tsx` | Support tickets | list/chat |

Layouts: `src/app/layout.tsx` (root), `app/(portal)/layout.tsx`, `app/(modules)/layout.tsx`, `gate/layout.tsx`, `scale/layout.tsx`, `scale/admin/layout.tsx`, `police/layout.tsx`.

**Shell families (confirmed structurally distinct, not just visually):**
1. **Main portal** (`/app/*`) — wrapped in `AppShell` (title bar / contextual toolbar / content / taskbar).
2. **Kiosk apps** (`/gate`, `/scale`, `/police`) — standalone, each hand-rolls its own header; **no shared kiosk-chrome component exists between them** despite being conceptually siblings (confirmed: Gate uses a navy gradient header, Scale uses a flat slate-900 header, Police builds a third bespoke navy header — three different implementations of "kiosk title bar").
3. **Scale admin** (`/scale/admin/*`) — confirmed to receive **zero shell** at all (its layout is an auth gate only); each admin page reinvents its own nav row independently.
4. **Auth pages** (`/login`, `/gate/login`, `/scale/login`) — three independent hand-rolled full-screen auth layouts, no shared auth-shell component.

---

## 2. Component layer

54 files under `src/components`. Key findings on duplication/bypass (all confirmed via grep+read, not estimated):

| Primitive | Canonical / intended | Bypassed by | Evidence |
|---|---|---|---|
| Button | `src/components/rpx/Btn.tsx` (63 importing files) — flat grey `BAR_GRAD`, 3px/2px radius split, hover = color swap | `src/components/ui/button.tsx` (shadcn/base-ui, 12 importing files: `AppSidebar`, `AdminPinUnlockModal`, `CustomerLookupWidget`, `AccountSelectorPanel`, `CasualSelectorPanel`, `LicenseGate`, `PhotoUploader`, `PinLockOverlay`, `ui/alert-dialog.tsx`, `ui/dialog.tsx`, `ui/sheet.tsx`, `users/SetPinModal.tsx`) — rounded-lg, 24/28/32/36px heights, oklch colors, `active:translate-y-px` | Two button visual languages coexist; dialog/sheet primitives render the modern one even on pages whose toolbar is the flat-grey house button |
| Input | `src/components/ui/input.tsx` (30px, 2px radius, `#ABABAB` border, focus `#0078D7`) + duplicate raw CSS rule in `globals.css:112-137` (same metrics, same focus blue) | `rpx/styles.ts` `inp` object (30px, 2px radius, `#ABABAB` border, focus **`#185ABD`** via `colors.borderFocus`) | Same visual spec, implemented 3 times, with the focus-ring blue drifting between two of the three (`#0078D7` vs `#185ABD`) |
| Status badge | `statusStyle()` in `design-tokens.ts:365-390` + `StatusBadge` in `components/ui/DataTable.tsx` | At least **7 independent local re-implementations** found so far: `stocktake/[id]/page.tsx:51-63`, `expenses/[id]/page.tsx:28-40`, `police-register/page.tsx:252-264`, `settings/users/page.tsx:38-58` (×3: Pin/Status/Role badges), `scale/admin/components/StatusBadge.tsx` — each with slightly different padding/radius/border | `statusStyle()` is confirmed used correctly in exactly **one** page across ~35 pages audited so far (`support/page.tsx:145`) |
| Header/toolbar gradient | `HEADER_GRAD`, `BAR_GRAD` exported from `src/components/rpx/styles.ts:18,20` | Hand-typed byte-identical (or near-identical) literals in ≥10 files: `stocktake/[id]/page.tsx:435,527`, `expenses/[id]/page.tsx:244`, `cashup/page.tsx:232,243`, `sales/[id]/page.tsx`, `sales/new/page.tsx:429,442`, `purchases/[id]/page.tsx`, `purchases/new/page.tsx:539,552`, `customers/new/page.tsx:378`, `components/ui/DataTable.tsx:228`, `components/customers/CustomerProfileModal.tsx:78,147`, `police/page.tsx:315,581,731,914` | The one canonical constant pair exists and is correctly imported in some files (`audit-log`, `police-register`, `settings`, `reports/_components`) but bypassed in at least as many others |
| Money formatting | `styles.moneyPositive/moneyNegative/moneyNeutral` in `design-tokens.ts:274-290` | **Confirmed dead code** — zero usages anywhere in `src/app/app/(modules)` (grep-verified). Every money value hand-rolls `fontFamily:'monospace'` + manually chosen `colors.action`/`danger`/`textPrimary` per call site | Codebase has the right abstraction; nothing uses it |
| Category picker | `components/products/CategoryFilterSelect.tsx` (well-built, uses `useProductCategories`) | `products/page.tsx:195-204` hand-builds its own equivalent `<select>` instead of importing the existing component | Shared component exists, sits unused, next to a duplicate |
| Printer setup wizard | `scale/components/PrinterSetup.tsx` (shipped, wired into `ScaleClientLayout.tsx:8,177`) | `scale/components/printer/PrinterSetupWizard.tsx` + 4 step files — a **complete second implementation**, exported via `printer/index.ts`, confirmed **never imported anywhere** (dead code) | Two competing implementations of the same feature; the unused one even disagrees internally on accent color (mixes blue and emerald) vs. the shipped one (emerald-only) |
| Confirm/void dialogs | `RpxDialogContent/Header/Body/Footer` (`rpx/Dialog.tsx`) | `price-groups/page.tsx` uses `useConfirm()` (`components/ui/ConfirmDialog`) instead; `scale/admin/orders/page.tsx` hand-rolls raw `fixed inset-0 bg-black/50` modals with no `role="dialog"`/focus trap at all | Three different "are you sure" mechanisms in the app |
| Tabs | Folder-tab `TabStrip` via `PortalPage tabs=` (Expenses, Police Register) | AppShell-toolbar route-buttons swapping `Btn` variant (Stock/Grid/Movements); in-page `Btn` row swapping variant (Photos) | Three visual metaphors for "switch view," no shared component |

**rpx/ folder contents** (the house design-system folder): `Btn.tsx`, `BtnMenu.tsx`, `Dialog.tsx`, `Drawer.tsx`, `primitives.tsx`, `styles.ts`, `index.ts`.

---

## 3. Design tokens — declared vs. observed

### 3a. Two parallel systems (confirmed structural fact, not a metaphor)

1. **`src/lib/design-tokens.ts`** — the real, actively-used system. Exports `colors` (40+ named hex values), `tw` (Tailwind class aliases mapped to `tailwind.config.ts`'s `rpx.*` palette), `fontSize` (7 steps, 11–24px), `fontWeight` (4 steps), `fontFamily` (`"Segoe UI", -apple-system, Arial, sans-serif`), `spacing` (4px-multiple scale), `layout` (`cardRadius:8`, `btnRadius:3`, `inputRadius:2`, `tableRowH:30`, `navbarH:48`, `toolbarH:36`, `contentPadding:24`), `styles` (pre-built style objects — **partly dead code**, see §2), `statusStyle()`. Consumed via inline `style={{}}` in the overwhelming majority of pages.
2. **shadcn OKLCH tokens** in `src/app/globals.css:36-96` (`--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar-*`, plus a `.dark` variant block that is **never activated** — no `dark` class toggle found anywhere in the app; the entire dark-mode block is unreachable code). Consumed only by `src/components/ui/*` primitives (button, input\*, select, textarea, sheet, dialog, alert-dialog) via `tailwind.config.ts:12-46`'s color mapping.

\*`ui/input.tsx` is a partial exception — it overrides the OKLCH system with hardcoded arbitrary values (`#ABABAB`, `#0078D7`) matching the house look, rather than using `--input`/`--ring`.

### 3b. Gradients — every distinct value found

| Gradient value | Where | Canonical? |
|---|---|---|
| `linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)` | `HEADER_GRAD` (rpx/styles.ts:18); retyped in `DataTable.tsx:228`, `CustomerProfileModal.tsx:78`, `police/page.tsx` ×4, `purchases/new/page.tsx:539`, `cashup/page.tsx:232,243` | Yes (the constant), but bypassed in ≥6 places |
| `linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)` | `BAR_GRAD` (rpx/styles.ts:20); retyped in `stocktake/[id]/page.tsx:435,527`, `purchases/new/page.tsx:552`, `expenses/[id]/page.tsx:244` (as its non-BAR_GRAD sibling, see below) | Yes (the constant), but bypassed |
| `linear-gradient(180deg,#F5F5F5 0%,#EBEBEB 100%)` | `LoansTab.tsx:218` | No — one-off |
| `linear-gradient(180deg,#F5F5F5 0%,#ECECEC 100%)` | `sales/[id]/page.tsx:203,209,217`, `purchases/[id]/page.tsx:216,224` | No — one-off (4th variant of the "light grey strip" idea) |
| `linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)` | `purchases/new/page.tsx:1302`, `sales/new/page.tsx:1142` | No — one-off (5th variant) |
| `linear-gradient(180deg,#FAFAFA 0%,#F0F0F0 100%)` | `CustomerProfileModal.tsx:147` | No — one-off (6th variant) |
| `linear-gradient(180deg,#10B981 0%,#059669 100%)` | `LoansTab.tsx:162,202` | Green action gradient — not defined as a constant anywhere |
| `linear-gradient(180deg,${colors.violet} 0%,#6B21A8 100%)` | `BusinessLoanTab.tsx:195,217` | Violet gradient, half-token (`colors.violet`) half-literal (`#6B21A8`) |
| `linear-gradient(180deg, #14294A 0%, #0F203A 100%)` | `GateClientLayout.tsx:36` | Gate kiosk header — a 4th navy value alongside `colors.primary` (#1B3A6B), Gate login's radial navy, and Scale's flat slate-900 |
| `radial-gradient(ellipse at 50% 0%, #1B3A63 0%, #0F203A 60%)` | `gate/login/page.tsx:67,76` | A 5th navy value |
| `bg-gradient-to-br` (Tailwind, colors from adjacent classes) | `dashboard/page.tsx:94` | Class-based mechanism, different from every inline-style gradient above |
| `linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,#fff 25%,#fff 75%,#ddd 75%)` | `settings/page.tsx:103` | **Not a chrome gradient** — a transparency-checkerboard swatch behind a logo-preview image. Correctly out of scope for "gradient set" purposes. |

**Total: at least 11 distinct gradient value-pairs found** (excluding the checkerboard, which is a different category), against a target of "≤6, all from one canonical set" — confirms the audit brief's predicted finding.

### 3c. Colors — key drift points (not an exhaustive hex dump; the load-bearing drifts)

- **Danger red**: `colors.danger` `#C0392B` (design-tokens.ts, correct usage e.g. `LoginForm.tsx:103`) vs. `#DC3545` (police/page.tsx, `rpx/primitives.tsx:16` — used in the *stated reference* file) vs. raw Tailwind `red-50/500/600/700` (all of Gate, Scale kiosk, Scale admin modals) — **at least 3 independent "red" systems**.
- **Focus blue**: `#0078D7` (`globals.css:134`, `ui/input.tsx:12`) vs. `#185ABD` (`colors.borderFocus`/`colors.process`, `design-tokens.ts:28,58`, used in `rpx/styles.ts` `inp`).
- **"Positive money" green**: `colors.action` `#10b981` (design-tokens.ts) vs. hand-rolled `#217346` used for the conceptually identical value in `purchases/new/page.tsx:859,1088,1177`, `ProcessPaymentModal.tsx`, `products/page.tsx` — two greens for "money going the right way," inconsistent even within the purchases module itself (`purchases/[id]/page.tsx` correctly uses `colors.action`, `purchases/new/page.tsx` doesn't).
- **Warning/amber**: `colors.warning`/`warningBg` (`#C9A020`/`#FEF9EC`) vs. `colors.alertBg/alertBorder/alertIcon/alertText` (a *second*, deliberately-separate amber family per the code comment at `design-tokens.ts:96-108`) vs. a **third, undocumented amber/orange system** used only in the four payment modals (`SplitPaymentModal`, `ProcessPaymentModal`, `RecordPaymentModal`, `SaleSplitPaymentModal`): `#FFF8E1`, `#FFE082`, `#F57F17`, `#FFF3E0`, `#FFCC80`, `#E65100`, `#EF6C00`.
- **Row hover blue**: `DataTable.tsx` hovers rows to `#D6E8FF`, which does **not** match `colors.rowHover` (`#EBF3FC`) — the shared table implementation itself drifts from its own design-tokens file.
- **Change-password strength meter**: uses raw Tailwind `red-500/amber-500/blue-500/green-500`/`green-700`/`gray-300`/`gray-500` — a fourth ad hoc palette, matching neither design system.

### 3d. Typography

- Declared font stack: `"Segoe UI", -apple-system, Arial, sans-serif` (`design-tokens.ts:203`, `globals.css:33`, applied at the `AppShell` root via `fontFamily: 'var(--rpx-font, system-ui)'`, `AppShell.tsx:639`).
- Declared scale: 11/12/13/14/16/20/24px (`fontSize` object) — a genuinely small, dense, desktop-appropriate ramp (consistent with a 12px Win7-body-text target), and it **is** the scale actually used across most audited pages via `fontSize.xs/sm/base/md/lg/xl/2xl`.
- Money/reference values additionally set `fontFamily: 'monospace'` — but as established in §2, this is hand-rolled per call-site (100+ occurrences across the batches audited) rather than drawn from `styles.moneyPositive` etc., so the *value* is consistent even though the *mechanism* isn't.
- No blue Windows-7-style "main instruction" text color (`#003399`) found anywhere in the codebase (confirmed via grep for `003399`, zero hits) — headings are uniformly `colors.textPrimary` (near-black) or `NAVY`/`colors.primary`, never the dialog/wizard main-instruction blue the Win7 baseline calls for.
- Links: no dedicated `colors.link` token exists; in-content links found so far use `colors.process` (`#185ABD`) or ad hoc blue Tailwind classes, generally without an underline-on-hover rule (contradicts the Win7 `#0066CC` + hover-underline convention, though this needs a dedicated Phase-1 pass to quantify across the full page set).

### 3e. Control heights / radii

| Element | House value | Confirmed deviations |
|---|---|---|
| Buttons (rpx `Btn`) | `btnPrimary` 3px radius, `btnSecondary`/`btnDanger` 2px radius — **inconsistent within the same component** | shadcn `ui/button.tsx`: `rounded-lg` (~8-10px), heights 24/28/32/36px — an entirely different scale used in 12 files |
| Inputs | 30px height, 2px radius (`ui/input.tsx`, `globals.css`, `rpx/styles.ts` `inp`) | Gate/Scale kiosk inputs: `rounded-xl` (12px), `py-3` (~48-52px) — kiosk touch-target sizing, a legitimate but undocumented departure |
| Table rows | 30px (`layout.tableRowH`, enforced by `DataTable.tsx` + rpx `TD`/`TH`) | `audit-log/page.tsx` hand-rolled table: 32px (confirmed outlier in the "list of records" comparison group). `cashup/page.tsx` recon ledger: 24-26px. Police Register nested sub-table: 24px. |
| Cards/panels | `layout.cardRadius:8` (Tailwind `tw.card` = `rounded-lg`) **vs.** `rpx` `PANEL`/`CARD_BORDER` = 3px radius — **two different "card" radii co-declared in the same design-tokens file**, used inconsistently depending on which system a page pulls from | Dialog surfaces (`rpx/Dialog.tsx:40`, `RpxDialogContent`) hardcode 10px radius — a third value matching neither |
| Toolbar/navbar height | `layout.toolbarH:36` declared, but `AppShell.tsx:706` actually uses `var(--rpx-toolbar-h, 32px)` — the CSS var default (32px) and the JS constant (36px) disagree with each other | — |

---

## 4. Chrome / surfaces

- **Aero glass**: `backdrop-blur`/`backdrop-filter` found in exactly 5 places, all as **modal/lock-screen scrim overlays**: `ui/sheet.tsx:31`, `ui/dialog.tsx:34`, `ui/alert-dialog.tsx:24`, `PinLockOverlay.tsx:62`, `LicenseGate.tsx:69`. **Zero** instances used as true window-chrome/title-bar Aero glass. This is the single largest structural gap against the stated target aesthetic: the app currently has no glass anywhere in its actual window chrome.
- **Window frame**: `AppShell`'s Zone 1 title bar is a flat solid navy (`#1B3A6B`, no gradient, no rounded top corners, no visible outer shadow) — none of the "rounded top corners (~6px), square bottom, 1px frame border, soft outer shadow" Win7 window-frame cues are present.
- **Cards vs. dialog/panel language**: the main portal (`/app/*`) genuinely favors the panel/table/dialog-strip language over floating drop-shadowed cards for its data screens (confirmed: zero usages of `@/components/ui/card` anywhere in `src/app` or `src/components`, grep-verified) — this is a real point in the app's favor relative to the brief's "stacked drop-shadowed cards are the single strongest SaaS tell" warning. However `LoginForm.tsx` (`rounded-lg` + `shadow-lg` card) and the Gate/Scale kiosk step screens (`rounded-xl`/`rounded-2xl` + `shadow-sm`/`shadow-md` cards) both do use the modern floating-card pattern — so the "no cards" discipline holds for the back-office portal but not for the auth/kiosk entry points.
- **Icons**: 100% `lucide-react` (305 occurrences / 58 files, grep-verified), a monoline stroke set — the visual opposite of glossy/perspective Win7 icons, used with total consistency (no second icon library found) except one literal Unicode `▲`/`▼` pair in `audit-log/page.tsx:234` where every structurally-identical case elsewhere (`police-register/page.tsx:311`) correctly uses lucide `ChevronDown`/`ChevronRight`.
- **Toasts**: `sonner` used ~57+ times codebase-wide (112 confirmed just within the back-office batch D files) — a persistent, app-wide reliance on a UI pattern with no Win7 equivalent. Per the audit brief this needs to be surfaced as a decision to confirm, not silently accepted; see AUDIT.md.

---

## 5. Coverage

**Read in full (all 4 parallel research passes completed):** root/login, Gate module (layout + 7 step components), Scale module (kiosk + admin + printer wizard, including the unused `PrinterSetupWizard` tree), Police module, purchases (all 4 pages + 2 modals), sales (all 4 pages + 2 modals), products, price-groups, stock (3 pages), stocktake (2 pages), cashup, float, expenses (2 pages), payments (2 pages), audit-log, reports (page + `_components`), photos, police-register, settings (2 pages), change-password, support, portal shell (`AppSidebar.tsx`, `BannerBar.tsx`, `(portal)/layout.tsx`, `dashboard/page.tsx`, `(modules)/layout.tsx`), customers module (list/detail/new + `components/customers/*`), casual module (list/detail), `CustomerLookupWidget.tsx`, `PinLockOverlay.tsx`, `LicenseGate.tsx` — plus `design-tokens.ts`, `rpx/styles.ts`, `rpx/Btn.tsx`, `AppShell.tsx`, `ui/button.tsx`, `ui/input.tsx`, `globals.css`, `tailwind.config.ts`. Every route in the §1 map and every component in `src/components` has now been read by at least one pass. Nothing was skipped.

## 6. Additions from the portal-shell/customers pass

- **`src/components/AppSidebar.tsx` is dead code.** Grep for `AppSidebar` returns only its own definition — it is never imported or rendered. `AppShell` is the sole live shell. Worth deleting: it's a full second nav-rail implementation (its own 3rd button lineage via shadcn `ui/button`, its own unused green accent palette) that will mislead anyone who greps for "the sidebar" later.
- **`BannerBar` is wired into `(modules)/layout.tsx:26` only** — absent from `(portal)/layout.tsx`. The dashboard (`/app/dashboard`) is the one route in the app that never shows a platform banner (subscription/maintenance notices), and also the one route with no `LicenseGate` and no `WindowedContent`/`PageTitleBar` — `WindowedContent.tsx:18` hard-codes `if (pathname === '/app/dashboard') return`, confirming this is deliberate ("the dashboard is the desktop, not a window") but it is still a real shell fork worth the lead auditor's attention.
- **Dashboard tile grid** (`dashboard/page.tsx`) is the single largest aesthetic outlier of any *live* route: 16 tiles, `rounded-xl` (~12px, vs. house 2-3px), diagonal `bg-gradient-to-br` (vs. every other gradient in the app being vertical 180deg), and a `hover:shadow-xl hover:scale-[1.02]` / `active:scale-[0.97]` interaction — a genuine glow+scale hover, the *only* one in the audited codebase, but it reads as a Windows 8/10 Start-tile launcher, not Win7 Aero glass.
- **A 4th button lineage confirmed**: `AccountSelectorPanel.tsx` and `CasualSelectorPanel.tsx` each independently define a `legacyBtn` style literal (explicitly commented "Legacy grey toolbar-button look"), and the two hand-copies don't even match each other (32px vs. 28px height). This is on top of the already-documented `rpx/Btn` (house) vs. `ui/button.tsx` (shadcn) split — the button system is now confirmed to have **4 independent implementations**: `rpx/Btn`, shadcn `ui/button`, the "legacy" hand-copied literal (2 non-matching versions), and ad hoc gradient `<button>` elements used for the Loans/Business-Loan tabs' primary CTAs (`LoansTab.tsx:162,202`, `BusinessLoanTab.tsx:195,217` — these bypass every button component entirely).
- **`PinLockOverlay.tsx` and `LicenseGate.tsx` are the single highest-priority finding in the whole audit.** These two full-screen overlays gate access to the entire application (PIN lock, license block) and are **100% shadcn/Tailwind styled with zero relationship to the house style**: `rounded-2xl` cards, `shadow-2xl`, `bg-gray-900/95 backdrop-blur` scrim, `h-12` keypad buttons. Neither uses the `Dialog` primitive every ordinary CRUD modal gets for free — both are raw `fixed inset-0` divs with no `role="dialog"`, no focus trap, and (on `PinLockOverlay`) an unlabeled icon-only backspace button. The two most security-critical, most-frequently-seen surfaces in the app are also its least Aero-committed and least accessible.
- **"Create a customer" has at least 6 different button/dialog-title labels** across the module: *Add Account*, *Add Customer*, *Create Customer*, *Quick Create*, *Quick Create Customer*, *Confirm →* — see AUDIT.md findings for the copy-consistency writeup.
- Confirmed **2 more independent local badge/Pill re-implementations** (`customers/page.tsx` `PrimaryFunctionBadge`/`DealerCategoryBadge`, `customers/[id]/page.tsx` `Pill`, `CustomerProfileModal.tsx` `Pill`) on top of the 7+ already found in the back-office batch — the `statusStyle()`/`StatusBadge` duplication problem is app-wide, not confined to one module.
- **Button order is reversed on the one full-page form found in this pass**: `customers/new/page.tsx:380-381` renders `Save` (primary) *before* `Cancel` — the opposite of every dialog/modal footer sampled elsewhere in the app (Cancel-left, primary-right).
