# Renovo Pro — UI Audit (Windows 7 / Aero Conformance)

Read-only audit. No code was changed in the production of this report. Companion documents: [`INVENTORY.md`](./INVENTORY.md) (Phase 0 raw discovery — read this for the full route map and token catalog), [`TOKENS.md`](./TOKENS.md) (canonical remediation plan), [`BACKLOG.md`](./BACKLOG.md) (execution batches), [`REDESIGN.md`](./REDESIGN.md) (pages that need more than a patch).

**Coverage:** every route under `src/app` and every file under `src/components` was read by at least one of four parallel research passes plus direct review of the shared shell/token files. Every finding below is a source-code claim with a file:line citation; true rendered contrast ratios and pixel-level layout breakage were not independently visually verified and are called out as such where it matters.

**Execution status:** [`BACKLOG.md`](./BACKLOG.md) BATCH-1 through BATCH-6 have all been executed — see the **STATUS: FIXED**/**STATUS: PARTIALLY FIXED** annotations inline on the affected findings below, plus "Additional fixes" notes per batch for drift fixed without its own numbered finding. Verified via `tsc --noEmit` and `next lint` after each batch (all clean — 3 pre-existing warnings unrelated to any batch). The full patch-level backlog is now closed, with one deliberate exception: BATCH-6's optional Aero-glass recipe for `AppShell` was left unimplemented — both `TOKENS.md` §8 and `BACKLOG.md` flagged it up front as design-review-gated ("not a default-yes item") since it needs a manual post-implementation contrast check this pass can't perform, so it's waiting on an explicit ask rather than being done silently. [`REDESIGN.md`](./REDESIGN.md)'s five structural items (kiosk shell unification, a real Scale-admin shell, the dashboard tile-grid restructure, an auth-shell unification, and adding Cancel to the two POS wizards) were never part of `BACKLOG.md`'s patch-level scope and remain a separate, larger-scope proposal for the lead to schedule.

---

## Executive summary

1. **The codebase already has a real, documented custom design system** (`design-tokens.ts` + `rpx/`) that's meaningfully closer to Win7/Aero than a generic SaaS starter: a dense 11–24px type scale, a flat grey gradient button, 30px bordered inputs, gradient sticky table headers. This is a genuine asset to build on, not a blank slate.
2. **Commitment is inconsistent, not absent.** At least 11 distinct gradient value-pairs exist where the brief's own baseline expects ≤6 from one canonical set — and the two correct constants (`HEADER_GRAD`/`BAR_GRAD`) are already exported, just bypassed by hand-typed literals in 15+ files.
3. **Four independent button implementations collide on the same screens**: the house flat-grey `rpx/Btn`, a separate shadcn `Button` (rounded-lg, oklch, press-down effect) rendered directly inside every Dialog/Sheet/AlertDialog footer, a hand-copied "legacy" button literal that doesn't even match itself between its two copies, and ad hoc gradient `<button>`s for some of the app's most prominent CTAs. This is the exact "flat modern button beside gradient Aero button" failure mode the brief names as the top risk.
4. **The app's two most-seen, most security-critical surfaces — the PIN lock screen and the license gate — are its single biggest aesthetic outliers**: 100% modern shadcn/Tailwind (`rounded-2xl`, `shadow-2xl`, blurred dark scrim), zero relationship to the house style, and neither uses the accessible `Dialog` primitive every ordinary confirm modal gets for free.
5. **Aero glass is entirely absent from window chrome.** `backdrop-blur` exists in exactly 5 places, all as modal/lock scrims — never as title-bar/window-frame glass. The main portal shell is a flat solid navy bar with no gradient and no rounded top corners.
6. **No page anywhere uses Win7's blue main-instruction text** (`#003399`) — a big, cheap piece of "reads as Win7" signal is simply missing app-wide, not inconsistently applied.
7. **Even the codebase's own stated reference file doesn't match its own extracted tokens**: `police/page.tsx` is documented in code as the source `rpx/styles.ts` was "extracted verbatim" from, yet its danger/success/warning/info colors are a private palette that don't match `design-tokens.ts`.
8. **Status/role/pin badges are reimplemented locally at least 9 times** with slightly different padding/radius/borders, despite a correct shared `statusStyle()` helper existing — it's used correctly in exactly 1 of ~44 pages.
9. **The kiosk apps (Gate/Scale/Police/Scale-admin), which should read as one coherent family, share no chrome at all**: three header treatments, two accent hues, and Scale-admin gets no shell whatsoever (a 100% generic Tailwind dashboard).
10. **Highest-leverage single fix**: consolidate the button system to one component and force every hand-typed gradient literal through the two existing exported constants. This one move touches the largest number of files, carries the lowest risk (visual-only, same click handlers), and directly fixes the #1 failure mode named in the brief.

---

## Aero commitment score (0–5 per page)

Rubric: **5** = fully committed, canonical gradients/chrome, correct control metrics, no modern-card leakage. **4** = mostly committed, 1–2 minor one-offs. **3** = recognizably house style but with real visible drift (mixed gradients/inputs) or missing states. **2** = genuine coexistence of flat-modern components beside legacy chrome on the same screen. **1** = mostly modern/SaaS-flat, only surface tokens (font) match. **0** = no relationship to house style at all.

Every page scores at or below 4 because **no page anywhere uses real chrome glass or Win7 blue instruction text** — this is a systemic ceiling, not a per-page deduction, and is treated as such (i.e. it isn't re-litigated in every row's rationale below). **Pages scoring below 3 go on the redesign list** ([REDESIGN.md](./REDESIGN.md)).

| Route | Score | What's dragging it down |
|---|:-:|---|
| `/login` | 1 | Hand-rolled `rounded-lg`/`shadow-lg` card, flat solid button with **no gradient at all** — closer to generic SaaS than house style, despite being the very first screen every user sees |
| `/gate` + login + 7 steps | 1 | Own kiosk chrome with **3 internally-inconsistent navy/blue families**; `rounded-xl`/`2xl` cards+inputs; no `htmlFor` anywhere |
| `/scale` + login | 1 | Flat `slate-900` header with **no gradient**; emerald-only accent unrelated to house navy; same oversized touch-target radii as Gate |
| `/scale/admin` + `orders` | 0 | **Zero shell**, 100% generic Tailwind SaaS dashboard, hand-rolled modals with no `role="dialog"` |
| `/police` | 4 | Best-in-app structural fidelity (`HEADER_GRAD`, `inp`, `lbl`, `Btn`, `Drawer` all correctly used) but its own private off-token color palette, and the one shadcn-backed dialog has a 10px radius outlier |
| `/app/dashboard` | 2 | 16 `rounded-xl` tiles, diagonal Tailwind gradients (vs. the app's vertical 180° convention elsewhere), scale+glow hover — a Windows 8/10 Start-tile launcher, not Aero |
| `/app/customers` | 3 | `DataTable`'s `HEADER_GRAD` is a hardcoded literal not an import; no "Add Customer" affordance anywhere on the page; badge radii drift from house 2-3px |
| `/app/customers/new` | 3 | Genuinely Win7-flavored two-column property-sheet layout; one-off action-bar gradient; **Save-before-Cancel** button order (reversed vs. every dialog in the app) |
| `/app/customers/[id]` | 3 | Correct `HEADER_GRAD` import via `SHdr`; hand-rolled action sub-header instead of `PortalPage`'s `actions` slot (unlike its own twin, casual detail) |
| `/app/casual` | 3 | Same list pattern as customers; A–Z quick-filter strip not mirrored on the sibling Accounts list |
| `/app/casual/[id]` | 3 | Correct `actions`-slot usage; local one-off Zod schema instead of the shared one |
| `/app/purchases` | 3 | Empty AppShell toolbar + own `FilterBar`; only purchases/sales list with a wired error state; money left-aligned |
| `/app/purchases/new` | 2 | **No back/cancel control at all** (breaks both the Aero Wizard pattern and ordinary form convention); 3 distinct one-off gradients; one shadcn `Select` dropped into an otherwise all-inline-style page |
| `/app/purchases/[id]` | 4 | Most token-compliant page in the purchases group (`TH`/`TD`/`HEADER_GRAD`/`NAVY` all correctly imported); one one-off tfoot gradient |
| `/app/purchases/unpaid` | 3 | No error state wired; 4th distinct wording variant of "void" ("Confirm Reversal") |
| `/app/sales` | 3 | Missing error state *and* empty-action CTA that its mirror (purchases) has |
| `/app/sales/new` | 2 | Same no-back/cancel gap as its mirror; native `<select>` product picker vs. purchases' custom flyout for the identical task |
| `/app/sales/[id]` | 4 | Same token-compliance as purchases/[id]; adds a Pending banner purchases' detail page lacks (better state coverage) |
| `/app/sales/unpaid` | 3 | Mirrors purchases/unpaid's issues exactly |
| `/app/products` | 3 | Real AppShell toolbar wiring (good); Create/Edit modals are 100% shadcn beside a 100% rpx filter bar in the same file; unused shared `CategoryFilterSelect` duplicated inline; no error state |
| `/app/price-groups` | 2 | No `FilterBar` at all (sole outlier among 4 list pages); no loading **or** error state — the weakest state coverage found; dialog table's zebra shade doesn't match `DataTable`'s |
| `/app/stock` | 3 | `AdjustmentModal` mixes shadcn `Input`/`Label` with a native `<select>`; no error state passed to `DataTable` |
| `/app/stock/grid` | 3 | "Export Excel/PDF" wording diverges from Reports' "Download PDF/Excel"; bespoke loading branch instead of `DataTable`'s own |
| `/app/stock/movements` | 3 | Unbounded 200-row list, no client pagination unlike its siblings |
| `/app/stocktake` | 3 | Correct shared `StatusBadge` usage (a plus); good empty copy but no empty-state action |
| `/app/stocktake/[id]` | 3 | Hardcoded `BAR_GRAD` literal (×2); a 3rd distinct panel-radius value (2px vs. house 3px) |
| `/app/cashup` | 3 | Hardcoded `HEADER_GRAD` literal; hand-rolled recon table at 24–26px rows (a 3rd row-height value); the app's only draggable dialog (one-off interaction, not necessarily bad, just unique) |
| `/app/float` | 3 | Fewest flagged issues in the back-office batch; money still hand-rolled rather than via `styles.money*` |
| `/app/expenses` | 4 | Reference-quality `TabStrip` usage and the best empty state in the app (icon + action) |
| `/app/expenses/[id]` | 3 | Hardcoded `BAR_GRAD` literal; a 2nd local `StatusBadge` re-implementation; inconsistent expense-amount color convention vs. Cash-Up |
| `/app/payments` | 3 | Bespoke `DirectionBadge` beside the correctly-shared `StatusBadge`; self-referential toolbar link when already on Balances |
| `/app/payments/balances` | 2 | Zero filters — sole filterless list page in the whole comparison group; inherits the self-link toolbar quirk |
| `/app/audit-log` | 2 | **Confirmed row-height outlier** (32px hand-rolled table vs. house 30px); the **only** break of the 100%-lucide icon rule (literal Unicode ▲/▼) |
| `/app/reports` | 2 | `DateRangeFilter`'s shadcn `h-9`/`rounded-md` sits directly beside 30px/2px rpx filters in the same row — the single clearest in-frame instance of the two-token-system problem |
| `/app/photos` | 3 | Genuinely appropriate card-gallery departure from the panel/table language; a 3rd distinct "tabs" implementation; no fetch-error state |
| `/app/police-register` | 4 | Correct `HEADER_GRAD`/`NAVY` imports and correct row height; a 3rd local `StatusBadge` variant; "Pretoria Central" placeholder (wrong country) |
| `/app/settings` | 3 | Correct token imports; **zero fields marked required**, no client-side validation display anywhere on the form |
| `/app/settings/users` | 2 | Self-referential toolbar link; 3 more local badge components; unbounded list (a 4th distinct pagination behavior) |
| `/app/change-password` | 3 | Correct `inp` usage (better than Stock's mixed dialog) undercut by a **raw Tailwind red/amber/blue/green strength meter** — a fourth, undocumented color system |
| `/app/support` | 4 | The **only** page in the app using the shared `statusStyle()` helper correctly; justified chat-bubble radius departure; dedicated closed-ticket state |
| `PinLockOverlay` (global) | 0 | 100% shadcn/Tailwind, `rounded-2xl`/`shadow-2xl`, no `Dialog` primitive, no focus trap, unlabeled icon-only button |
| `LicenseGate` (global) | 0 | Same recipe as PinLockOverlay; Retry button has no loading state |

Not scored (no UI / trivial): `/` (redirect). Kiosk-admin auth layouts (`gate/layout.tsx`, `scale/admin/layout.tsx`) are auth gates only, scored via their content pages above.

---

## Consistency matrix

✅ = matches house convention · ⚠️ = present but drifting · ❌ = missing/violates the convention · n/a = not applicable to this page's content.

Columns: **Shell** (AppShell/kiosk-consistent chrome) · **Cmd** (command/toolbar placement consistent with sibling pages) · **Typo** (Segoe stack + house type scale) · **BlueInstr** (Win7 main-instruction blue `#003399`) · **Grad** (uses `HEADER_GRAD`/`BAR_GRAD` via import, not a re-typed literal) · **CtrlH** (30px house control height) · **Radii** (2–3px house radius) · **Glass** (chrome glass — not scrim blur) · **Table** (shared `DataTable`/`TH`/`TD`) · **Form** (`inp`/`lbl`/`Field`, not shadcn) · **Icons** (100% lucide) · **Empty/Error/Focus** states.

| Route | Shell | Cmd | Typo | BlueInstr | Grad | CtrlH | Radii | Glass | Table | Form | Icons | Empty | Error | Focus |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/login` | ⚠️ | n/a | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | n/a | ✅ | ✅ | n/a | ✅ | ✅ |
| `/gate` (+login/steps) | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| `/scale` (+login) | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | n/a | ⚠️ | ✅ | n/a | n/a | ⚠️ |
| `/scale/admin` (+orders) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `/police` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| `/app/dashboard` | ⚠️ | ✅ | ✅ | ❌ | ⚠️ | n/a | ❌ | ❌ | n/a | n/a | ✅ | n/a | n/a | ✅ |
| `/app/customers` | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ⚠️ | ❌ | ✅ | n/a | ✅ | ✅ | ✅ | ⚠️ |
| `/app/customers/new` | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | n/a | ⚠️ | ✅ | n/a | ✅ | ⚠️ |
| `/app/customers/[id]` | ✅ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ✅ | n/a | ⚠️ |
| `/app/casual` | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ✅ | ✅ | ⚠️ |
| `/app/casual/[id]` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ✅ | n/a | ⚠️ |
| `/app/purchases` | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ✅ | ✅ | ⚠️ |
| `/app/purchases/new` | ⚠️ | ❌ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | n/a | ⚠️ | ✅ | n/a | n/a | ⚠️ |
| `/app/purchases/[id]` | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | n/a | n/a | ⚠️ |
| `/app/purchases/unpaid` | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ✅ | ❌ | ⚠️ |
| `/app/sales` | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ⚠️ | ❌ | ⚠️ |
| `/app/sales/new` | ⚠️ | ❌ | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ❌ | n/a | ⚠️ | ✅ | n/a | n/a | ⚠️ |
| `/app/sales/[id]` | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | n/a | n/a | ⚠️ |
| `/app/sales/unpaid` | ✅ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ✅ | ❌ | ⚠️ |
| `/app/products` | ✅ | ✅ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ✅ |
| `/app/price-groups` | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ | ✅ |
| `/app/stock` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ✅ |
| `/app/stock/grid` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | n/a | ❌ | ✅ |
| `/app/stock/movements` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ⚠️ | n/a | ✅ | ✅ | ❌ | ✅ |
| `/app/stocktake` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ⚠️ | ❌ | ✅ |
| `/app/stocktake/[id]` | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| `/app/cashup` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ | n/a | ✅ |
| `/app/float` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ |
| `/app/expenses` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| `/app/expenses/[id]` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | n/a | n/a | ✅ | n/a | n/a | ✅ |
| `/app/payments` | ✅ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ✅ | n/a | ✅ | ✅ | ⚠️ | ✅ |
| `/app/payments/balances` | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | n/a | ✅ | ✅ | n/a | ✅ |
| `/app/audit-log` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | n/a | ❌ | ⚠️ | n/a | ✅ |
| `/app/reports` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ✅ | n/a | ✅ | ✅ |
| `/app/photos` | ✅ | ⚠️ | ✅ | ❌ | n/a | n/a | ✅ | ❌ | n/a | n/a | ⚠️ | ✅ | ❌ | ✅ |
| `/app/police-register` | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ | ✅ | ✅ | n/a | n/a | ✅ |
| `/app/settings` | ✅ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | n/a | ❌ | ✅ | n/a | n/a | ✅ |
| `/app/settings/users` | ✅ | ⚠️ | ✅ | ❌ | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| `/app/change-password` | ✅ | ✅ | ✅ | ❌ | n/a | ✅ | ✅ | ❌ | n/a | ✅ | ✅ | n/a | ✅ | ✅ |
| `/app/support` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | n/a | ✅ | ✅ | ✅ | n/a | ✅ |
| `PinLockOverlay` | ❌ | n/a | ⚠️ | ❌ | ❌ | ❌ | ❌ | ⚠️ | n/a | n/a | ⚠️ | n/a | n/a | ❌ |
| `LicenseGate` | ❌ | n/a | ⚠️ | ❌ | ❌ | ❌ | ❌ | ⚠️ | n/a | n/a | ✅ | n/a | ⚠️ | ❌ |

**Reading the matrix**: the **BlueInstr** column is 100% ❌ top to bottom — that single blank column is the cheapest, single highest-leverage typographic fix available (see [TOKENS.md](./TOKENS.md)). The **Glass** column is effectively 100% ❌/⚠️ — there is no real chrome glass anywhere in the app to audit. **Table**, **Icons**, and **Focus** are the strongest columns (mostly ✅), confirming `DataTable`/lucide/Base-UI-dialog adoption is broad even where colors and gradients drift.

---

## Findings

### [SEV-1] FND-001 · Four independent button implementations collide on the same screens

**STATUS: FIXED (BATCH-2), with one documented deviation from the original plan.** `rpx/Btn`'s own radius inconsistency was fixed first (`btnSecondary`/`btnDanger` moved from 2px to 3px, matching `btnPrimary`), and an inner-highlight bevel (`inset 0 1px 0 rgba(255,255,255,0.6)`) was added to all three variants (`rpx/styles.ts`). `ui/button.tsx` (the shadcn/base-ui Button rendered directly inside `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx`, and 9 other files) was restyled — not replaced — to match: `rounded-lg` → `rounded-[3px]`, the `active:translate-y-px` press effect removed, `default`/`secondary` variants now render the same `BAR_GRAD` fill + bevel as `Btn`, `destructive` keeps the grey fill with `colors.danger` red text (matching the house "signal severity by text color, not a solid block" convention), and — the highest-impact single change here — `outline` (the variant rendered in every ordinary Dialog/AlertDialog Close/Cancel slot, confirmed the most frequent call site of the 9) now renders white/bordered/`#212529` instead of the oklch `bg-background`/`border-border` theme classes. Restyling one shared component rather than touching 12 call sites was the deliberate lower-risk choice. Both `legacyBtn` copies (`AccountSelectorPanel.tsx`, `CasualSelectorPanel.tsx` — previously 32px vs. 28px, disagreeing with each other) were deleted and replaced with `Btn`.

**Deviation from the original BACKLOG plan:** converting the `LoansTab`/`BusinessLoanTab` ad hoc gradient CTA buttons to `<Btn variant="primary">` was **not** done — `Btn`'s variants are all the same flat grey, and forcing these through it would have erased the green-vs-violet accent that's intentionally distinct per this project's own established "differentiate mirrored features" convention (Business Loan must not look identical to Loan). Instead, these buttons were brought in line with `Btn`'s *structural* spec (3px radius, matching bevel) while keeping their own `ACTION_GRAD`/`VIOLET_GRAD` accent colors.
**Pages:** Virtually every dialog-heavy page — customers, purchases, sales, stock, stocktake, cashup, expenses, payments, police-register, photos, support (any page whose toolbar/body uses `Btn` but which also opens a `Dialog`/`Sheet`/`AlertDialog`, since those primitives themselves import the shadcn button).
**Evidence:** `src/components/rpx/Btn.tsx` (house, flat-grey `BAR_GRAD`, 63 importers) vs. `src/components/ui/button.tsx:1-61` (shadcn/base-ui, `rounded-lg`, heights 24/28/32/36px, `active:translate-y-px`, used directly by `ui/dialog.tsx:7`, `ui/alert-dialog.tsx`, `ui/sheet.tsx`, and 9 other files) vs. `components/customers/AccountSelectorPanel.tsx:9-15` (`legacyBtn`, 32px) vs. `components/customers/CasualSelectorPanel.tsx:10-16` (`legacyBtn`, 28px — doesn't match the first copy) vs. `components/customers/LoansTab.tsx:162,202` and `BusinessLoanTab.tsx:195,217` (ad hoc gradient `<button>`, bypassing every button component for the tab's primary CTA).
**Problem:** four visually distinct button languages render across the app, including on the same screen (a page's flat-grey toolbar button beside a dialog's rounded shadcn footer button).
**Why it matters:** this is precisely the "flat modern button next to gradient Aero button" failure mode the brief names as the single biggest risk — nothing else in the app undermines the aesthetic commitment this visibly or this often.
**Fix:** adopt `rpx/Btn` as canonical. Either restyle `ui/button.tsx`'s class strings to match `Btn`'s spec, or have `Dialog`/`Sheet`/`AlertDialog` footers render `Btn` directly. Delete both `legacyBtn` copies in favor of `Btn`. Convert the 4 ad hoc gradient CTAs in Loans/BusinessLoan to `<Btn variant="primary">`.
**Effort:** M   **Risk:** Low (visual-only, same click handlers)   **Blast radius:** ~16 files

### [SEV-1] FND-002 · The PIN lock screen and license gate are the app's biggest aesthetic outliers and its least accessible surfaces

**STATUS: FIXED (BATCH-3).** Both `PinLockOverlay.tsx` and `LicenseGate.tsx` were rebuilt on the real `Dialog` primitive + `RpxDialogContent`/`RpxDialogHeader`/`RpxDialogBody` — house 3px radius, `CARD_BORDER`, `BAR_GRAD` header, instead of `rounded-2xl`/`shadow-2xl`. Both dialogs are controlled (`open={isLocked}` / `open={blocking}`) with a no-op `onOpenChange`, so they get `role="dialog"`, `aria-modal`, and a real focus trap for free from Base UI, while remaining non-dismissable via Escape/outside-click (preserving the existing, correct product behavior — these are security gates, not ordinary confirms). `PinLockOverlay`'s backspace button now has an accessible label (`sr-only` text) instead of being an unlabeled icon button; the PIN-progress dots gained a `role="status"`/`aria-label`. `LicenseGate`'s Retry button now shows a loading state (`Btn`'s `loading` prop) instead of allowing repeated clicks with no feedback while the async check is in flight.
**Pages:** Global (rendered from `(modules)/layout.tsx` and `(portal)/layout.tsx` — every route).
**Evidence:** `PinLockOverlay.tsx:62-67,115,120` (`rounded-2xl`, `shadow-2xl`, `bg-gray-900/95 backdrop-blur`, `h-12` keypad buttons); `LicenseGate.tsx:69-71,95-104` (identical recipe; Retry button has no loading state).
**Problem:** both are raw `fixed inset-0` divs, not the `Dialog` primitive — no `role="dialog"`, no `aria-modal`, no focus trap, and `PinLockOverlay`'s icon-only backspace button has no `aria-label`.
**Why it matters:** every user encounters these on lock/license events; they are simultaneously the least Aero-committed and least accessible surfaces in the audited codebase, gating the app's two most consequential access points.
**Fix:** rebuild both on `RpxDialogContent` (or a full-screen variant of it) with house 2-3px radius/`CARD_BORDER`/`BAR_GRAD` chrome; add `role="dialog"`/`aria-modal`/focus trap; add an `aria-label` to the backspace button; add a loading state to Retry.
**Effort:** M   **Risk:** Low (isolated, well-defined props)   **Blast radius:** 2 files, app-wide visual impact

### [SEV-1] FND-003 · 11+ distinct gradient values exist where 2 canonical constants should be the only source

**STATUS: FIXED (BATCH-1).** All byte-identical `HEADER_GRAD`/`BAR_GRAD` literals now import the constant instead of retyping it (`DataTable.tsx`, `police/page.tsx` ×4, `purchases/new/page.tsx` ×2, `sales/new/page.tsx` ×2, `cashup/page.tsx` ×2, `stocktake/[id]/page.tsx` ×2, `CustomerProfileModal.tsx`). The 4 near-identical one-offs (`#F5F5F5→#EBEBEB`, `#F5F5F5→#ECECEC` ×5, `#FAFAFA→#F0F0F0`) were collapsed onto `HEADER_GRAD` (`LoansTab.tsx`, `BusinessLoanTab.tsx`, `sales/[id]/page.tsx` ×3, `purchases/[id]/page.tsx` ×2, `CustomerProfileModal.tsx`). Two new named constants were added to close the remaining gap rather than leave them as hand-rolled duplicates: `ACTION_GRAD` (`rpx/styles.ts`) replaces the hand-rolled `#10B981→#059669` Loans CTA gradient; `VIOLET_GRAD` replaces the inline-templated Business-Loan CTA gradient. Both exported via `rpx/index.ts`. **Not touched, by design:** the Gate/Scale kiosk header gradients and the dashboard's diagonal tile gradients — these need a shared `KioskShell`/dashboard restructure, not a token swap, and remain on the [REDESIGN.md](./REDESIGN.md) track. `tsc --noEmit` and `next lint` both clean after this change.
**Pages:** `stocktake/[id]`, `expenses/[id]`, `cashup`, `sales/[id]`, `sales/new`, `purchases/[id]`, `purchases/new`, `customers/new`, `DataTable.tsx`, `CustomerProfileModal.tsx` (×2 more one-offs), `LoansTab`/`BusinessLoanTab` (×2 more), `police/page.tsx` (byte-identical but still hand-typed), Gate module (×2 navy variants), dashboard (diagonal Tailwind class).
**Evidence:** see [INVENTORY.md §3b](./INVENTORY.md#3b-gradients--every-distinct-value-found) for the full value/file:line table.
**Problem:** a single edit to `HEADER_GRAD`/`BAR_GRAD` would silently miss most of these call sites; several are byte-identical accidental duplicates (harmless until someone needs to change the value), but several genuinely diverge (`#F5F5F5→#EBEBEB` vs `#F5F5F5→#ECECEC` vs `#FAFAFA→#F0F0F0`, etc.).
**Why it matters:** the brief flags >6 gradients as a finding on its own; this codebase is at 11+, and most of the surplus is pure entropy — copy-pasted literals, not intentional variety.
**Fix:** import `HEADER_GRAD`/`BAR_GRAD` everywhere a byte-identical literal exists (mechanical); consolidate the genuine one-offs (money-tab green, violet, navy variants) into 2-3 newly-named constants if intentional, else collapse onto `BAR_GRAD`.
**Effort:** S (mechanical half) + M (judgment-call half)   **Risk:** Low   **Blast radius:** ~20 files

### [SEV-1] FND-004 · Two parallel design-token systems produce visible height/radius mismatches within a single screen

**STATUS: FIXED (BATCH-2).** All 4 payment modals (`SplitPaymentModal.tsx`, `ProcessPaymentModal.tsx`, `SaleSplitPaymentModal.tsx`, `RecordPaymentModal.tsx`) now use `inp`-styled native `<input>`/`<select>` instead of shadcn `Input`/`Select`. `stock/page.tsx`'s `AdjustmentModal` now uses `Field`+`inp` throughout (previously mixed shadcn `Input`/`Label` with an `inp`-styled native select). `reports/_components/DateRangeFilter.tsx` — the single clearest in-frame instance of this finding (its `h-9`/`rounded-md` inputs sat directly beside 30px/2px rpx filters in the same row) — now uses `Field`+`inp` for From/To and a house-radius (2px) container for the Quick Range segmented control. `products/page.tsx`'s Create/Edit/Bulk-Price modals (8 Label+Input pairs, 4 Select instances) now use `Field`+`inp` throughout, including the category `<select>`s (previously shadcn `Select` with `React.Fragment`-grouped `SelectItem`s, now the equivalent native `<option>` structure).
**Pages:** Reports (`DateRangeFilter` `h-9`/`rounded-md` beside 30px/2px rpx filters in the same row — the single clearest in-frame instance), Stock (`AdjustmentModal` mixes shadcn `Input`/`Label` with an `inp`-styled native select), all 4 purchases/sales payment modals (shadcn `Input`/`Select` inside rpx `Dialog` chrome), Products (Create/Edit modals 100% shadcn beside a 100% rpx filter bar in the same file).
**Evidence:** `reports/_components/ReportViewer.tsx:332-341`, `DateRangeFilter.tsx:34,38,43`; `stock/page.tsx` `AdjustmentModal`; `SplitPaymentModal.tsx`/`ProcessPaymentModal.tsx`/`RecordPaymentModal.tsx`/`SaleSplitPaymentModal.tsx`; `products/page.tsx:183-213` vs. `:291-729`.
**Problem:** two input-control skins (30px/2px vs. Tailwind's ~36px/6-10px) appear side-by-side or inside the same modal repeatedly.
**Why it matters:** a second, distinct instance of the SEV-1 "mixed commitment" defect class — same problem as FND-001, different control type.
**Fix:** standardize every form field inside rpx-chrome dialogs on `inp`/`lbl`/`Field`; reserve shadcn `Input`/`Select` for a fully-modern surface if one is ever wanted (there should be none post-remediation).
**Effort:** M   **Risk:** Low   **Blast radius:** ~9 files

### [SEV-2] FND-005 · Two competing focus/selection blues used interchangeably

**STATUS: FIXED (BATCH-1).** `globals.css:134` and `ui/input.tsx:12` now use `#185ABD` for the focus border/ring instead of `#0078D7` (box-shadow rgba recomputed to match). The two data/selection call sites that hardcoded either blue directly (`customers/new/page.tsx:296` market-sector selection highlight, `customers/page.tsx:188` account-code color) now reference `colors.borderFocus`/`colors.process`. Also caught two more `#0078D7` instances the original audit pass didn't cite individually — the `cellInput` focus-border class in both `purchases/new/page.tsx` and `sales/new/page.tsx` line-item grids — fixed to `#185ABD` for the same reason.
**Evidence:** `globals.css:134`, `ui/input.tsx:12` use `#0078D7`; `design-tokens.ts:28,58` (`colors.borderFocus`/`colors.process`) use `#185ABD` — and the ambiguity has spread beyond focus rings: `customers/new/page.tsx:296` uses `#0078D7` as a manual selection-highlight background, `customers/page.tsx:188` uses `#185ABD` as a data-display color.
**Problem:** no single source of truth for "this is focused/active/selected."
**Why it matters:** invisible as any one instance, but across dozens of inputs the lack of one accent identity is felt.
**Fix:** standardize on `#185ABD` (`colors.process`, already the documented token); update `globals.css:134` and `ui/input.tsx:12`.
**Effort:** S   **Risk:** Low   **Blast radius:** 2 declaring files + scattered hardcoded call sites

### [SEV-2] FND-006 · Status/role/pin badges reimplemented locally at least 9 times

**STATUS: FIXED (BATCH-4), with a root cause found one level deeper than originally cataloged.** While consolidating, `components/ui/DataTable.tsx`'s own `StatusBadge` turned out to be a **second, independent** implementation of the exact same concept as `design-tokens.ts`'s `statusStyle()` — different color map (`STATUS_STYLES` vs `STATUS_MAP`), different radius (`layout.btnRadius`/3px vs a 999px pill), different fallback-label logic — despite `DataTable.tsx`'s version being the far more prevalent of the two (confirmed 20+ call sites vs. `statusStyle()`'s 1). Rather than picking one arbitrarily: `DataTable.tsx`'s `StatusBadge` now delegates to `statusStyle()` (deleting its local `STATUS_STYLES` map), and `STATUS_MAP` gained the extra keys the deleted map had (`on site`, `paid`, `processed`) plus one `expired` a caller needed. A new `badgeStyle(color, background)` helper was added to `design-tokens.ts` — the same shape `statusStyle()` builds internally — for badges that aren't a lifecycle status at all (role, PIN, direction, category tags), so those don't get force-fitted into `STATUS_MAP`.
- Routed onto the shared `StatusBadge` (deleting the local re-implementation): `stocktake/[id]/page.tsx`, `expenses/[id]/page.tsx`, `police-register/page.tsx` (remapping its internal "active" session state to the shared `in_progress` key — blue, not green, since an in-progress officer visit isn't the same concept as an enabled/active record), `settings/users/page.tsx`'s Status badge, and `scale/admin/components/StatusBadge.tsx` (file deleted entirely, both its 2 call sites repointed to the shared import).
- Routed onto the new `badgeStyle()` (keeping their own color-mapping logic, fixing only the shape): `settings/users/page.tsx`'s Pin and Role badges, `customers/page.tsx`'s `PrimaryFunctionBadge`/`DealerCategoryBadge`, the near-identical `Pill` in both `customers/[id]/page.tsx` and `CustomerProfileModal.tsx`, `payments/page.tsx`'s `DirectionBadge`, and `audit-log/page.tsx`'s action-type badge (not in the original 9, caught as the same drift while touching that file for FND-012/013 below).
**Pages:** `stocktake/[id]`, `expenses/[id]`, `police-register`, `settings/users` (×3: Pin/Status/Role), `scale/admin/components/StatusBadge.tsx`, `customers/page.tsx` (`PrimaryFunctionBadge`/`DealerCategoryBadge`), `customers/[id]`/`CustomerProfileModal` (2 separate `Pill` copies).
**Evidence:** full file:line list in [INVENTORY.md §2](./INVENTORY.md#2-component-layer). `statusStyle()` used correctly in exactly 1 of ~44 pages (`support/page.tsx:145`).
**Problem:** the same "status pill" concept renders in 4–5 visibly different shapes across the app.
**Why it matters:** badges are one of the highest-frequency elements in a data-heavy app; drift here compounds across every list/detail screen.
**Fix:** delete the local re-implementations; route all through `statusStyle()`/the shared `StatusBadge`, extending `STATUS_MAP` with any missing keys instead of hand-rolling new components.
**Effort:** M   **Risk:** Low   **Blast radius:** ~9 files

### [SEV-2] FND-007 · "Create a customer" carries 6 different labels in one module

**STATUS: FIXED (BATCH-5), narrower than the original "collapse to one verb" plan.** On closer inspection, 3 of the 6 labels are naming genuinely different flows, not the same action inconsistently worded: "Add Account" (`AccountSelectorPanel.tsx`) opens the dedicated full-page account form; "Quick Create"/"Quick Create Customer" (`CustomerLookupWidget.tsx`, `QuickCreateModal.tsx`) is a deliberately lighter, faster modal — collapsing that distinction to one generic label would erase a useful signal, the same reasoning BATCH-2 already applied to Loans/BusinessLoan's accent colors. What was genuinely inconsistent — each modal's own title not matching its own submit button — is fixed: `CreateCustomerModal` now says "Add Customer" on both title and button (was "Add Customer" / "Create Customer"); `QuickCreateModal` now says "Quick Create" consistently across its trigger (`CustomerLookupWidget`), title, and button (was "Quick Create"/"Quick Create Customer"/"Create Customer"). `CasualSelectorPanel`'s "Confirm →" is left alone — it confirms an already-identified customer, a different action from creating one.
**Evidence:** "Add Account" (`AccountSelectorPanel.tsx:118`), "Add Customer" (`CreateCustomerModal.tsx:67`), "Create Customer" (`CreateCustomerModal.tsx:163`, `QuickCreateModal.tsx:94`), "Quick Create" (`CustomerLookupWidget.tsx:95`), "Quick Create Customer" (`QuickCreateModal.tsx:61`), "Confirm →" (`CasualSelectorPanel.tsx:477`).
**Problem/why it matters:** copy inconsistency on the primary CRM action in the app.
**Fix:** pick one verb ("Add Customer") and apply it to every trigger/title/button in the flow.
**Effort:** S   **Risk:** Low   **Blast radius:** 6 files

### [SEV-2] FND-008 · Void/reverse action wording is systemically split, including within single files

**STATUS: FIXED (BATCH-5).** Standardized on "Void" everywhere in both modules — rowAction labels, dialog titles, confirm buttons, inline reason-form labels, and the pending-list context-menu items. `purchases/page.tsx`'s rowAction ("Reverse Purchase" → "Void Purchase"), `purchases/new/page.tsx`'s pending-context-menu item and inline form ("Reverse Purchase"/"Reverse reason:"/"Reverse" → "Void Purchase"/"Void reason:"/"Void"), `purchases/unpaid/page.tsx`'s rowAction/dialog title/confirm button ("Reverse Purchase"/"Reverse Purchase"/"Confirm Reversal" → "Void Purchase"/"Void Purchase"/"Confirm Void"), and the identical set of fixes mirrored in `sales/new/page.tsx` and `sales/unpaid/page.tsx`. `sales/page.tsx`'s detail page was already correct ("Void Sale") and needed no change.
**Evidence:** `purchases/page.tsx:189` rowAction "Reverse Purchase" but its own confirm button (`:481`) says "Confirm Void" — a 3rd variant inside one file; `purchases/[id]/page.tsx:260,349,366` consistently says "Void Purchase"; `purchases/unpaid/page.tsx:421,439-441` says "Reverse Purchase" / "Confirm Reversal" (a 4th variant); `sales/page.tsx` is internally consistent on "Void Sale" throughout.
**Fix:** standardize on "Void" (majority usage, and what both detail pages already say) across rowAction labels, dialog titles, and confirm buttons in both modules.
**Effort:** S   **Risk:** Low   **Blast radius:** ~8 files

### [SEV-2] FND-009 · Export/Download copy differs three ways for the same action

**STATUS: FIXED (BATCH-5).** Standardized on "Download" + format-name, PDF listed first — matching the convention Reports' `DownloadButtons.tsx` already used (left unchanged). `stock/grid/page.tsx`'s dropdown trigger and its two items ("Export"/"Export Excel"/"Export PDF" → "Download"/"Download PDF"/"Download Excel", PDF and Excel order swapped to match Reports); `AppShell.tsx`'s audit-log toolbar button ("Export" → "Download").
**Evidence:** "Export Excel"/"Export PDF" (`stock/grid/page.tsx:163-171`) vs. "Download PDF"/"Download Excel" (`reports/_components/DownloadButtons.tsx:50,55`) vs. bare "Export" (`AppShell.tsx:120`, audit-log toolbar, `.xlsx` only).
**Fix:** standardize on one verb + one format order app-wide.
**Effort:** S   **Blast radius:** 3 files

### [SEV-2] FND-010 · Payment-settlement verb and icon differ between purchases and sales for the identical action

**STATUS: FIXED (BATCH-5) for the copy/icon; the functional asymmetry is deliberately left open as a product decision, not silently resolved.** Standardized on "Process Payment" — chosen because it was already the established, shared wording in both sides' *Split* Payment sub-modals ("Process Full Payment" appears verbatim in both `SplitPaymentModal.tsx` and `SaleSplitPaymentModal.tsx`), so this reconciles the top-level modal with a convention that already existed one level down rather than inventing a new one. `RecordPaymentModal.tsx` (sales) — title, button, icon (`HandCoins` → `CreditCard`), and its toast message ("recorded" → "processed") — plus its two trigger labels in `sales/unpaid/page.tsx` and `sales/new/page.tsx`'s pending-context-menu ("Record Payment" → "Process Payment" in both). **Not changed:** sales' modal still allows an editable partial-payment amount while purchases' equivalent (`ProcessPaymentModal.tsx`) still forces full payment only — that's a real functional difference between the two flows, not just a wording one, and deciding whether purchases should gain partial-payment support (or sales should lose it) is a product call outside a copy-consistency fix.
**Evidence:** `ProcessPaymentModal.tsx` — title/button "Process Payment"/"Process Full Payment", icon `CreditCard` — vs. `RecordPaymentModal.tsx` — title/button "Record Payment", icon `HandCoins`. Sales' modal also supports partial payment; purchases' does not.
**Fix:** pick one verb; raise the partial-payment functional gap to a product decision alongside the copy fix.
**Effort:** S (copy) / M (if closing the functional gap)   **Blast radius:** 2 files

### [SEV-2] FND-011 · Four independent "danger red" values, including in the codebase's own stated reference file

**STATUS: FIXED (BATCH-1)** for the reference-file half of this finding. All 11 occurrences of `#DC3545` in `police/page.tsx` plus `rpx/primitives.tsx:16`'s `FormLabel` required-asterisk now use `colors.danger` (`#C0392B`); the 3 matching `#FDECEA` background literals now use `colors.dangerBg`. The remaining Tailwind `red-50/500/600/700` usage in Gate/Scale kiosks and Scale-admin is intentionally **not** touched here — those surfaces are on the kiosk-shell/Scale-admin-shell redesign track ([REDESIGN.md](./REDESIGN.md)), not a color-token swap, since they have no relationship to `colors.*` at all yet.
**Evidence:** `colors.danger` `#C0392B` (correctly used in `LoginForm.tsx:103`) vs. `#DC3545` (`police/page.tsx` ×11, `rpx/primitives.tsx:16`) vs. raw Tailwind `red-50/500/600/700` (Gate, Scale kiosk, Scale-admin modals).
**Why it matters:** `police/page.tsx` is documented at `rpx/styles.ts:1-11` as "extracted verbatim" into the house tokens — yet its own danger color doesn't match the extraction.
**Fix:** reconcile `#DC3545` → `colors.danger` app-wide, or, if intentionally distinct, document it as its own named token rather than leaving it silent.
**Effort:** S   **Risk:** Low   **Blast radius:** ~6 files

### [SEV-2] FND-012 · Row height for "list of records" pages is inconsistent

**STATUS: FIXED (BATCH-4), with a scoped deviation from the literal plan.** The backlog's original plan was to rebuild audit-log's table on the shared `DataTable` component outright. On inspection, `DataTable` has no built-in support for an inline-expanding detail row — audit-log's core interaction (click a row to reveal an Old-Values/New-Values JSON diff directly beneath it) isn't reachable through `DataTable`'s per-cell `render()` model without either extending `DataTable` with a new row-expansion feature (a shared-component change well beyond this batch) or dropping the inline-expand UX for a modal. Neither was in scope, so instead: the two specific violations named in this finding — 32px rows instead of the house 30px, and the Unicode ▲/▼ (fixed in FND-013 below) — were corrected in place on the existing hand-rolled table, which fully resolves what this finding actually cited without a structural rewrite.
**Evidence:** `layout.tableRowH=30` (`design-tokens.ts:226`), enforced by `DataTable.tsx` and rpx `TD`/`TH` — vs. `audit-log/page.tsx:213,216,228-234` (hand-rolled table, **32px**, the confirmed outlier) vs. `cashup/page.tsx` recon ledger (24-26px) vs. `police-register/page.tsx:372` nested sub-table (24px).
**Fix:** rebuild audit-log's table on the shared `DataTable`/`TH`/`TD` primitives — this also resolves FND-013 for free.
**Effort:** M   **Risk:** Low (read-only table, no interaction logic to preserve)   **Blast radius:** 1 file

### [SEV-2] FND-013 · audit-log breaks the app's otherwise-universal lucide icon rule

**STATUS: FIXED (BATCH-4).** The Unicode `▲`/`▼` expand indicator now swaps between lucide `ChevronDown`/`ChevronRight`, matching `police-register/page.tsx`'s identical expand affordance exactly (same two icons, same swap-by-state pattern, not a CSS rotation of one icon).
**Evidence:** `audit-log/page.tsx:234` renders literal Unicode `▲`/`▼` for row-expand, vs. the structurally identical pattern in `police-register/page.tsx:311` correctly using `ChevronDown`/`ChevronRight`.
**Fix:** swap in the same lucide icons.
**Effort:** S (trivial)   **Blast radius:** 1 file

### [SEV-2] FND-014 · Button order is reversed on the app's one full-page form

**STATUS: FIXED (BATCH-2).** `customers/new/page.tsx`'s bottom action bar now renders Cancel then Save (left to right), matching every dialog footer in the app. While in this file, its one-off action-bar gradient literal (`linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)` — flagged in TOKENS.md's mapping table for BATCH-1 but missed in that pass) was also caught and fixed to import `HEADER_GRAD`.
**Evidence:** `customers/new/page.tsx:380-381` renders Save (primary) then Cancel; every dialog footer sampled elsewhere (Blacklist/Delete/Convert/Create-Customer/Void, across purchases/sales/customers) places Cancel first, primary/danger rightmost.
**Fix:** swap the order on this one action bar.
**Effort:** S   **Blast radius:** 1 file

### [SEV-2] FND-015 · `styles.moneyPositive/moneyNegative/moneyNeutral` are dead code; "positive money green" itself has two values

**STATUS: PARTIALLY FIXED (BATCH-1).** Root cause resolved: `tailwind.config.ts`'s `rpx.green` (`#217346`) and `design-tokens.ts`'s `colors.action` (`#10b981`) were two independently-declared "canonical" greens that disagreed with each other — `colors.action` is now repointed to `#217346` to match, with `colors.actionHover` recomputed to `#1a5c38`. Every hand-rolled `'#217346'` literal now imports `colors.action` instead (`purchases/new/page.tsx` ×7, `sales/new/page.tsx` ×8, the 4 payment modals, `LoansTab.tsx`/`BusinessLoanTab.tsx` "zero-balance" text color, `products/page.tsx` — confirmed already token-clean on inspection). Adjacent light-green background/border pairs (`#F0FDF4`/border-`#217346`) were also consolidated onto `colors.actionBg`/`colors.action`. **Not fixed:** `styles.moneyPositive/moneyNegative/moneyNeutral` (`design-tokens.ts:274-290`) remain unused dead code — actually wiring every money-rendering call site onto those shared objects (rather than ad hoc `fontFamily:'monospace'` + manual color picks) is a larger, more invasive change spanning ~15 files' rendering logic and is deferred to BATCH-2/4, not a pure token-value fix. The color is now consistent; the *mechanism* duplication is not yet resolved.
**Evidence:** zero usages anywhere in `src/app/app/(modules)` (grep-verified); 100+ hand-rolled `fontFamily:'monospace'` call sites across purchases/sales/products/price-groups/stock/expenses/cashup/payments/customers. `colors.action` `#10b981` vs. hand-rolled `#217346` used for the identical semantic value in `purchases/new/page.tsx`, `ProcessPaymentModal.tsx`, `products/page.tsx` — even `purchases/[id]/page.tsx` (correct, uses `colors.action`) disagrees with `purchases/new/page.tsx` (uses `#217346`) inside the same module.
**Fix:** either wire `styles.money*` into real use, or delete them and formally adopt `#217346` as the documented canonical money-green if that's the real intended brand color — right now the codebase has two candidate truths chosen at random per file.
**Effort:** M   **Risk:** Low   **Blast radius:** ~15 files

### [SEV-2] FND-016 · Money/reference columns are monospace but left-aligned everywhere `DataTable` renders them

**STATUS: FIXED (BATCH-2).** `DataTable.tsx`'s `Column<T>` interface gained an `align?: 'left' | 'right'` option, applied to both the header `<th>` (including flipping the sort-icon's flex justification) and body `<td>`. Applied to the money column in `purchases/page.tsx` and `sales/page.tsx` (Total), all quantity columns in `stock/page.tsx` (Opening/In/Out/On Hand — including fixing the "On Hand" cell's icon+value `flex` wrapper to `justify-end`, since `text-align` doesn't affect block-level flex children) and `stock/grid/page.tsx` (all 6 columns), Buy/Sell/Margin in `products/page.tsx`, and Amount/VAT in `expenses/page.tsx` and Amount in `payments/page.tsx`. **Not touched:** `price-groups/page.tsx` — its outer list has no money column (prices live only in the "Manage" modal's bespoke non-`DataTable` table, a different fix outside this finding's scope as written).
**Evidence:** `DataTable.tsx` has no alignment prop (grep-confirmed); every DataTable-rendered money column (purchases, sales, products, price-groups) is left-aligned, while hand-built summary/tfoot rows on the detail pages (`purchases/[id]/page.tsx:196,205-227`, `sales/[id]/page.tsx`) correctly right-align via explicit `textAlign`.
**Why it matters:** the brief specifically calls for right-aligned tabular figures as a Win7 baseline; this is the single most consistent gap in the "lists and data" category.
**Fix:** add an `align?: 'left'|'right'` column option to `DataTable` and set it for every money/ID/date column across the ~8 lists that use it.
**Effort:** M   **Risk:** Low   **Blast radius:** 1 shared component + ~8 call sites

### [SEV-2] FND-017 · The stated reference page uses a private color palette that doesn't match the tokens it supposedly produced

**STATUS: FIXED (BATCH-1).** Resolved in favor of `design-tokens.ts` (updating the page rather than the tokens, per the lead's implicit preference for consolidating onto the documented system): `police/page.tsx`'s success check (`#1C8743` → `colors.action`), in-progress banner (`#FFF7E6`/`#7A5200`/`#9A7B2D` → `colors.warningBg`/`colors.warning`, and the border literal `#F2AB1A` that coincidentally matched `colors.tabAccent` now correctly reads `colors.warning`), and info box (`#EFF4FB`/`#33507E` → `colors.processBg`/`colors.process`) all now consume the shared tokens. The page's `#F2AB1A` header icon accent (a legitimate, unrelated usage) was left untouched.
**Evidence:** see [INVENTORY.md §3c](./INVENTORY.md#3c-colors--key-drift-points-not-an-exhaustive-hex-dump-the-load-bearing-drifts) — `police/page.tsx`'s success (`#1C8743`), in-progress banner (`#FFF7E6`/`#7A5200`/`#9A7B2D`), and info-box (`#EFF4FB`/`#33507E`) colors all differ from `colors.action`/`warningBg`/`processBg` in `design-tokens.ts`.
**Fix (lead-auditor judgment call):** either update `design-tokens.ts` to match what `police/page.tsx` actually uses, or update `police/page.tsx` to use the documented tokens — currently neither file is "the truth," which is worse than either alone.

### [SEV-2] FND-018 · Scale-admin has no shell and is a fully separate, generic-Tailwind SaaS dashboard
**Evidence:** `scale/admin/layout.tsx:4-10` (auth-check only, zero chrome); `admin/page.tsx` (entire file, zero `colors.*`/`tw.*` usage); `orders/page.tsx:8` imports design-tokens but uses them only inside one sub-component (`PhotoViewerOverlay`) — the rest of the same file is 100% raw Tailwind; hand-rolled `fixed inset-0 bg-black/50` modals with no `role="dialog"`/focus trap.
**Fix:** goes on the redesign list ([REDESIGN.md](./REDESIGN.md)) — wrap in an AppShell-equivalent and restyle the dashboard/orders table on `DataTable` + `colors.*`.
**Effort:** L   **Blast radius:** 3 files, structurally significant

### [SEV-2] FND-019 · The three "sibling" kiosk apps share no chrome and disagree on header treatment and accent hue
**Evidence:** `GateClientLayout.tsx:36` (gradient navy header) vs. `ScaleClientLayout.tsx:111` (flat `slate-900`, no gradient) vs. `police/page.tsx:185-208` (a third bespoke navy header); Gate = `blue-600` accent throughout vs. Scale = emerald-only; Gate login = radial gradient vs. Scale login = flat vs. Police = neither.
**Fix:** extract one `KioskShell` component parameterized by accent color; goes on the redesign list.
**Effort:** L   **Blast radius:** structural, spans 3 modules

### [SEV-2] FND-020 · A fully-built, never-imported second printer-setup wizard exists as dead code and disagrees with the shipped version's colors

**STATUS: FIXED (BATCH-3).** Re-confirmed zero references (grep) immediately before deleting; the entire `scale/components/printer/` directory (`PrinterSetupWizard.tsx` + `StepConnectionType.tsx`, `StepDeviceSelection.tsx`, `StepConfiguration.tsx`, `StepTestPrint.tsx`, `index.ts`) has been removed.
**Evidence:** `scale/components/printer/PrinterSetupWizard.tsx` + 4 step files, exported via `printer/index.ts`, confirmed zero imports anywhere (grep-verified). Shipped `PrinterSetup.tsx` (wired at `ScaleClientLayout.tsx:8,177`) is emerald-only; the dead wizard mixes blue and emerald.
**Fix:** delete the dead tree, or wire it in and delete the shipped single-screen version instead — maintaining both in parallel is pure risk with zero upside.
**Effort:** S (deletion)   **Risk:** none (confirmed unreferenced)   **Blast radius:** 5 files removed

### Additional BATCH-2 fixes (not individually numbered above)

**`RpxDialogContent`'s 10px radius** ([TOKENS.md §5](./TOKENS.md#5-radii-currently-4-competing-values--2px--3px--8px--10px)) — **STATUS: FIXED.** `rpx/Dialog.tsx` now uses 3px, matching every other panel/dialog in the house style. While in this file, its close-button hover color (`'#C0392B'` hardcoded) was also repointed to `colors.danger`.

**Stocktake detail's panel radius** (2px hardcoded vs. `PANEL`'s 3px, [TOKENS.md §5](./TOKENS.md#5-radii-currently-4-competing-values--2px--3px--8px--10px)) — **STATUS: FIXED.** The two content-panel containers (Add Count Entry, Count Entries) in `stocktake/[id]/page.tsx` now spread the imported `PANEL` constant instead of hand-rolling `background`/`border`/`borderRadius`/`overflow` inline — this also changes their border color from `colors.border` (`#E0E0E0`) to `CARD_BORDER`'s `#B0B0B0`, consistent with every other panel in the app. The many small status-badge/pill `borderRadius: 2` values elsewhere in the same file were left as-is — those already correctly match `layout.inputRadius`, this finding was specifically about the panel containers.

**`layout.toolbarH` vs. `AppShell`'s actual rendered height** ([TOKENS.md §7](./TOKENS.md#7-control-heights)) — **STATUS: FIXED.** Token changed from 36 to 32 to match what `AppShell.tsx:706`'s `var(--rpx-toolbar-h, 32px)` actually renders. Confirmed this token is not consumed anywhere in the codebase (`AppShell` hardcodes its own CSS variable rather than importing it) — like `styles.moneyPositive` in BATCH-1, this is a correctness fix for a currently-dead value, not a rendered-output change.

### [SEV-3] FND-021 · Toast usage is pervasive with no Win7 equivalent
**Evidence:** 112+ confirmed `toast.*` calls in the back-office batch alone, ~57+ app-wide.
**Fix:** not a code change — a product decision to ratify. Spot-checked: destructive/blocking actions already route through a `Dialog` first in every case sampled, with toasts reserved for transient confirmations — this already looks like the right split, it just needs to be an explicit, written decision rather than an implicit one.

### [SEV-3] FND-022 · Reports' `DateRangeFilter` is the clearest single before/after case of the two-token-system problem
**Evidence:** `ReportViewer.tsx:332-341`, `DateRangeFilter.tsx:34,38,43` (shadcn `h-9`/`rounded-md` beside 30px/2px rpx filters in the same row).
**Fix:** rebuild on the `inp` primitive. (Rolled into FND-004's remediation; called out separately as the single clearest before/after screenshot candidate for a design-review deck.)
**Effort:** S   **Blast radius:** 1 file

### [SEV-3] FND-023 · Self-referential toolbar links

**STATUS: FIXED (BATCH-3).** Payments' "Account Balances" toolbar button no longer renders while already on `/app/payments/balances`; Settings' "Users" button no longer renders while already on `/app/settings/users`. Fixed at the two specific call sites in `useToolbarButtons()` rather than a blanket `href === pathname` filter — Stock's 3-button route-switcher (`Stock On Hand`/`Movements`/`Grid`) deliberately keeps showing the current page's own button highlighted `primary`, since that's an intentional "which view am I on" tab pattern, not a dead link; a generic filter would have broken it. Settings' "Add User" button also stays visible on the Users page itself, since it drives `?create=1` and remains genuinely actionable there.
**Evidence:** `AppShell.tsx`'s route matching uses `pathname.startsWith()`, so Payments' "Account Balances" button still renders (pointing at itself) while already on `/app/payments/balances`; same issue for Settings/Users' "Users" link.
**Fix:** add an exact-route exclusion in `ToolbarBtn`/`useToolbarButtons`.
**Effort:** S   **Blast radius:** 1 file (`AppShell.tsx`)

### [SEV-3] FND-024 · Wrong-country placeholder text

**STATUS: FIXED (BATCH-5), and the underlying bug turned out to reach further than a placeholder.** Both UI placeholders — `police-register/page.tsx`'s "Pretoria Central" and `police/page.tsx`'s "e.g. Pretoria Central" — now read "Mbabane Central" (Eswatini's capital, matching the reference role Pretoria played in the original text). While tracing every "Pretoria" occurrence in the codebase, found the same wrong-country default baked into **actual generated legal documents**: `src/lib/services/purchaseService.ts:118` and `src/app/api/purchases/[id]/vat264/route.ts:71` both fall back to `dealerAddress: 'Pretoria, South Africa'` whenever the `yardAddress` setting is empty — meaning a VAT264 form generated before the yard address is configured would print a South African address for this Matsapha, Eswatini business. Both now fall back to `'Matsapha, Eswatini'`. Also updated a test fixture (`policeVisitService.test.ts`) for consistency, though it carries no functional impact. This second part goes beyond a pure UI-copy fix, but it's the same root defect and clearly more consequential than the placeholder it was filed alongside.
**Evidence:** `police-register/page.tsx:178` — "Police Station" placeholder reads "Pretoria Central" (South Africa); this business operates in Matsapha, Eswatini (a previously-known issue in `police-defaults.ts`, now confirmed to also appear directly in this page).
**Fix:** change the placeholder to an Eswatini precinct name.
**Effort:** S   **Blast radius:** 1 file

### [SEV-3] FND-025 · `AppSidebar.tsx` is dead code

**STATUS: FIXED (BATCH-3).** Re-confirmed zero references immediately before deleting; the file is gone.
**Evidence:** grep for `AppSidebar` returns only its own definition — never imported.
**Fix:** delete. It also happens to contain its own 3rd button/color drift, so removing it is a small net simplification, not just cleanup.
**Effort:** S   **Risk:** none   **Blast radius:** 1 file removed

### Additional BATCH-1 fixes (not individually numbered above)

**The 4 payment modals' undocumented amber/orange palette** (`SplitPaymentModal.tsx`, `ProcessPaymentModal.tsx`, `SaleSplitPaymentModal.tsx`, `RecordPaymentModal.tsx` — noted in [INVENTORY.md §3c](./INVENTORY.md#3c-colors--key-drift-points-not-an-exhaustive-hex-dump-the-load-bearing-drifts), no dedicated FND number) — **STATUS: FIXED.** All 7 hex values (`#FFF8E1`,`#FFE082`,`#F57F17`,`#FFF3E0`,`#FFCC80`,`#E65100`,`#EF6C00`) now map onto the existing `colors.alertBg`/`alertBorder`/`alertIcon`/`alertText` tokens (`design-tokens.ts:96-108`) that were already defined for exactly this "loan/alert banner" purpose. `colors` import added to all 3 files that lacked it.

**Change-password's raw-Tailwind strength meter** (noted in the Aero-score table row for `/app/change-password`, no dedicated FND number) — **STATUS: FIXED.** `getStrength()` now returns `colors.danger`/`warning`/`process`/`action` hex values instead of Tailwind class names (`bg-red-500` etc.), and the strength bar + requirement-checklist icons/text switched from `className` color utilities to inline `style` so the hex tokens apply. The unfilled-segment track color was left as a neutral (`colors.border`) rather than forced onto a semantic token, since it represents "empty," not a status.

**`DataTable.tsx`'s row-hover blue** (`#D6E8FF`, noted in [INVENTORY.md §3c](./INVENTORY.md#3c-colors--key-drift-points-not-an-exhaustive-hex-dump-the-load-bearing-drifts) as drifting from `colors.rowHover`) — **STATUS: FIXED.** The row-hover JS handler now sets `colors.rowHover` (`#EBF3FC`) instead of the hardcoded literal. Left untouched, deliberately: the dropdown/menu-item hover states elsewhere in the same file (`hover:bg-[#D6E8FF]` on the row-actions kebab menu) — those are a different UI affordance (menu item, not table row) and weren't the specific drift this finding named; consolidating them too would be reasonable but is scope creep beyond what was cited.

**New tokens added, not yet consumed by any rendered page** — `colors.mainInstruction` (`#003399`) and `colors.link` (`#0066CC`) were added to `design-tokens.ts` and wired into `styles.pageTitle`/`styles.sectionTitle` per the plan in [TOKENS.md §3](./TOKENS.md#3-type-ramp-mostly-correct--one-real-gap). On inspection, **neither shared style object is currently imported anywhere** — they were already dead code before this change. Adding the Win7 main-instruction blue to real, rendered page headings would mean touching every page's heading markup individually, which is a layout-scale change explicitly out of BATCH-1's "tokens only" boundary. Recommend this becomes its own BATCH-2/4 item rather than being silently claimed as fixed here.

### [SEV-4] FND-026 · Unreachable dark-mode CSS block

**STATUS: FIXED (BATCH-6).** Re-confirmed before deleting: no `ThemeProvider` exists anywhere in the app and nothing ever adds a `dark` class to the DOM (`ui/sonner.tsx`'s `useTheme()` call from `next-themes` always resolves to the default, since there's no provider backing it) — the `.dark { ... }` OKLCH block in `globals.css` was genuinely unreachable, not merely unused-looking. Deleted the whole block. Tailwind's own `dark:`-prefixed utility classes used elsewhere (e.g. in `ui/button.tsx`) are unaffected either way — they were already inert without a `.dark` ancestor class and remain exactly as inert now, so this removes dead CSS without changing any rendered output.
**Evidence:** `globals.css:68-96` (`.dark` OKLCH overrides) — no `dark` class toggle exists anywhere in the app (grep-confirmed), despite `next-themes` being an installed dependency.
**Fix:** delete if dark mode isn't planned, or wire up `next-themes` if it is. Dead weight either way, and not a Win7-relevant question either way.
**Effort:** S   **Blast radius:** 1 file

### Additional BATCH-3 fix (not individually numbered above)

**`BannerBar` absent from `(portal)/layout.tsx`** (INVENTORY.md §6, no dedicated FND number) — **STATUS: FIXED.** Wired `<BannerBar banners={banners} />` into the dashboard's layout, fetching via the same `fetchActiveBanners(session.user.tenantSlug)` call `(modules)/layout.tsx` already uses — its absence looked like an unremarked gap (platform subscription/maintenance banners are exactly as relevant on the dashboard as anywhere else), unlike `WindowedContent`'s dashboard exemption, which is provably deliberate (`WindowedContent.tsx:18` hard-codes `if (pathname === '/app/dashboard') return`). **Deliberately not changed:** the dashboard still doesn't get `LicenseGate` or `WindowedContent` — extending license enforcement to a route it doesn't currently cover is a business-logic scope decision beyond what this UI audit's backlog asked for, not a styling fix, and is flagged here rather than silently done.

### Additional BATCH-4 fixes (not individually numbered above)

**Settings: zero required-field marking, no client-side validation** (called out in the Aero-score table row for `/app/settings`, no dedicated FND number) — **STATUS: FIXED.** `Yard/Business Name` and `VAT Registration Number` — the two fields the audit specifically named as "functionally-required-feeling" — now render with the same required-asterisk convention used on `customers/new`, and `handleSave()` validates both are non-empty before submitting, showing an inline error and toast rather than silently PUTting incomplete data. This is a lightweight local-state validator, not a full Zod/react-hook-form wire-up (the page has no such form-library scaffolding today) — a full schema-driven rewrite of this form is a larger change than this batch's "add missing validation" scope called for.

**`customers/[id]`: no required marking in edit mode; three different "why is this disabled" states rendered identically** (called out in the customers-module batch report, no dedicated FND number) — **STATUS: FIXED.** First Name, Last Name, and Phone — all `z.string().min(1)` in `UpdateCustomerSchema` — now carry the same required-asterisk convention as the create form. The permanently-disabled ID Number field (disabled regardless of edit mode, unlike every other field which is only disabled outside edit mode) now carries an explanatory "Cannot be changed once a record exists" hint so it reads as a different kind of disabled, not just "not in edit mode yet." **Already correctly handled, no change needed:** Dealer Category's role-gating already appends "(admin only)" to its own label — on inspection this was not the blank slate the original audit pass described, so the fix here is narrower than that finding implied.

### Additional BATCH-5 fixes (not individually numbered above)

**Missing `error`/`loading` props on 10 `DataTable` call sites** (enumerated in AUDIT.md's consistency-matrix Error column and BACKLOG.md Batch-5 item 7, no dedicated FND number) — **STATUS: FIXED.** `error` (and, for `price-groups`, `loading` too — it was missing both) now flows from `useSWR`'s own `error`/`isLoading` into `DataTable`'s props on: `purchases/unpaid`, `sales` (which also gained the `+ New Sale` empty-action button `purchases`' equivalent list already had), `sales/unpaid`, `products`, `price-groups`, `stock`, `stock/movements`, and `stocktake`. `stock/grid` keeps its existing bespoke "Building grid…" loading branch (a pre-existing, separately-noted stylistic choice, not part of this fix) but now also surfaces `error`. `photos` isn't `DataTable`-based (it's a card gallery), so it gained an equivalent hand-built error branch instead, correctly excluded from the empty-state check so a failed fetch no longer renders as indistinguishable from "no photos match."

---

## Page-by-page notes

Full file:line evidence for every claim below lives in the four batch reports folded into this document; grouped here by module for readability. Structural redesign recommendations (with wireframes) for the lowest-scoring groups live in [REDESIGN.md](./REDESIGN.md) — this section covers what's fixable in place.

**Auth entry points** (`/login`, `/gate/login`, `/scale/login`) — three independent hand-rolled full-screen layouts, no shared auth-shell. `/login` is the one file in the entire app with correct `htmlFor`/`id` label pairing — worth generalizing that pattern outward rather than just fixing the visual gradient gap. Recommend: one shared `AuthShell` (navy panel + centered card using house `CARD_BORDER`/`BAR_GRAD`, not `rounded-lg`/`shadow-lg`), reused by all three.

**Kiosk workflows** (Gate, Scale) — functionally solid (progress steps, empty states, keyboard nav on Scale's weight editor); aesthetically the two do not read as siblings at all. See FND-019 and [REDESIGN.md](./REDESIGN.md) for the proposed shared `KioskShell`.

**Scale admin** — the one subtree that should probably not be patched incrementally; see FND-018 and [REDESIGN.md](./REDESIGN.md).

**Police officer portal** — the strongest single page in the app structurally (correct token imports throughout, real drawer-not-modal pattern, folder-tab-adjacent search UI) undercut only by its private color palette (FND-017) and lack of `htmlFor`. Worth treating as the actual template for other pages once FND-017 is resolved — right now it's a template with an asterisk.

**Portal shell + dashboard** — `AppShell` itself (title bar, contextual toolbar, `WindowTaskbar`, footer clock) is the single best Aero-echo in the codebase and should not be touched beyond FND-023's toolbar-link fix. The dashboard's tile grid is a real departure (Win10 Start-tile language, not Win7) — see [REDESIGN.md](./REDESIGN.md) for a Control-Panel-category-view alternative that would read as more period-correct without losing the "launcher" function.

**Customers / Casual** — good bones (two-column property-sheet form, nested tab-in-tab detail view genuinely echoes a Win7 property dialog) let down by copy drift (FND-007), button-order reversal (FND-014), and a second full parallel implementation of the detail view inside `CustomerProfileModal.tsx` that should probably be deleted in favor of always navigating to the real page (a structural question for the lead, not just a style one — flagged here, decision left to REDESIGN.md/BACKLOG.md prioritization).

**Purchases / Sales** — the two POS-style entry wizards (`purchases/new`, `sales/new`) are the most-used screens in the app and the ones most in need of FND-003/FND-004 cleanup, plus a genuine UX gap: neither has a back/cancel control (FND: see Aero score table). Detail pages (`[id]`) are the most token-compliant pages in the whole app — use them as the reference for fixing their own list/new siblings.

**Products / Price-groups** — Products' real toolbar wiring and Price-groups' `HEADER_GRAD` usage on a raw table are both good; Price-groups' total lack of a `FilterBar` and of any loading/error state is the more urgent gap of the two (state coverage, not aesthetics).

**Stock / Stocktake** — internally the most consistent module in the audit (shared `DataTable`, shared toolbar-as-tabs pattern) aside from Stocktake detail's two hardcoded gradient literals.

**Cash-Up / Float** — Cash-Up is dense and mostly token-correct; its hand-rolled recon ledger at a 3rd row-height value is the one thing worth normalizing, not the overall structure.

**Expenses / Payments** — Expenses is a genuine reference example (best empty state in the app, correct `TabStrip`); Payments' bespoke `DirectionBadge` should be folded into `statusStyle()` per FND-006.

**Audit-log / Reports / Photos / Police-register** — the most structurally varied group in the app (4 different "how do I show N records" approaches for record-list-shaped data: `DataTable`, hand-rolled table, master-detail rail, card gallery). Photos' card-gallery departure is *correct* for its content type and shouldn't be forced into a table; Audit-log's hand-rolled table (FND-012/013) has no such justification and should simply adopt `DataTable`.

**Settings / Users / Change-password / Support** — Settings' complete absence of required-field marking and validation display is the most consequential form-quality gap found in the audit (more so than any color/gradient issue on this specific page); Change-password's raw-Tailwind strength meter is the most visually obvious one-off color system in the whole app, precisely because it sits right beside otherwise-correct `inp` usage. Support is this group's (and arguably the whole app's) best example of using the shared token helpers as designed.
