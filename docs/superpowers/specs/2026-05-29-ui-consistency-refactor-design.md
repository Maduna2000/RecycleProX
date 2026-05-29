# UI Consistency Refactor — Design Spec

**Date:** 2026-05-29
**Status:** Approved

---

## Problem Statement

Seven module pages have residual hardcoded hex values and inconsistent hover patterns that break the design token system. The standard is: all colours via `@/lib/design-tokens`, zero arbitrary hex in code.

---

## Standard Pattern

Every page must conform to:
- `PageShell` wrapper with title/subtitle/tabs/action props
- Tables use consistent `colors.*`, `fontSize.*`, `fontWeight.*` tokens throughout
- No hardcoded hex strings anywhere in page or component files
- Button hover states use `colors.actionHover` / `colors.processHover` tokens
- Row hover uses `colors.rowHover`

---

## Files Changed

### `src/lib/design-tokens.ts`
Add missing tokens:
- `purple`, `purpleBg` — admin role badge
- `violet`, `violetBg` — sale photo type tag
- `actionHover` — darker green for button hover states (`#185A38`)
- `processHover` — darker blue for button hover states (`#1249A0`)

### `settings/users/page.tsx`
- Replace hardcoded `#F3EBF9` / `#7B2D8B` admin badge with `colors.purpleBg` / `colors.purple`

### `stocktake/page.tsx`
- Replace hardcoded `#185A38` hover on New Stocktake button with `colors.actionHover`

### `police-register/page.tsx`
- Replace hardcoded `#1249A0` hover and text colour with `colors.processHover` / `colors.process`
- Replace hardcoded `#C7DDF5` border on legal note with `colors.processBg`
- Replace `border-[#E0E0E0]` Tailwind arbitrary values with `border-rpx-border`
- Replace `#185A38` hover in SignatureDialog with `colors.actionHover`

### `audit-log/page.tsx`
- Replace all hardcoded hex throughout table: `#B0B0B0`, gradient, `#374151`, `#F5F5F5`, `#D6E8FF`, `#E0E0E0`
- Fix `borderRadius: 0` on table container to use `layout.cardRadius`
- Replace Tailwind arbitrary `hover:bg-[#F1F3F4]`, `hover:bg-[#E8E8E8]` with tokens
- Use `colors.rowHover` for row hover state

### `price-groups/page.tsx`
- Replace hardcoded `#185A38` hover on buttons with `colors.actionHover`
- Replace `border-[#E0E0E0]` on Input fields with `border-rpx-border`

### `reports/page.tsx`
- No changes required — already fully tokenised

### `photos/page.tsx`
- Replace `#059669` / `#ECFDF5` with existing `colors.netWeightText` / `colors.netWeightBg`
- Replace `#8B5CF6` / `#F3EFFF` with new `colors.violet` / `colors.violetBg`
- Replace `hover:text-[#212529]` with inline `onMouseEnter/Leave` using `colors.textPrimary`

---

## Verification

1. `npx tsc --noEmit` → 0 errors
2. No hardcoded hex remains in the 7 page files
3. All pages render with consistent colours and hover states
