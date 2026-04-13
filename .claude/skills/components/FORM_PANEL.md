# Component Spec: FormPanel
# Every create/edit form in the app uses this component pattern.
# File: src/components/ui/FormPanel.tsx

---

## Purpose

One form pattern, used everywhere. Prevents inconsistent modals,
drawers, and inline forms appearing differently across modules.

---

## Two Variants

### Variant A — Drawer (for create/edit of main records)
Used for: Create Customer, Edit Customer, Add Expense, New Loan, etc.

Slides in from the RIGHT side of the screen.
Does NOT block the page behind it (not a modal overlay).

```
Width:  480px on desktop, full screen on < 768px
Height: full screen height
Background: white
Shadow: -4px 0 24px rgba(0,0,0,0.12)
Z-index: 50
```

Layout:
```
┌────────────────────────────────┐
│ Header (56px)                  │
│ [Title]              [× Close] │
├────────────────────────────────┤
│ Body (scrolls)                 │
│                                │
│ [form fields]                  │
│                                │
├────────────────────────────────┤
│ Footer (64px, sticky bottom)   │
│ [Cancel]      [Save / Submit]  │
└────────────────────────────────┘
```

### Variant B — Inline Form (for quick actions on a row)
Used for: Add Repayment on a loan, Mark as Paid, Quick Void.

Expands below the clicked row inside the table.
Does not open a drawer.

```
Background: #F8FAFF (very light blue)
Border: 1px solid #185ABD
Border-radius: 8px
Padding: 16px
Margin: 4px 0
```

---

## Props Interface

```ts
interface FormPanelProps {
  // Identity
  title:        string           // "Add Customer" / "Edit Customer"
  description?: string           // subtitle below title
  
  // State
  isOpen:       boolean
  onClose:      () => void
  isSubmitting: boolean          // shows loading on submit button
  
  // Variant
  variant?:     'drawer' | 'inline'  // default 'drawer'
  
  // Form
  onSubmit:     (data: FormData) => Promise<void>
  children:     ReactNode        // form fields go here
  
  // Footer
  submitLabel?: string           // default "Save"
  cancelLabel?: string           // default "Cancel"
  submitVariant?: 'action' | 'danger'  // action=green, danger=red
}
```

---

## Field Components

Use these for ALL form inputs. Never use raw `<input>` tags.

### Text input
```tsx
<FormField
  label="Customer Name"
  required
  error={errors.name?.message}
>
  <Input 
    {...register('name')}
    placeholder="Enter full name"
  />
</FormField>
```

### Select
```tsx
<FormField label="Customer Type" required error={errors.type?.message}>
  <Select onValueChange={(v) => setValue('type', v)}>
    <SelectTrigger>
      <SelectValue placeholder="Select type..." />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="casual">Walk-in / Casual</SelectItem>
      <SelectItem value="account">Account Customer</SelectItem>
    </SelectContent>
  </Select>
</FormField>
```

### Money input (Decimal)
```tsx
<FormField label="Amount (R)" required error={errors.amount?.message}>
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 
                     text-textMuted text-sm">R</span>
    <Input
      {...register('amount')}
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      className="pl-8 font-mono"
    />
  </div>
</FormField>
```

### FormField wrapper
```tsx
<div className="flex flex-col gap-1.5">
  <label className="text-sm font-medium text-textPrimary">
    {label}
    {required && <span className="text-danger ml-0.5">*</span>}
  </label>
  {children}
  {error && (
    <p className="text-xs text-danger flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      {error}
    </p>
  )}
</div>
```

---

## Form Sections

For forms with many fields, group them into labelled sections:

```tsx
<FormSection title="Personal Details">
  <div className="grid grid-cols-2 gap-4">
    <FormField label="First Name" required>...</FormField>
    <FormField label="Last Name" required>...</FormField>
  </div>
  <FormField label="ID Number" required>...</FormField>
</FormSection>

<FormSection title="Contact Information">
  <FormField label="Phone">...</FormField>
  <FormField label="Email">...</FormField>
</FormSection>
```

FormSection renders a subtle divider + label:
```
──── Personal Details ────
[fields]

──── Contact Information ────
[fields]
```

---

## Submit Button States

```tsx
<Button 
  type="submit"
  disabled={isSubmitting}
  className={submitVariant === 'danger' 
    ? 'bg-danger hover:bg-red-700' 
    : 'bg-action hover:bg-green-700'}
>
  {isSubmitting ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      Saving...
    </>
  ) : submitLabel}
</Button>
```

---

## React Hook Form Integration

Every form MUST use React Hook Form + Zod resolver.
The Zod schema lives in `src/lib/schemas/`.

```tsx
// Pattern for every form
const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
    message: 'Must be a positive number'
  }),
})

type FormValues = z.infer<typeof schema>

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { name: '', amount: '' }
})

const onSubmit = async (values: FormValues) => {
  try {
    await createResource(values)
    form.reset()
    onClose()
    // Invalidate TanStack Query cache so list refreshes
    queryClient.invalidateQueries({ queryKey: ['resource'] })
  } catch (err) {
    form.setError('root', { message: 'Failed to save. Please try again.' })
  }
}
```

**The `queryClient.invalidateQueries` call is mandatory after every
successful submit.** This is what refreshes the DataTable with new data.
If you forget this, the list will not update.

---

## Checklist Before Committing a Form

- [ ] Uses React Hook Form with Zod resolver
- [ ] Zod schema is in `src/lib/schemas/` (not inline in the component)
- [ ] All required fields show red `*` in their label
- [ ] All validation errors show inline under the field
- [ ] Submit button shows spinner while `isSubmitting` is true
- [ ] Submit button is disabled while `isSubmitting` is true
- [ ] `queryClient.invalidateQueries` called after successful submit
- [ ] Drawer closes after successful submit
- [ ] Form resets after successful submit
- [ ] Money fields use string input with Decimal.js parsing — not number input
- [ ] Server-side errors are caught and shown via `form.setError('root', ...)`
- [ ] No raw `<input>` elements — all use the FormField wrapper
