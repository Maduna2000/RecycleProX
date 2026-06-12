# RecycleProX UI Standards

Single source of truth for UI consistency across all pages and components.

## 1. Design Philosophy

RecycleProX uses a **Windows Aesthetic Legacy Design** — a clean, functional, data-dense interface inspired by enterprise software. Key principles:

- **Functional over decorative** — every element serves a purpose
- **Data density** — maximize information without clutter
- **Consistent patterns** — same UI patterns everywhere
- **Compact controls** — 24px input heights, tight spacing
- **Clear hierarchy** — subtle gradients and borders define sections

## 2. Color System

**IMPORTANT:** Always import colors from `@/lib/design-tokens`. Never hardcode hex values.

```typescript
import { colors, tw } from '@/lib/design-tokens'
```

### Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.primary` | `#1B3A6B` | Navy — nav bar, active tabs |
| `colors.action` | `#10b981` | Emerald-500 — primary buttons (Confirm, Save, Complete) |
| `colors.actionHover` | `#059669` | Emerald-600 — primary button hover state |
| `colors.process` | `#185ABD` | Blue — secondary buttons, links, info |
| `colors.warning` | `#C9A020` | Amber — pending states, warnings |
| `colors.danger` | `#C0392B` | Red — void, delete, errors |

### Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.textPrimary` | `#212529` | Body text, headings |
| `colors.textSecondary` | `#6C757D` | Labels, metadata |
| `colors.textMuted` | `#9CA3AF` | Placeholders, captions |
| `colors.textOnDark` | `#FFFFFF` | Text on colored backgrounds |

### Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.surface` | `#FFFFFF` | Cards, modals |
| `colors.bg` | `#F1F3F4` | Page background |
| `colors.toolbar` | `#F8F9FA` | Toolbar strips |
| `colors.rowHover` | `#EBF3FC` | Table row hover |

### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.border` | `#E0E0E0` | Standard borders |
| `colors.borderFocus` | `#185ABD` | Input focus ring |

### Status Badge Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `colors.actionBg` | `#ECFDF5` | Active, completed |
| `colors.warningBg` | `#FEF9EC` | Pending, submitted |
| `colors.dangerBg` | `#FDECEA` | Voided, blacklisted |
| `colors.processBg` | `#EBF3FC` | Open, info |
| `colors.neutralBg` | `#F1F3F4` | Inactive |

## 3. Typography

**Font Family:** Segoe UI, -apple-system, Arial, sans-serif

### Font Sizes

| Token | Size | Usage |
|-------|------|-------|
| `fontSize.xs` | 11px | Badges, timestamps |
| `fontSize.sm` | 12px | Table headers, form labels |
| `fontSize.base` | 13px | Table data, button text, body |
| `fontSize.md` | 14px | Section titles, modal headers |
| `fontSize.lg` | 16px | Page titles |

### Font Weights

| Token | Weight | Usage |
|-------|--------|-------|
| `fontWeight.regular` | 400 | Body text |
| `fontWeight.medium` | 500 | Important labels |
| `fontWeight.semibold` | 600 | Section titles |
| `fontWeight.bold` | 700 | Headings, stat values |

### Special Typography

- **Uppercase labels:** Form labels, table headers use `textTransform: 'uppercase'` with `letterSpacing: '0.04em'`
- **Monospace:** Use for codes, IDs, prices, quantities — `fontFamily: 'monospace'`

## 4. Component Patterns

### Buttons

**Primary Action Button (Confirm, Save, Complete):**
```tsx
style={{
  background: colors.action,      // emerald-500
  color: colors.textOnDark,
  border: 'none',
  borderRadius: 6,
  padding: '6px 16px',
  fontSize: fontSize.base,
  fontWeight: fontWeight.semibold,
}}
// Hover: background: colors.actionHover (emerald-600)
```

**Secondary Button:**
```tsx
style={{
  background: colors.surface,
  color: colors.process,
  border: `1px solid ${colors.process}`,
  borderRadius: 6,
}}
```

**Danger Button:**
```tsx
style={{
  background: colors.surface,
  color: colors.danger,
  border: `1px solid ${colors.danger}`,
  borderRadius: 6,
}}
```

### Inputs

