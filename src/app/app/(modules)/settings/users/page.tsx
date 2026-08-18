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
  createdAt: string
  allowedModules?: string[]
  hasPersonalPin?: boolean
}

// Locked beats inactive beats active — shared by the Status column badge and
// the Status filter below so "filter by Active" always matches exactly the
// rows actually showing the "Active" badge.
function userStatus(user: User): 'locked' | 'inactive' | 'active' {
  return user.lockedAt ? 'locked' : !user.isActive ? 'inactive' : 'active'
}

function PinBadge({ hasPersonalPin }: { hasPersonalPin?: boolean }) {
  return hasPersonalPin ? (
    <span style={badgeStyle(colors.action, colors.actionBg)}>Personal</span>
  ) : (
    <span style={badgeStyle(colors.textSecondary, colors.neutralBg)}>Default</span>
  )
}

function StatusBadge({ user }: { user: User }) {
  return <SharedStatusBadge status={userStatus(user)} />
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
  const [statusFilter, setStatusFilter] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [pinUser, setPinUser] = useState<User | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true)
      router.replace('/app/settings/users')
    }
  }, [searchParams, router])

  const isAdmin = session?.user?.role === 'admin'
  // limit is explicit rather than relying on the API's own default (20) —
  // Status/Created filters below need the complete matching set to filter
  // over client-side, same as Search/Role already fetch everything that
  // matches; 1000 comfortably covers any real yard's staff count.
  const query = new URLSearchParams({
    ...(search      && { search }),
    ...(roleFilter  && { role: roleFilter }),
    limit: '1000',
  })
  const { data, error } = useSWR<{ users: User[] }>(isAdmin ? `/api/users?${query}` : null, fetcher)

  // A filter change can leave `page` pointing past the end of a newly
  // narrowed result set — reset to page 1 whenever the filter shape
  // changes, same fix as Expenses/Payments/Stock Movements.
  useEffect(() => { setPage(1) }, [search, roleFilter, statusFilter, createdFrom, createdTo])

  if (!isAdmin) {
    router.replace('/app/dashboard')
    return null
  }

  const users = (data?.users ?? []).filter((u) => {
    if (statusFilter && userStatus(u) !== statusFilter) return false
    const createdDate = u.createdAt.slice(0, 10)
    if (createdFrom && createdDate < createdFrom) return false
    if (createdTo && createdDate > createdTo) return false
    return true
  })

  // Client-side pagination — same pattern as Products/Price Groups, and
  // the only thing DataTable needs to render its "Showing X–Y of Z"
  // footer bar, which this page was previously missing entirely.
  const PAGE_SIZE  = 30
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pagedUsers = users.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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
    {/* maxWidth matches src/lib/pageWidthCaps.ts, which PageTitleBar reads to
        cap/border itself to match — keeps the unbounded Full Name/Username
        columns from stretching to fill the whole window, same fix already
        applied to Purchases/Sales/Payments/Expenses/Products/Price Groups. */}
    <PortalPage
      title={`Users (${users.length})`}
      maxWidth={950}
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
          <Field label="Status" width={140}>
            <select
              style={inp}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="locked">Locked</option>
            </select>
          </Field>
          <Field label="Created From" width={145}>
            <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} style={inp} title="Created from date" />
          </Field>
          <Field label="Created To" width={145}>
            <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} style={inp} title="Created to date" />
          </Field>
        </FilterBar>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, padding: 10 }}>
          <DataTable
            columns={columns}
            rows={pagedUsers}
            rowKey={(user) => user.id}
            rowActions={rowActions}
            error={error instanceof Error ? error.message : !!error}
            emptyMessage="No users found"
            total={users.length}
            page={safePage}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
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
