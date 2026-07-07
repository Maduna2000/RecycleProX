'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useSession } from 'next-auth/react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { inp, lbl, Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

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

const EditSchema = z.object({
  fullName: z.string().min(2),
  role: z.enum(['admin', 'manager', 'cashier', 'scale_operator']),
  isActive: z.boolean(),
})
type EditInput = z.infer<typeof EditSchema>

type User = {
  id: string
  fullName: string
  username: string
  role: string
  isActive: boolean
  allowedModules?: string[]
}

const selectDisabled: React.CSSProperties = {
  ...inp, background: '#F5F5F5', color: '#6C757D', cursor: 'default',
}

export function EditUserModal({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [selectedRole, setSelectedRole] = useState(user.role)
  const [selectedModules, setSelectedModules] = useState<string[]>(user.allowedModules ?? [])
  const [permissionsChanged, setPermissionsChanged] = useState(false)
  const isSelf = session?.user?.id === user.id

  // Show module selection only for manager and cashier roles
  const showModuleSelection = selectedRole === 'manager' || selectedRole === 'cashier'

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<EditInput>({
    resolver: zodResolver(EditSchema),
    defaultValues: { fullName: user.fullName, role: user.role as EditInput['role'], isActive: user.isActive },
  })

  // Track initial modules for comparison
  useEffect(() => {
    setSelectedModules(user.allowedModules ?? [])
  }, [user.allowedModules])

  function handleRoleChange(role: string) {
    setSelectedRole(role)
    setValue('role', role as EditInput['role'])
  }

  function toggleModule(moduleKey: string) {
    setSelectedModules((prev) => {
      const newModules = prev.includes(moduleKey)
        ? prev.filter((k) => k !== moduleKey)
        : [...prev, moduleKey]
      setPermissionsChanged(true)
      return newModules
    })
  }

  function selectAllModules() {
    setSelectedModules(MODULE_OPTIONS.map((m) => m.key))
    setPermissionsChanged(true)
  }

  function clearAllModules() {
    setSelectedModules([])
    setPermissionsChanged(true)
  }

  async function onSubmit(data: EditInput) {
    setLoading(true)
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)

    if (res.ok) {
      // If permissions changed and role is manager/cashier, save them
      if (permissionsChanged && (data.role === 'manager' || data.role === 'cashier')) {
        await savePermissions()
      }
      toast.success('User updated')
      onSuccess()
      onClose()
    } else {
      const json = await res.json()
      toast.error(json.error ?? 'Failed to update user')
    }
  }

  async function savePermissions() {
    setSavingPermissions(true)
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleKeys: selectedModules }),
      })
      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error ?? 'Failed to save permissions')
      }
    } finally {
      setSavingPermissions(false)
    }
  }

  async function handleSavePermissionsOnly() {
    await savePermissions()
    toast.success('Permissions updated')
    setPermissionsChanged(false)
    onSuccess()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={520}>
        <RpxDialogHeader title={`Edit User — ${user.username}`} onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <RpxDialogBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={lbl}>Full Name</span>
            <input {...register('fullName')} disabled={loading} style={inp} />
            {errors.fullName && <span style={{ fontSize: 10, color: '#DC2626', marginTop: 2, display: 'block' }}>{errors.fullName.message}</span>}
          </div>

          <div>
            <span style={lbl}>Role</span>
            <select
              defaultValue={user.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={loading || isSelf}
              style={loading || isSelf ? selectDisabled : inp}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
              <option value="scale_operator">Scale Operator</option>
            </select>
            {isSelf && <span style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2, display: 'block' }}>Cannot change your own role</span>}
          </div>

          {/* Module Access Section - only for manager/cashier */}
          {showModuleSelection && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={lbl}>Module Access</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Btn size="sm" onClick={selectAllModules} disabled={loading}>Select All</Btn>
                  <Btn size="sm" onClick={clearAllModules} disabled={loading}>Clear All</Btn>
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
              {permissionsChanged && (
                <Btn size="sm" loading={savingPermissions} onClick={handleSavePermissionsOnly} style={{ marginTop: 4 }}>
                  {savingPermissions ? 'Saving...' : 'Save Permissions Only'}
                </Btn>
              )}
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

        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" loading={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Btn>
        </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}
