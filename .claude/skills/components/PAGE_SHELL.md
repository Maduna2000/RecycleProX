# Component Spec: PageShell
# Every page in the app uses this wrapper.
# File: src/components/layout/PageShell.tsx

---

## Purpose

Enforces the three-zone layout on every page consistently.
Import and wrap every page with this component.

---

## Props

```ts
interface PageShellProps {
  // Zone 2 — toolbar
  title:        string            // e.g. "Purchases"
  subtitle?:    string            // e.g. "Record and manage purchases"
  actions?:     ToolbarAction[]   // buttons in the toolbar
  searchConfig? {                 // if page has search
    placeholder: string
    value:       string
    onChange:    (val: string) => void
  }
  
  // Zone 3 — content
  children:     ReactNode
}

interface ToolbarAction {
  label:     string
  icon?:     LucideIcon
  onClick:   () => void
  variant:   'primary' | 'secondary' | 'danger'
  role?:     UserRole             // hide if user lacks role
  disabled?: boolean
}
```

---

## Usage

```tsx
export default function PurchasesPage() {
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  
  return (
    <PageShell
      title="Purchases"
      subtitle="Record and manage purchase transactions"
      actions={[
        {
          label: 'New Purchase',
          icon: Plus,
          onClick: () => setDrawerOpen(true),
          variant: 'primary',
        },
        {
          label: 'Void',
          icon: X,
          onClick: handleVoid,
          variant: 'danger',
          role: 'manager',
        }
      ]}
      searchConfig={{
        placeholder: 'Search by customer name, ref...',
        value: search,
        onChange: setSearch,
      }}
    >
      {/* Zone 3 content goes here */}
      <PurchasesTable search={search} />
    </PageShell>
  )
}
```

---

## Rendered Structure

```tsx
<div className="flex flex-col h-full">
  {/* Zone 2 — Contextual Toolbar */}
  <div className="h-14 bg-toolbar border-b border-border flex items-center 
                  justify-between px-6 flex-shrink-0">
    {/* Left: title + subtitle */}
    <div>
      <h1 className="text-base font-semibold text-textPrimary">{title}</h1>
      {subtitle && (
        <p className="text-xs text-textMuted">{subtitle}</p>
      )}
    </div>
    
    {/* Right: search + action buttons */}
    <div className="flex items-center gap-3">
      {searchConfig && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 
                             h-4 w-4 text-textMuted" />
          <input
            className="pl-9 h-8 w-64 text-sm border border-border 
                       rounded-md bg-white focus:ring-1 focus:ring-process 
                       focus:border-process outline-none"
            placeholder={searchConfig.placeholder}
            value={searchConfig.value}
            onChange={e => searchConfig.onChange(e.target.value)}
          />
        </div>
      )}
      {actions?.map(action => (
        <RoleGatedButton key={action.label} action={action} />
      ))}
    </div>
  </div>

  {/* Zone 3 — Content Area */}
  <div className="flex-1 overflow-y-auto p-6">
    {children}
  </div>
</div>
```

---

## Toolbar Button Variants

```
primary:   bg-action (#217346) text-white — "New Purchase", "Save"
secondary: bg-white border border-border text-textPrimary — "Export", "Filter"
danger:    bg-white border border-danger text-danger — "Void", "Blacklist"
```

---

## RoleGatedButton

Buttons with a `role` prop are hidden entirely for users who lack that role.
Unlike tiles on the Portal (which are dimmed but visible),
toolbar buttons are hidden completely — they don't clutter the UI.

```tsx
function RoleGatedButton({ action }: { action: ToolbarAction }) {
  const { data: session } = useSession()
  
  const roleHierarchy = { cashier: 0, manager: 1, admin: 2 }
  const userLevel = roleHierarchy[session?.user.role ?? 'cashier']
  const requiredLevel = roleHierarchy[action.role ?? 'cashier']
  
  if (userLevel < requiredLevel) return null
  
  return (
    <Button
      variant={action.variant}
      size="sm"
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {action.icon && <action.icon className="h-4 w-4 mr-1.5" />}
      {action.label}
    </Button>
  )
}
```

---

## Tab Bar (Sub-navigation within a module)

Some modules have sub-sections (e.g. Purchases has "All | Completed | Voided | Pending").
These render as tabs INSIDE Zone 3, at the top of the content area.
They are NOT in the toolbar.

```tsx
// Inside the page's children, at the top of Zone 3:
<div className="flex gap-1 mb-4 border-b border-border">
  {tabs.map(tab => (
    <button
      key={tab.value}
      onClick={() => setActiveTab(tab.value)}
      className={cn(
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        activeTab === tab.value
          ? "border-process text-process"
          : "border-transparent text-textMuted hover:text-textPrimary"
      )}
    >
      {tab.label}
      {tab.count !== undefined && (
        <span className={cn(
          "ml-1.5 text-xs px-1.5 py-0.5 rounded-full",
          activeTab === tab.value ? "bg-process/10 text-process" : "bg-gray-100 text-textMuted"
        )}>
          {tab.count}
        </span>
      )}
    </button>
  ))}
</div>
```

---

## Checklist Before Committing a Page

- [ ] Page uses `<PageShell>` wrapper — not a custom layout
- [ ] `title` and `subtitle` are set (subtitle is optional but preferred)
- [ ] All action buttons are in the `actions` prop — not rendered in Zone 3
- [ ] Search input uses `searchConfig` prop — not rendered in Zone 3
- [ ] Zone 3 content starts with `<DataTable>` or a meaningful component
- [ ] No sidebar is rendered anywhere
- [ ] No hardcoded hex colours — uses Tailwind design tokens
- [ ] Page is responsive down to 1024px width minimum
