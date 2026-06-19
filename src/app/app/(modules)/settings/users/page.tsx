'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { CreateUserModal } from '@/components/users/CreateUserModal'
import { EditUserModal } from '@/components/users/EditUserModal'
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal'
import { MoreVertical, Search, Unlock, UserCheck, UserX, KeyRound, Plus, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { colors } from '@/lib/design-tokens'
import Link from 'next/link'
import { WinButton } from '@/components/ui/WinButton'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type User = {
  id: string; fullName: string; username: string; role: string
  isActive: boolean; lockedAt: string | null; lastLoginAt: string | null
  allowedModules?: string[]
}

// ─── Windows aesthetic styles ────────────────────────────────────────────────
const TH: React.CSSProperties = {
  textAlign: 'left', padding: '0 10px', height: 28,
  fontSize: 10, fontWeight: 700, color: '#6C757D',
  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '0 10px', fontSize: 12, color: '#212529' }

const inp: React.CSSProperties = {
  height: 26, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 7px 0 26px',
  fontSize: 12, color: '#212529', outline: 'none',
  background: '#fff', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  height: 26, borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 7px',
  fontSize: 12, color: '#212529', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}

function StatusBadge({ user }: { user: User }) {
  if (user.lockedAt) {
    return (
      <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: colors.dangerBg, color: colors.danger }}>
        Locked
      </span>
    )
  }
  if (!user.isActive) {
    return (
      <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: colors.neutralBg, color: colors.textSecondary }}>
        Inactive
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: colors.actionBg, color: colors.action }}>
      Active
    </span>
  )
}

const ROLE_STYLES: Record<string, { background: string; color: string }> = {
  admin:          { background: colors.purpleBg, color: colors.purple },
  manager:        { background: colors.processBg, color: colors.process },
  cashier:        { background: colors.neutralBg, color: colors.textSecondary },
  scale_operator: { background: colors.actionBg, color: colors.action },
}

function RoleBadge({ role }: { role: string }) {
  const style = ROLE_STYLES[role] ?? { background: colors.neutralBg, color: colors.textSecondary }
  const displayName = role === 'scale_operator' ? 'Scale Op' : role
  return (
    <span style={{ display: 'inline-flex', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, textTransform: 'capitalize', ...style }}>
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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

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
    closeMenu()
    const res = await fetch(`/api/users/${user.id}/toggle-active`, { method: 'POST' })
    if (res.ok) { toast.success(`User ${user.isActive ? 'deactivated' : 'activated'}`); mutate(`/api/users?${query}`) }
    else toast.error('Failed to update user')
  }

  async function handleUnlock(user: User) {
    closeMenu()
    const res = await fetch(`/api/users/${user.id}/unlock`, { method: 'POST' })
    if (res.ok) { toast.success('Account unlocked'); mutate(`/api/users?${query}`) }
    else toast.error('Failed to unlock account')
  }

  async function handleResetPin(user: User) {
    closeMenu()
    const res = await fetch(`/api/users/${user.id}/reset-pin`, { method: 'POST' })
    if (res.ok) toast.success(`PIN reset to default for ${user.fullName}`)
    else toast.error('Failed to reset PIN')
  }

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, userId: string) {
    e.stopPropagation()
    if (menuOpenId === userId) { setMenuOpenId(null); setMenuPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right })
    setMenuOpenId(userId)
  }

  function closeMenu() { setMenuOpenId(null); setMenuPos(null) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff', border: '1px solid #B0B0B0', borderRadius: 2, overflow: 'hidden' }}>

        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '2px solid #B0B0B0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', flexShrink: 0 }}>
          <Link href="/app/settings" style={{ display: 'flex', alignItems: 'center', color: '#6C757D' }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
          </Link>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1B3A6B' }}>Users</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          <WinButton onClick={() => setCreateOpen(true)}>
            <Plus style={{ width: 9, height: 9 }} /> Add User
          </WinButton>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#FAFAFA', borderBottom: '1px solid #E0E0E0', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#6C757D' }} />
            <input
              placeholder="Search name or username…"
              style={{ ...inp, width: 200 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            style={selectStyle}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="scale_operator">Scale Operator</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
                <th style={TH}>Full Name</th>
                <th style={TH}>Username</th>
                <th style={TH}>Role</th>
                <th style={TH}>Status</th>
                <th style={TH}>Last Login</th>
                <th style={{ ...TH, width: 50, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr
                  key={user.id}
                  style={{ background: i % 2 === 1 ? '#FAFAFA' : '#fff', borderBottom: '1px solid #F0F0F0', height: 36 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#EEF4FB')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? '#FAFAFA' : '#fff')}
                >
                  <td style={{ ...TD, fontWeight: 600 }}>{user.fullName}</td>
                  <td style={{ ...TD, color: '#6C757D' }}>{user.username}</td>
                  <td style={TD}><RoleBadge role={user.role} /></td>
                  <td style={TD}><StatusBadge user={user} /></td>
                  <td style={{ ...TD, fontSize: 11, color: '#6C757D' }}>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-ZA') : '—'}
                  </td>
                  <td style={{ ...TD, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => openMenu(e, user.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 2, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6C757D' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#E0E0E0')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <MoreVertical style={{ width: 14, height: 14 }} />
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 10px', textAlign: 'center', fontSize: 12, color: '#6C757D' }}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fixed dropdown menu */}
      {menuOpenId && menuPos && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={closeMenu} />
          <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 50, background: '#fff', border: '1px solid #D0D0D0', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 180, padding: '2px 0' }}>
            {(() => {
              const user = users.find((u) => u.id === menuOpenId)
              if (!user) return null
              return (
                <>
                  <button
                    onClick={() => { closeMenu(); setEditUser(user) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { closeMenu(); setResetUser(user) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    Reset Password
                  </button>
                  <button
                    onClick={() => handleResetPin(user)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <KeyRound style={{ width: 12, height: 12, color: '#6C757D' }} />
                    Reset PIN to Default
                  </button>
                  <div style={{ height: 1, background: '#E0E0E0', margin: '4px 0' }} />
                  <button
                    onClick={() => handleToggleActive(user)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    {user.isActive ? <><UserX style={{ width: 12, height: 12, color: '#6C757D' }} /> Deactivate</> : <><UserCheck style={{ width: 12, height: 12, color: '#6C757D' }} /> Activate</>}
                  </button>
                  {user.lockedAt && (
                    <button
                      onClick={() => handleUnlock(user)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', fontSize: 12, color: '#212529', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <Unlock style={{ width: 12, height: 12, color: '#6C757D' }} />
                      Unlock
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSuccess={() => mutate(`/api/users?${query}`)} />
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSuccess={() => mutate(`/api/users?${query}`)} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  )
}
