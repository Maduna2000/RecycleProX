'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateUserSchema, type CreateUserInput } from '@/lib/schemas/auth'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Module options for permission control
const MODULE_OPTIONS = [
  { key: '/app/dashboard', label: 'Dashboard' },
  { key: '/app/customers', label: 'Accounts' },
  { key: '/app/purchases', label: 'Purchases' },
  { key: '/app/sales', label: 'Sales' },
  { key: '/app/payments', label: 'Payments' },
  { key: '/app/expenses', label: 'Expenses' },
  { key: '/app/cashup', label: 'Cash Up' },
  { key: '/app/float', label: 'Float' },
  { key: '/app/stock', label: 'Stock' },
  { key: '/app/stocktake', label: 'Stocktake' },
  { key: '/app/products', label: 'Products' },
  { key: '/app/price-groups', label: 'Price Groups' },
  { key: '/app/reports', label: 'Reports' },
  { key: '/app/loans', label: 'Loans' },
  { key: '/app/police-register', label: 'Police Register' },
  { key: '/app/audit-log', label: 'Audit Log' },
  { key: '/app/settings', label: 'Settings' },
]

// ─── Shared styles (matching profile pages) ─────────────────────────────────────
const modalHdr: React.CSSProperties = {
  background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)',
  borderBottom: '2px solid #B0B0B0',
  padding: '8px 16px',
  borderRadius: '6px 6px 0 0',
  margin: '-24px -24px 16px -24px',
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 4,
}
const inp: React.CSSProperties = {
  height: 28, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 12, color: '#212529', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
const selectStyle: React.CSSProperties = {
  height: 28, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 8px',
  fontSize: 12, color: '#212529', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
const btnBase: React.CSSProperties = {
  fontSize: 10, padding: '1px 6px', borderRadius: 2, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 3,
}
const cancelBtn: React.CSSProperties = {
  ...btnBase,
  background: '#E0E0E0',
  border: '1px solid #999', color: '#212529',
}
const submitBtn: React.CSSProperties = {
  ...btnBase,
  background: '#E0E0E0',
  border: '1px solid #999', color: '#212529',
}
const smallBtn: React.CSSProperties = {
  fontSize: 10, padding: '1px 6px', borderRadius: 2, cursor: 'pointer',
  background: '#E0E0E0', border: '1px solid #999', color: '#212529',
}

export function CreateUserModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [selectedModules, setSelectedModules] = useState<string[]>([])

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { isActive: true },
  })

  // Show module selection only for manager and cashier roles
  const showModuleSelection = selectedRole === 'manager' || selectedRole === 'cashier'

  function handleRoleChange(role: string) {
    setSelectedRole(role)
    setValue('role', role as 'admin' | 'manager' | 'cashier' | 'scale_operator')
    // Clear module selection when changing roles
    if (role === 'admin' || role === 'scale_operator') {
      setSelectedModules([])
    }
  }

  function toggleModule(moduleKey: string) {
    setSelectedModules((prev) =>
      prev.includes(moduleKey)
        ? prev.filter((k) => k !== moduleKey)
        : [...prev, moduleKey]
    )
  }

  function selectAllModules() {
    setSelectedModules(MODULE_OPTIONS.map((m) => m.key))
  }

  function clearAllModules() {
    setSelectedModules([])
  }

  async function onSubmit(data: CreateUserInput) {
    setLoading(true)

    // Include allowedModules for manager/cashier roles
    const payload = {
      ...data,
      ...(showModuleSelection && { allowedModules: selectedModules }),
    }

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setLoading(false)
    if (res.ok) {
      toast.success('User created')
      reset()
      setSelectedRole('')
      setSelectedModules([])
      onSuccess()
      onClose()
    } else {
      const json = await res.json()
      toast.error(json.error ?? 'Failed to create user')
    }
  }

  function handleClose() {
    reset()
    setSelectedRole('')
    setSelectedModules([])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div style={modalHdr}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>Add User</span>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={lbl}>Full Name</span>
            <input {...register('fullName')} disabled={loading} style={inp} />
            {errors.fullName && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.fullName.message}</span>}
          </div>

          <div>
            <span style={lbl}>Username</span>
            <input {...register('username')} disabled={loading} style={inp} />
            {errors.username && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.username.message}</span>}
          </div>

          <div>
            <span style={lbl}>Password</span>
            <input type="password" {...register('password')} disabled={loading} style={inp} />
            {errors.password && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.password.message}</span>}
          </div>

          <div>
            <span style={lbl}>Role</span>
            <select
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={loading}
              style={selectStyle}
              value={selectedRole}
            >
              <option value="" disabled>Select role...</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
              <option value="scale_operator">Scale Operator</option>
            </select>
            {errors.role && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.role.message}</span>}
          </div>

          {/* Module Access Section - only for manager/cashier */}
          {showModuleSelection && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={lbl}>Module Access</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={selectAllModules} style={smallBtn}>Select All</button>
                  <button type="button" onClick={clearAllModules} style={smallBtn}>Clear All</button>
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 6,
                padding: 8,
                border: '1px solid #ddd',
                borderRadius: 4,
                background: '#fafafa',
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                {MODULE_OPTIONS.map((mod) => (
                  <label
                    key={mod.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: 2,
                      background: selectedModules.includes(mod.key) ? '#e0f2fe' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(mod.key)}
                      onChange={() => toggleModule(mod.key)}
                      disabled={loading}
                      style={{ margin: 0 }}
                    />
                    {mod.label}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                {selectedModules.length === 0
                  ? 'No modules selected — user will have full access'
                  : `${selectedModules.length} module(s) selected`}
              </p>
            </div>
          )}

          {/* Info messages for admin/scale_operator */}
          {selectedRole === 'admin' && (
            <p style={{ fontSize: 10, color: '#666', fontStyle: 'italic' }}>
              Admins have full access to all modules.
            </p>
          )}
          {selectedRole === 'scale_operator' && (
            <p style={{ fontSize: 10, color: '#666', fontStyle: 'italic' }}>
              Scale operators can only access the Scale Station app.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={handleClose} disabled={loading} style={cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{ ...submitBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
