# Renovo Pro — UI Remediation Backlog

Derived from [`AUDIT.md`](./AUDIT.md)'s findings. Ordered into 6 batches by type (per the audit's own batching scheme); within each batch, tasks are ordered by priority = `severity × pages affected ÷ effort` (rough scoring, shown per task). Each task is self-contained and executable in one pass with the exact files it touches listed. Do not start a batch until the previous one is approved and re-verified — re-run the audit's consistency matrix after each batch; regressions should surface immediately there.

---

## BATCH-1 — Tokens & gradients

Pure token-file and magic-literal changes. No component API changes, no layout changes. Lowest risk in the whole backlog.

1. **[Priority 88] Rebuild `colors.action`** (FND-015, root cause in [TOKENS.md §1](./TOKENS.md#1-canonical-color-palette)) — change `design-tokens.ts:26` from `#10b981` to `#217346`; update `colors.actionHover` (`:122`) to a darkened variant (e.g. `#1a5c38`). Verify every consumer of `colors.action`/`actionBg`/`actionHover` still reads correctly (badges, `statusStyle()` STATUS_MAP, money values) — this is a token-value change, not a call-site change, so it should ripple for free.
   *Files:* `src/lib/design-tokens.ts`

2. **[Priority 53] Import `HEADER_GRAD`/`BAR_GRAD` everywhere a byte-identical literal exists** (FND-003) — replace hand-typed `linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)` and `linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)` with the imported constants.
   *Files:* `components/ui/DataTable.tsx:228`, `app/police/page.tsx:315,581,731,914`, `(modules)/purchases/new/page.tsx:539,552`, `(modules)/sales/new/page.tsx:429,442`, `(modules)/cashup/page.tsx:232,243`, `(modules)/stocktake/[id]/page.tsx:435,527`, `components/customers/CustomerProfileModal.tsx:78`

3. **[Priority 24] Collapse the 4 near-identical grey gradient one-offs onto `HEADER_GRAD`/`BAR_GRAD`** (FND-003) — these aren't byte-identical but are close enough to become the constant with no meaningful visual change.
   *Files:* `components/customers/LoansTab.tsx:218`, `components/customers/BusinessLoanTab.tsx:230`, `(modules)/sales/[id]/page.tsx:203,209,217`, `(modules)/purchases/[id]/page.tsx:216,224`, `(modules)/purchases/new/page.tsx:1302`, `(modules)/sales/new/page.tsx:1142`, `components/customers/CustomerProfileModal.tsx:147`

4. **[Priority 18] Reconcile the two focus/selection blues onto `colors.borderFocus` (`#185ABD`)** (FND-005) — update the two declaring sites, then fix the two call sites that reused `#0078D7`/`#185ABD` directly as data/selection colors rather than through the token.
   *Files:* `src/app/globals.css:134`, `src/components/ui/input.tsx:12`, `(modules)/customers/new/page.tsx:296`, `(modules)/customers/page.tsx:188`

5. **[Priority 18] Reconcile `police/page.tsx`'s private danger red (and the rest of its off-token palette) onto `colors.danger`/`warning*`/`process*`** (FND-011, FND-017) — this is the codebase's stated reference file; fixing it here means every future "copy the police page" effort starts from a token-correct base.
   *Files:* `src/app/police/page.tsx` (11 occurrences of `#DC3545`), `src/components/rpx/primitives.tsx:16`, plus the success/warning/info one-offs cataloged in [TOKENS.md §1](./TOKENS.md#1-canonical-color-palette)

6. **[Priority 15] Collapse the 4 payment modals' undocumented amber/orange palette onto `colors.alert*`** (part of FND-015/color cleanup) — visual change should be minimal since `colors.alertBg`/`alertBorder`/`alertIcon`/`alertText` already exist for this exact "loan/alert banner" purpose.
   *Files:* `components/purchases/SplitPaymentModal.tsx`, `ProcessPaymentModal.tsx`, `components/sales/SaleSplitPaymentModal.tsx`, `RecordPaymentModal.tsx`

7. **[Priority 12] Fix the `#217346` hand-rolled "money green" call sites to import `colors.action`** (FND-015) — after task 1 these are numerically equal, but importing removes the duplicate source of truth going forward.
   *Files:* `(modules)/purchases/new/page.tsx:859,1088,1177`, `components/purchases/ProcessPaymentModal.tsx`, `(modules)/products/page.tsx`

8. **[Priority 6] Add `colors.mainInstruction` (`#003399`) and `colors.link` (`#0066CC`) tokens; apply to `styles.pageTitle`/`sectionTitle`** ([TOKENS.md §3](./TOKENS.md#3-type-ramp-mostly-correct--one-real-gap)) — the single cheapest, highest-signal typographic change available; currently zero pages use Win7's main-instruction blue.
   *Files:* `src/lib/design-tokens.ts` (add tokens + update `styles.pageTitle`/`sectionTitle`, `:293-304`)

9. **[Priority 4] Fix the change-password strength meter's raw-Tailwind palette** (part of FND-015 color cleanup) — swap `red-500`/`amber-500`/`blue-500`/`green-500` for the equivalent `colors.*` tokens.
   *Files:* `(modules)/change-password/page.tsx:19-22,114-115`

---

## BATCH-2 — Controls (buttons, inputs, radii, heights)

Component-level, not just token-level. Higher blast radius than Batch 1 but still visual-only where scoped correctly.

1. **[Priority 32] Consolidate the button system down to one component** (FND-001) — restyle `ui/button.tsx`'s class strings to match `rpx/Btn`'s spec (or route `Dialog`/`Sheet`/`AlertDialog` footers through `Btn` directly); delete both `legacyBtn` copies in `AccountSelectorPanel.tsx`/`CasualSelectorPanel.tsx` in favor of `Btn`; convert the 4 ad hoc gradient `<button>` CTAs to `<Btn variant="primary">`.
   *Files:* `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/sheet.tsx`, `components/AppSidebar.tsx` (or delete it, see Batch 3), `components/CustomerLookupWidget.tsx`, `components/PhotoUploader.tsx`, `components/PinLockOverlay.tsx` (superseded by Batch 3's rebuild), `components/business-loans/AdminPinUnlockModal.tsx`, `components/users/SetPinModal.tsx`, `components/customers/AccountSelectorPanel.tsx:9-15`, `components/customers/CasualSelectorPanel.tsx:10-16`, `components/customers/LoansTab.tsx:162,202`, `components/customers/BusinessLoanTab.tsx:195,217`

2. **[Priority 18] Standardize every form field inside rpx-chrome dialogs on `inp`/`lbl`/`Field`** (FND-004) — remove shadcn `Input`/`Select` from inside dialogs that are otherwise rpx-chrome.
   *Files:* `components/purchases/SplitPaymentModal.tsx`, `ProcessPaymentModal.tsx`, `components/sales/SaleSplitPaymentModal.tsx`, `RecordPaymentModal.tsx`, `(modules)/stock/page.tsx` (`AdjustmentModal`), `app/app/(modules)/reports/_components/DateRangeFilter.tsx`, `(modules)/products/page.tsx:291-729`

3. **[Priority 9] Fix `Btn`'s internal radius inconsistency and add the inner-highlight bevel** ([TOKENS.md §5](./TOKENS.md#5-radii-currently-4-competing-values--2px--3px--8px--10px), §6) — `btnPrimary` (3px) vs `btnSecondary`/`btnDanger` (2px) should agree; add the one-line `boxShadow: inset 0 1px 0 rgba(255,255,255,0.6)` top-highlight for a genuine raised-button feel.
   *Files:* `components/rpx/styles.ts:57-76`

4. **[Priority 6] Reduce `RpxDialogContent`'s radius from 10px to the house 3px** ([TOKENS.md §5](./TOKENS.md#5-radii-currently-4-competing-values--2px--3px--8px--10px)) — currently the one shadcn-backed surface has a visibly softer corner than everything around it.
   *Files:* `components/rpx/Dialog.tsx:40`

5. **[Priority 6] Fix `Stocktake` detail's panel radius (2px → `PANEL`'s 3px) by importing the constant instead of hardcoding** ([TOKENS.md §5](./TOKENS.md#5-radii-currently-4-competing-values--2px--3px--8px--10px)).
   *Files:* `(modules)/stocktake/[id]/page.tsx:421,425,434,526`

6. **[Priority 3] Swap Save/Cancel order on the one full-page form** (FND-014) — Cancel first, primary rightmost, matching every dialog in the app.
   *Files:* `(modules)/customers/new/page.tsx:378-381`

7. **[Priority 3] Reconcile `layout.toolbarH` (36px) with `AppShell`'s actual rendered 32px** ([TOKENS.md §7](./TOKENS.md#7-control-heights)) — update the token, not the shell (32px is what's live today).
   *Files:* `src/lib/design-tokens.ts:230`

8. **[Priority 2] Add `DataTable` an `align?: 'left'|'right'` column option and right-align every money/ID/date column** (FND-016) — highest-signal "lists and data" fix named in the brief.
   *Files:* `components/ui/DataTable.tsx`, then set the option on money columns in `(modules)/purchases/page.tsx`, `sales/page.tsx`, `products/page.tsx`, `price-groups/page.tsx`, `stock/page.tsx`, `stock/grid/page.tsx`, `expenses/page.tsx`, `payments/page.tsx`

---

## BATCH-3 — Shell, address bar & navigation

Structural but scoped: deleting dead code, fixing shell-composition gaps, and the two highest-visibility rebuilds in the whole audit (lock screen, license gate). The full kiosk-shell and Scale-admin-shell unification is large enough to warrant its own redesign track — see [`REDESIGN.md`](./REDESIGN.md) — but the two items below (rebuild PinLockOverlay/LicenseGate; delete AppSidebar) are independently shippable now.

1. **[Priority 88 — do this first] Rebuild `PinLockOverlay` and `LicenseGate` on `RpxDialogContent`** (FND-002) — house 2-3px radius/`CARD_BORDER`/`BAR_GRAD` chrome instead of `rounded-2xl`/`shadow-2xl`; add `role="dialog"`/`aria-modal`/focus trap (inherited for free once built on the real `Dialog` primitive); add `aria-label` to the PIN backspace button; add a loading state to License's Retry button.
   *Files:* `src/components/PinLockOverlay.tsx`, `src/components/LicenseGate.tsx`

2. **[Priority 15] Delete the dead second printer-setup wizard** (FND-020) — confirmed zero imports; keeping it maintained in parallel with the shipped version is pure risk.
   *Files:* delete `src/app/scale/components/printer/PrinterSetupWizard.tsx`, `StepConnectionType.tsx`, `StepDeviceSelection.tsx`, `StepConfiguration.tsx`, `StepTestPrint.tsx`, `printer/index.ts`

3. **[Priority 2] Fix self-referential toolbar links** (FND-023) — add an exact-route exclusion so a page's own toolbar link to itself doesn't render.
   *Files:* `src/components/layout/AppShell.tsx` (`ToolbarBtn`/`useToolbarButtons`)

4. **[Priority 2] Delete `AppSidebar.tsx`** (FND-025) — confirmed unreferenced; removing it also removes its own drifted button/color system as a side effect.
   *Files:* delete `src/components/AppSidebar.tsx`

5. **[Priority 1] Wire `BannerBar` into `(portal)/layout.tsx` or explicitly document why the dashboard is exempt** — currently an unexplained-in-writing shell fork (the code has one implicit signal — `WindowedContent.tsx:18`'s dashboard special-case — but no comment says banners are meant to follow the same exemption). Confirm intent with the lead auditor before changing; if intentional, add a one-line comment at `(portal)/layout.tsx` saying so, so it isn't rediscovered as a "bug" next audit.
   *Files:* `src/app/app/(portal)/layout.tsx` (comment or import)

*Deferred to [REDESIGN.md](./REDESIGN.md), not this batch:* unifying Gate/Scale/Police kiosk chrome (FND-019) and building a real shell for Scale-admin (FND-018) — both require new shared components, not fixes to existing ones.

---

## BATCH-4 — Lists & forms

1. **[Priority 22] Delete the 9+ local status/role/pin badge re-implementations; route through `statusStyle()`/shared `StatusBadge`** (FND-006) — extend `STATUS_MAP` with any missing keys first, then delete the local copies one file at a time so each can be visually spot-checked.
   *Files:* `(modules)/stocktake/[id]/page.tsx`, `expenses/[id]/page.tsx`, `police-register/page.tsx`, `settings/users/page.tsx` (×3), `scale/admin/components/StatusBadge.tsx`, `(modules)/customers/page.tsx` (`PrimaryFunctionBadge`/`DealerCategoryBadge`), `components/customers/CustomerProfileModal.tsx` (`Pill`), `(modules)/customers/[id]/page.tsx` (`Pill`), `(modules)/payments/page.tsx` (`DirectionBadge`)

2. **[Priority 1.5] Rebuild audit-log's hand-rolled table on the shared `DataTable`/`TH`/`TD` primitives** (FND-012, resolves FND-013 for free since the shared primitives already use lucide chevrons) — this is the confirmed 32px row-height outlier and the app's only non-lucide icon usage, both fixed by the same change.
   *Files:* `(modules)/audit-log/page.tsx`

3. **[Priority 13.5] Right-align money/ID/date columns** — see Batch 2, item 8 (listed there since it's primarily a `DataTable` component change; included here as a cross-reference since it's equally a "lists" fix).

4. **[Priority n/a — judgment call] Settings: add `required` marking and client-side validation display** — the most consequential form-quality gap in the audit (zero required-field marks, no Zod-driven inline errors anywhere on the page).
   *Files:* `(modules)/settings/page.tsx`

5. **[Priority n/a] `customers/[id]`: add required-field marking to the edit-mode form** — currently only the `new` form marks required fields; editing an existing customer gives no such cue.
   *Files:* `(modules)/customers/[id]/page.tsx`

6. **[Priority n/a] `customers/[id]`: differentiate "permanently read-only" from "not editable by your role" from "not in edit mode"** — currently all three render as an identical greyed-out disabled input, a real state-confusion risk flagged in the customers batch report.
   *Files:* `(modules)/customers/[id]/page.tsx`

---

## BATCH-5 — States & copy

Pure copy/wording fixes plus explicitly wiring the states enumerated as missing in [AUDIT.md](./AUDIT.md)'s consistency matrix (Error column: `purchases/unpaid`, `sales`, `sales/unpaid`, `products`, `price-groups`, `stock`, `stock/grid`, `stock/movements`, `stocktake`, `photos` all show ❌/⚠️ — wire the `error` prop through to `DataTable` on each, mirroring `purchases/page.tsx`'s already-correct pattern).

1. **[Priority 24] Standardize void/reverse copy on "Void"** (FND-008) — rowAction labels, dialog titles, and confirm buttons across both purchases and sales.
   *Files:* `(modules)/purchases/page.tsx:189,463,481`, `purchases/new/page.tsx:1111,1146`, `purchases/unpaid/page.tsx:421,439-441`, `sales/new/page.tsx:964,984,999` (sales' own list/detail pages already say "Void" consistently — no change needed there)

2. **[Priority 18] Standardize "create a customer" copy on one verb** (FND-007) — recommend "Add Customer" (matches the existing dialog title) across every trigger.
   *Files:* `components/customers/AccountSelectorPanel.tsx:118`, `CreateCustomerModal.tsx:67,163`, `QuickCreateModal.tsx:61,94`, `CustomerLookupWidget.tsx:95`, `CasualSelectorPanel.tsx:477`

3. **[Priority 9] Standardize Export/Download copy** (FND-009) — one verb, one format order, app-wide.
   *Files:* `(modules)/stock/grid/page.tsx:163-171`, `reports/_components/DownloadButtons.tsx:50,55`, `src/components/layout/AppShell.tsx:120`

4. **[Priority 6] Standardize payment-settlement verb between purchases and sales** (FND-010) — pick one of "Process"/"Record"; raise the partial-payment functional asymmetry to the lead as a product decision, not just a copy fix.
   *Files:* `components/purchases/ProcessPaymentModal.tsx`, `components/sales/RecordPaymentModal.tsx`

5. **[Priority 2] Fix the "Pretoria Central" placeholder** (FND-024) — wrong country.
   *Files:* `(modules)/police-register/page.tsx:178`

6. **[Priority — decision, no file change] Ratify the toast-vs-dialog split as an explicit product decision** (FND-021) — spot-checked as already correct in practice (destructive actions route through a `Dialog` first, toasts reserved for transient confirmations); needs to be written down as intentional rather than left implicit, given it's a pattern with no Win7 precedent.

7. **[Priority — per-file, low individual cost] Wire `error` props through to `DataTable` on the pages currently missing it** — mirror `purchases/page.tsx`'s existing correct pattern.
   *Files:* `(modules)/purchases/unpaid/page.tsx`, `sales/page.tsx`, `sales/unpaid/page.tsx`, `products/page.tsx`, `price-groups/page.tsx` (also needs a loading state, currently missing entirely), `stock/page.tsx`, `stock/grid/page.tsx`, `stock/movements/page.tsx`, `stocktake/page.tsx`, `photos/page.tsx`

---

## BATCH-6 — Icons & polish

1. **[Priority 3] Swap audit-log's Unicode `▲`/`▼` for lucide `ChevronDown`/`ChevronRight`** (FND-013) — trivial if done standalone; free if Batch 4's `DataTable` rebuild happens first.
   *Files:* `(modules)/audit-log/page.tsx:234`

2. **[Priority 1] Delete the unreachable `.dark` OKLCH block** (FND-026) — no `dark` class toggle exists anywhere; dead weight regardless of whether dark mode is ever built (if it is, this block would need rework anyway once real UI is designed against it).
   *Files:* `src/app/globals.css:68-96`

3. **[Priority — polish, optional] Glass recipe for `AppShell` Zone 1/2** ([TOKENS.md §8](./TOKENS.md#8-glass-recipe-currently-none-on-chrome)) — the one deliberate "Aero not yet attempted" gap, as opposed to a broken/inconsistent one. Requires a manual contrast check post-implementation (not verifiable from static code). Treat as optional/design-review-gated, not a default-yes item.
   *Files:* `src/components/layout/AppShell.tsx`

4. **[Priority — polish] Reports `DateRangeFilter` control swap** (FND-022) — covered by Batch 2 item 2, listed here only as the single clearest "before/after" screenshot candidate if the lead wants one visual for a design-review deck.
   *Files:* `app/app/(modules)/reports/_components/DateRangeFilter.tsx`

---

## Not on this backlog — deferred to REDESIGN.md

- Unifying Gate/Scale/Police kiosk chrome into one `KioskShell` (FND-019)
- Giving Scale-admin a real shell (FND-018)
- Dashboard tile-grid restructure toward a Control-Panel-category pattern
- The Auth-entry-point shell (`/login`, `/gate/login`, `/scale/login`) unification
- Whether `CustomerProfileModal.tsx`'s parallel implementation of the customer-detail view should be deleted in favor of always navigating to the real page (a scope question, not a style one)

These involve building new shared components or making a structural navigation decision, not fixing an existing one — see [`REDESIGN.md`](./REDESIGN.md) for the proposed approach to each.
