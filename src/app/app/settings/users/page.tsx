'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { EditUserModal } from '@/components/users/EditUserModal'
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal'
import { MoreHorizontal, Plus, Search, Unlock, UserCheck, UserX } from 'lucide-react'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type User = {
  id: string; fullName: string; username: string; role: string
  isActive: boolean; lockedAt: string | null; lastLoginAt: string | null
}

function statusBadge(user: User) {
  if (user.lockedAt) return <Badge variant="destructive">Locked</Badge>
  if (!user.isActive) return <Badge variant="secondary">Inactive</Badge>
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
}

function roleBadge(role: string) {
  const map: Record<string, string> = { admin: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', cashier: 'bg-gray-100 text-gray-700' }
  return <Badge className={`${map[role] ?? ''} hover:opacity-80 capitalize`}>{role}</Badge>
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage system user accounts</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search name or username..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-white"
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
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Full Name', 'Username', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.users?.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{user.fullName}</td>
                <td className="px-4 py-3 text-gray-500">{user.username}</td>
                <td className="px-4 py-3">{roleBadge(user.role)}</td>
                <td className="px-4 py-3">{statusBadge(user)}</td>
                <td className="px-4 py-3 text-gray-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-ZA') : '—'}
                </td>
                <td className="px-4 py-3">
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
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
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