**Standard Input Field:**
```tsx
style={{
  height: 24,
  border: `1px solid ${colors.border}`,  // #E0E0E0
  borderRadius: 2,                         // Windows-style tight corners
  padding: '2px 6px',
  fontSize: fontSize.base,
}}
// Focus: borderColor: colors.borderFocus (#185ABD)
```

### Tables

**Table Header Row:**
```tsx
style={{
  background: colors.bg,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: colors.textSecondary,
}}
```

**Table Data Row:**
```tsx
style={{
  height: 40,  // layout.tableRowH
  fontSize: fontSize.base,
  color: colors.textPrimary,
  borderBottom: `1px solid ${colors.rowDivider}`,
}}
// Alternating: background #FFFFFF / #FAFAFA
// Hover: background colors.rowHover (#EBF3FC)
```

### Modals / Popups

**Container:**
```tsx
style={{
  maxHeight: '90vh',           // Prevent viewport overflow
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,                // Allow flex children to shrink
}}
```

**Modal Title Bar (ModalTitleBar component):**
- Height: 28px
- Background: `rgba(27,58,107,0.05)`
- Border bottom: `1px solid rgba(0,0,0,0.07)`
- Close/minimize buttons on right

**Modal Content:**
```tsx
style={{
  flex: 1,
  overflowY: 'auto',           // Scrollable content
  minHeight: 0,
}}
```

### Windows Gradient Headers

For section headers with Windows aesthetic:
```tsx
style={{
  background: 'linear-gradient(180deg, #EAEAEA 0%, #D4D4D4 100%)',
  borderBottom: '2px solid #B0B0B0',
  padding: '6px 12px',
}}
```

### Status Badges

Use the `statusStyle()` helper from design-tokens:
```tsx
import { statusStyle } from '@/lib/design-tokens'

const s = statusStyle('completed')
<span style={s.badge}>{s.label}</span>
```

## 5. Layout Rules

### Page Containers

- Max width: 1600px
- Padding: 20-24px (use `layout.contentPadding`)
- Background: `colors.bg` (#F1F3F4)

### Cards

```tsx
style={{
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,  // layout.cardRadius
}}
```

### Modal/Popup Sizing

| Type | Max Height | Max Width |
|------|-----------|-----------|
| Small modal | 90vh | 28rem (448px) |
| Medium modal | 90vh | 42rem (672px) |
| Large modal | 92vh | 56rem (896px) |

**Critical:** Always use `max-h-[90vh]` not `h-[90vh]` to prevent content cutoff.

### Overflow Handling

- Modal content areas must have `overflow-y: auto`
- Title bars must be sticky or fixed to remain visible
- Close/minimize buttons must always be accessible

## 6. Dynamic Route Naming

### Breadcrumbs

Breadcrumbs must show **actual record names**, not generic module names:

| Route | Wrong | Correct |
|-------|-------|---------|
| `/app/purchases/abc123` | "Purchases" | "PUR-2025-001234" |
| `/app/customers/xyz789` | "Accounts" | "John Smith" |
| `/app/sales/def456` | "Sales" | "SAL-2025-000789" |

Implementation:
- Use `useRecordTitle` hook to fetch record-specific titles
- Pass actual title to `WindowedContent` component
- Update breadcrumb in `AppShell` to display record name

### Window Taskbar

Same principle — taskbar buttons should show record identifiers, not generic module names.

## 7. Enforcement Checklist

Before merging any UI code, verify:

### Colors
- [ ] All colors imported from `@/lib/design-tokens`
- [ ] No hardcoded hex values in JSX
- [ ] Action buttons use `colors.action` (emerald-500)
- [ ] Hover states use appropriate hover tokens

### Typography
- [ ] Font sizes use `fontSize.*` tokens
- [ ] Font weights use `fontWeight.*` tokens
- [ ] Labels are uppercase where appropriate
- [ ] Codes/prices use monospace font

### Layout
- [ ] Modals use `max-h-[90vh]` not `h-[90vh]`
- [ ] Content areas have `overflow-y: auto`
- [ ] Close buttons are always visible/accessible
- [ ] Cards use standard border radius (8px)

### Components
- [ ] Buttons follow primary/secondary/danger patterns
- [ ] Inputs have 24px height, 2px border-radius
- [ ] Tables have proper header/row styling
- [ ] Status badges use `statusStyle()` helper

### Navigation
- [ ] Breadcrumbs show actual record names
- [ ] Page titles are descriptive (not route segments)
- [ ] Window taskbar shows proper labels
