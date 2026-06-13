'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { EditUserModal } from '@/components/users/EditUserModal'
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal'
import { MoreHorizontal, Search, Unlock, UserCheck, UserX, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell } from '@/components/layout/PageShell'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type User = {
  id: string; fullName: string; username: string; role: string
  isActive: boolean; lockedAt: string | null; lastLoginAt: string | null
}

function statusBadge(user: User) {
  if (user.lockedAt)
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.dangerBg, color: colors.danger }}>
        Locked
      </span>
    )
  if (!user.isActive)
    return (
      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.neutralBg, color: colors.textSecondary }}>
        Inactive
      </span>
    )
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: colors.actionBg, color: colors.action }}>
      Active
    </span>
  )
}

const ROLE_STYLES: Record<string, { background: string; color: string }> = {
  admin:   { background: colors.purpleBg, color: colors.purple },
  manager: { background: colors.processBg, color: colors.process },
  cashier: { background: colors.neutralBg, color: colors.textSecondary },
}

function roleBadge(role: string) {
  const style = ROLE_STYLES[role] ?? { background: colors.neutralBg, color: colors.textSecondary }
  return <span className="px-2 py-0.5 rounded text-xs font-medium capitalize" style={style}>{role}</span>
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

  // Auto-open create modal when ?create=1 is in the URL
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true)
      router.replace('/app/settings/users')
    }
  }, [searchParams, router])

  const isAdmin = session?.user?.role === 'admin'
  const query = new URLSearchParams({ ...(search && { search }), ...(roleFilter && { role: roleFilter }) })
  const { data } = useSWR<{ users: User[] }>(isAdmin ? `/api/users?${query}` : null, fetcher)

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

  return (
    <PageShell title="Users" subtitle={`${users.length} user${users.length !== 1 ? 's' : ''}`}>

      {/* Filters */}
      <div className="flex gap-2 items-center shrink-0 mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: colors.textSecondary }} />
          <Input
            placeholder="Search name or username…"
            className="pl-7 h-7 text-xs w-56"
            style={{ borderColor: colors.border }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded px-2 py-1 text-xs bg-white focus:outline-none"
          style={{ borderColor: colors.border, color: colors.textPrimary }}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded" style={{ border: `1px solid ${colors.border}` }}>
        <table className="w-full" style={{ background: colors.surface }}>
          <thead style={{ background: colors.toolbar, borderBottom: `1px solid ${colors.border}` }}>
            <tr>
              {['Full Name', 'Username', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-2"
                  style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr key={user.id} style={{ borderBottom: i < users.length - 1 ? `1px solid ${colors.neutralBg}` : 'none' }}>
                <td className="px-4 py-2.5 font-medium" style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{user.fullName}</td>
                <td className="px-4 py-2.5" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{user.username}</td>
                <td className="px-4 py-2.5">{roleBadge(user.role)}</td>
                <td className="px-4 py-2.5">{statusBadge(user)}</td>
                <td className="px-4 py-2.5" style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-ZA') : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditUser(user)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setResetUser(user)}>Reset Password</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleResetPin(user)}>
                        <KeyRound className="w-4 h-4 mr-2" />Reset PIN to Default
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                        {user.isActive ? <><UserX className="w-4 h-4 mr-2" />Deactivate</> : <><UserCheck className="w-4 h-4 mr-2" />Activate</>}
                      </DropdownMenuItem>
                      {user.lockedAt && (
                        <DropdownMenuItem onClick={() => handleUnlock(user)}>
                          <Unlock className="w-4 h-4 mr-2" />Unlock
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: colors.textSecondary }}>
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => mutate(`/api/users?${query}`)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => mutate(`/api/users?${query}`)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </PageShell>
  )
}
