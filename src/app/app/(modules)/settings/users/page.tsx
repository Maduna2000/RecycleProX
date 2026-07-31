'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { EditUserModal } from '@/components/users/EditUserModal'
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal'
import { SetPinModal } from '@/components/users/SetPinModal'
import { Search, Unlock, UserCheck, UserX, KeyRound, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { colors, badgeStyle } from '@/lib/design-tokens'
import { inp, Field, PortalPage, FilterBar } from '@/components/rpx'
import { DataTable, type Column, type RowAction, StatusBadge as SharedStatusBadge } from '@/components/ui/DataTable'
import { fetcher } from '@/lib/swrFetcher'


type User = {
  id: string; fullName: string; username: string; role: string
  isActive: boolean; lockedAt: string | null; lastLoginAt: string | null
  allowedModules?: string[]
  hasPersonalPin?: boolean
}

function PinBadge({ hasPersonalPin }: { hasPersonalPin?: boolean }) {
  return hasPersonalPin ? (
    <span style={badgeStyle(colors.action, colors.actionBg)}>Personal</span>
  ) : (
    <span style={badgeStyle(colors.textSecondary, colors.neutralBg)}>Default</span>
  )
}

function StatusBadge({ user }: { user: User }) {
  const status = user.lockedAt ? 'locked' : !user.isActive ? 'inactive' : 'active'
  return <SharedStatusBadge status={status} />
}

const ROLE_STYLES: Record<string, { background: string; color: string }> = {
  admin:          { background: colors.purpleBg, color: colors.purple },
  manager:        { background: colors.processBg, color: colors.process },
  cashier:        { background: colors.neutralBg, color: colors.textSecondary },
  scale_operator: { background: colors.actionBg, color: colors.action },
  security_guard: { background: colors.warningBg, color: colors.warning },
}

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role] ?? { background: colors.neutralBg, color: colors.textSecondary }
  const displayName = role === 'scale_operator' ? 'Scale Op' : role === 'security_guard' ? 'Guard' : role
  return (
    <span style={{ ...badgeStyle(style.color, style.background), textTransform: 'capitalize' }}>
      {displayName}
    </span>
  )
}

export default function UsersPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [pinUser, setPinUser] = useState<User | null>(null)

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true)
      router.replace('/app/settings/users')
    }
  }, [searchParams, router])

  const isAdmin = session?.user?.role === 'admin'
  const query = new URLSearchParams({ ...(search && { search }), ...(roleFilter && { role: roleFilter }) })
  const { data, error } = useSWR<{ users: User[] }>(isAdmin ? `/api/users?${query}` : null, fetcher)

  if (!isAdmin) {
    router.replace('/app/dashboard')
    return null
  }

  const users = data?.users ?? []

  async function handleToggleActive(user: User) {
    const res = await fetch(`/api/users/${user.id}/toggle-active`, { method: 'POST' })
    if (res.ok) { toast.success(`User ${user.isActive ? 'deactivated' : 'activated'}`); mutate(`/api/users?${query}`) }
    else toast.error('Failed to update user')
  }

  async function handleUnlock(user: User) {
    const res = await fetch(`/api/users/${user.id}/unlock`, { method: 'POST' })
    if (res.ok) { toast.success('Account unlocked'); mutate(`/api/users?${query}`) }
    else toast.error('Failed to unlock account')
  }

  async function handleResetPin(user: User) {
    const res = await fetch(`/api/users/${user.id}/reset-pin`, { method: 'POST' })
    if (res.ok) toast.success(`PIN reset to default for ${user.fullName}`)
    else toast.error('Failed to reset PIN')
  }

  const columns: Column<User>[] = [
    { key: 'fullName', header: 'Full Name', render: (u) => <span style={{ fontWeight: 600 }}>{u.fullName}</span> },
    { key: 'username', header: 'Username', render: (u) => <span style={{ color: '#6C757D' }}>{u.username}</span> },
    { key: 'role', header: 'Role', width: '110px', render: (u) => <RoleBadge role={u.role} /> },
    { key: 'status', header: 'Status', width: '90px', render: (u) => <StatusBadge user={u} /> },
    { key: 'pin', header: 'PIN', width: '90px', render: (u) => <PinBadge hasPersonalPin={u.hasPersonalPin} /> },
    {
      key: 'lastLoginAt', header: 'Last Login',
      render: (u) => <span style={{ fontSize: 11, color: '#6C757D' }}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-ZA') : '—'}</span>,
    },
  ]

  const rowActions: RowAction<User>[] = [
    { label: 'Edit', icon: Pencil, onClick: (u) => setEditUser(u) },
    { label: 'Reset Password', icon: KeyRound, onClick: (u) => setResetUser(u) },
    { label: 'Set PIN', icon: KeyRound, onClick: (u) => setPinUser(u) },
    { label: 'Reset PIN to Default', icon: KeyRound, onClick: handleResetPin },
    { label: 'Deactivate', icon: UserX, hidden: (u) => !u.isActive, onClick: handleToggleActive },
    { label: 'Activate', icon: UserCheck, hidden: (u) => u.isActive, onClick: handleToggleActive },
    { label: 'Unlock', icon: Unlock, hidden: (u) => !u.lockedAt, onClick: handleUnlock },
  ]

  return (
    <>
    <PortalPage
      title={`Users (${users.length})`}
    >
        {/* Filters */}
        <FilterBar>
          <Field label="Search" width={220}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
              <input
                placeholder="Search name or username…"
                style={{ ...inp, paddingLeft: 26 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Field>
          <Field label="Role" width={160}>
            <select
              style={inp}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
              <option value="scale_operator">Scale Operator</option>
              <option value="security_guard">Security Guard</option>
            </select>
          </Field>
        </FilterBar>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
          <DataTable
            columns={columns}
            rows={users}
            rowKey={(user) => user.id}
            rowActions={rowActions}
            error={error instanceof Error ? error.message : !!error}
            emptyMessage="No users found"
          />
        </div>
    </PortalPage>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => mutate(`/api/users?${query}`)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => mutate(`/api/users?${query}`)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      {pinUser && (
        <SetPinModal
          user={pinUser}
          onClose={() => setPinUser(null)}
          onSuccess={() => { mutate(`/api/users?${query}`); setPinUser(null) }}
        />
      )}
    </>
  )
}
