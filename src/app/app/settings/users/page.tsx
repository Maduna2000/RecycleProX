'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { EditUserModal } from '@/components/users/EditUserModal'
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal'
import { MoreHorizontal, Search, Unlock, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type User = {
  id: string; fullName: string; username: string; role: string
  isActive: boolean; lockedAt: string | null; lastLoginAt: string | null
}

function statusBadge(user: User) {
  if (user.lockedAt) return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#FEF2F2', color: '#C0392B' }}>Locked</span>
  if (!user.isActive) return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F1F3F4', color: '#6C757D' }}>Inactive</span>
  return <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#F0FBF4', color: '#217346' }}>Active</span>
}

const ROLE_STYLES: Record<string, { background: string; color: string }> = {
  admin:   { background: '#F3EBF9', color: '#7B2D8B' },
  manager: { background: '#EBF3FC', color: '#185ABD' },
  cashier: { background: '#F1F3F4', color: '#6C757D' },
}

function roleBadge(role: string) {
  const style = ROLE_STYLES[role] ?? { background: '#F1F3F4', color: '#6C757D' }
  return <span className="px-2 py-0.5 rounded text-xs font-medium capitalize" style={style}>{role}</span>
}

export default function UsersPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)

  const isAdmin = session?.user?.role === 'admin'
  const query = new URLSearchParams({ ...(search && { search }), ...(roleFilter && { role: roleFilter }) })
  const { data } = useSWR<{ users: User[] }>(isAdmin ? `/api/users?${query}` : null, fetcher)

  if (!isAdmin) {
    router.replace('/app/dashboard')
    return null
  }

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

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">

      {/* Page header */}
      <div className="shrink-0">
        <h1 className="text-xl font-bold" style={{ color: '#212529' }}>Users</h1>
        <p className="text-sm mt-0.5" style={{ color: '#6C757D' }}>Manage system user accounts</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#6C757D' }} />
          <Input placeholder="Search name or username…" className="pl-7 h-7 text-xs w-56 border-[#E0E0E0]" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="border border-[#E0E0E0] rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-[#185ABD]"
          style={{ color: '#212529' }}
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
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg" style={{ border: '1px solid #E0E0E0' }}>
        <table className="w-full bg-white">
          <thead style={{ background: '#F8F9FA', borderBottom: '1px solid #E0E0E0' }}>
            <tr>
              {['Full Name', 'Username', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-2" style={{ fontSize: 10, fontWeight: 600, color: '#6C757D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.users?.map((user, i) => (
              <tr key={user.id} style={{ borderBottom: i < (data.users.length - 1) ? '1px solid #F1F3F4' : 'none' }}>
                <td className="px-4 py-2.5 font-medium" style={{ fontSize: 12, color: '#212529' }}>{user.fullName}</td>
                <td className="px-4 py-2.5" style={{ fontSize: 12, color: '#6C757D' }}>{user.username}</td>
                <td className="px-4 py-2.5">{roleBadge(user.role)}</td>
                <td className="px-4 py-2.5">{statusBadge(user)}</td>
                <td className="px-4 py-2.5" style={{ fontSize: 11, color: '#6C757D' }}>
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
            {!data?.users?.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: '#6C757D' }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => mutate(`/api/users?${query}`)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => mutate(`/api/users?${query}`)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  )
}
