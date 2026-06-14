'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; physicalAddress?: string
  isActive: boolean; blacklisted: boolean; createdAt: string
  customerNotes?: string
}

const TABS = ['Overview', 'Transactions'] as const
const SECTION_TABS = ['Personal', 'Notes'] as const

// ─── Schema for casual customer edit ──────────────────────────────────────────
const EditCasualSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  phone: z.string().min(1, 'Required'),
  physicalAddress: z.string().optional(),
  customerNotes: z.string().optional(),
})

type EditCasualInput = z.infer<typeof EditCasualSchema>

// ─── Shared styles ─────────────────────────────────────────────────────────────
const sectionHdr: React.CSSProperties = {
  background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)',
  borderBottom: '1px solid #C0C0C0',
  padding: '4px 10px',
  flexShrink: 0,
}
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 2,
}

// Input styles (like Settings page)
const inp: React.CSSProperties = {
  height: 26, width: '100%', borderRadius: 2,
  border: '1px solid #ABABAB', padding: '0 7px',
  fontSize: 12, color: '#212529', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
const inpDisabled: React.CSSProperties = {
  ...inp, background: '#F5F5F5', color: '#6C757D', cursor: 'default',
}

function SHdr({ title }: { title: string }) {
  return (
    <div style={sectionHdr}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>{title}</span>
    </div>
  )
}

// ─── Pill badge ────────────────────────────────────────────────────────────────
function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, borderRadius: 2, padding: '1px 6px', background: bg, color }}>
      {text}
    </span>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CasualCustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<typeof TABS[number]>('Overview')
  const [sectionTab, setSectionTab] = useState<typeof SECTION_TABS[number]>('Personal')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: customer, isLoading } = useSWR<Customer>(`/api/customers/${id}`, fetcher)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditCasualInput>({
    resolver: zodResolver(EditCasualSchema),
    values: customer ? {
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      physicalAddress: customer.physicalAddress ?? '',
      customerNotes: customer.customerNotes ?? '',
    } : undefined,
  })

  async function onSubmit(data: EditCasualInput) {
    setSaving(true)
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setSaving(false)
    if (res.ok) { toast.success('Customer updated'); mutate(`/api/customers/${id}`); setIsEditing(false) }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update') }
  }

  function handleCancel() {
    reset()
    setIsEditing(false)
  }

  // Guard: if Notes tab selected but no notes (and not editing), reset to Personal
  useEffect(() => {
    if (sectionTab === 'Notes' && !customer?.customerNotes && !isEditing) {
      setSectionTab('Personal')
    }
  }, [customer?.customerNotes, sectionTab, isEditing])

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9CA3AF', fontSize: 13 }}>
      Loading…
    </div>
  )
  if (!customer) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9CA3AF', fontSize: 13 }}>
      Customer not found
    </div>
  )

  const fullName = `${customer.firstName} ${customer.lastName}`

  const titleBtn: React.CSSProperties = {
    fontSize: 11, padding: '2px 10px', cursor: 'pointer', borderRadius: 2,
    background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)',
    border: '1px solid #ABABAB', color: '#333', display: 'flex', alignItems: 'center', gap: 4,
  }
  const saveBtn: React.CSSProperties = {
    fontSize: 11, padding: '2px 10px', cursor: saving ? 'not-allowed' : 'pointer', borderRadius: 2,
    background: 'linear-gradient(180deg,#10B981 0%,#059669 100%)',
    border: '1px solid #059669', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
    opacity: saving ? 0.7 : 1,
  }

  return (
    <div style={{ border: '1px solid #B0B0B0', borderRadius: 2, background: '#F5F5F5', display: 'flex', flexDirection: 'column' }}>

      {/* ── Title bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)', borderBottom: '2px solid #B0B0B0', padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => router.push('/app/casual')} style={titleBtn}>← Casuals</button>
          <span style={{ fontSize: 1, color: '#B0B0B0', userSelect: 'none' }}>│</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>{fullName}</span>
          <Pill text="Casual Seller" bg="#FEF3C7" color="#92400E" />
          {customer.idNumber && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6C757D' }}>·  {customer.idNumber}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} style={titleBtn}>✏  Edit</button>
          ) : (
            <>
              <button onClick={handleCancel} style={titleBtn} disabled={saving}>Cancel</button>
              <button onClick={handleSubmit(onSubmit)} style={saveBtn} disabled={saving}>
                {saving && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                {saving ? 'Saving...' : '💾 Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Tab strip ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #C0C0C0', background: '#EFEFEF', flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px', fontSize: 11, cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              background: tab === t ? '#fff' : 'transparent',
              borderRight: '1px solid #D0D0D0',
              borderBottom: tab === t ? '2px solid #217346' : '2px solid transparent',
              color: tab === t ? '#217346' : '#555',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Two-column layout: main content + sidebar ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* Main content */}
        <div style={{ flex: 1, borderRight: '1px solid #D0D0D0', background: '#fff' }}>

          {tab === 'Overview' && (
            <div>
              {/* Secondary Tab Strip for sections */}
              <div style={{ display: 'flex', borderBottom: '1px solid #C0C0C0', background: '#EFEFEF', flexShrink: 0 }}>
                {(customer.customerNotes || isEditing
                  ? SECTION_TABS
                  : SECTION_TABS.filter(t => t !== 'Notes')
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSectionTab(t)}
                    style={{
                      padding: '5px 14px',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontWeight: sectionTab === t ? 700 : 400,
                      background: sectionTab === t ? '#fff' : 'transparent',
                      border: 'none',
                      borderRight: '1px solid #D0D0D0',
                      borderBottom: sectionTab === t ? '2px solid #217346' : '2px solid transparent',
                      color: sectionTab === t ? '#217346' : '#555',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Section Content - Personal */}
              {sectionTab === 'Personal' && (
                <div>
                  <SHdr title="Personal Details" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <div>
                      <span style={lbl}>First Name</span>
                      <input {...register('firstName')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                      {errors.firstName && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.firstName.message}</span>}
                    </div>
                    <div>
                      <span style={lbl}>Last Name</span>
                      <input {...register('lastName')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                      {errors.lastName && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.lastName.message}</span>}
                    </div>
                    <div>
                      <span style={lbl}>ID Number</span>
                      <input value={customer.idNumber} disabled style={inpDisabled} />
                    </div>
                    <div>
                      <span style={lbl}>Phone (Mobile)</span>
                      <input {...register('phone')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                      {errors.phone && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.phone.message}</span>}
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={lbl}>Physical Address</span>
                      <input {...register('physicalAddress')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section Content - Notes */}
              {sectionTab === 'Notes' && (
                <div>
                  <SHdr title="Notes" />
                  <div style={{ padding: '10px 12px' }}>
                    <textarea
                      {...register('customerNotes')}
                      disabled={!isEditing || saving}
                      rows={5}
                      style={{
                        width: '100%', borderRadius: 2, border: '1px solid #ABABAB',
                        padding: '7px', fontSize: 12, resize: 'vertical', minHeight: 80,
                        background: isEditing ? '#fff' : '#F5F5F5',
                        color: isEditing ? '#212529' : '#6C757D',
                        cursor: isEditing ? 'text' : 'default',
                        outline: 'none',
                      }}
                      placeholder={isEditing ? 'Add notes about this customer...' : ''}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'Transactions' && <TransactionsTab customerId={id} />}
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div style={{ width: 200, flexShrink: 0, background: '#FAFAFA' }}>
          <SHdr title="Profile" />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div>
              <span style={lbl}>Type</span>
              <Pill text="Casual" bg="#F3F4F6" color="#374151" />
            </div>
            <div>
              <span style={lbl}>Status</span>
              <Pill
                text={customer.blacklisted ? 'Blacklisted' : 'Active'}
                bg={customer.blacklisted ? '#FEE2E2' : '#DCFCE7'}
                color={customer.blacklisted ? '#991B1B' : '#166534'}
              />
            </div>
            <div>
              <span style={lbl}>Registered</span>
              <span style={{ fontSize: 11, color: '#6C757D' }}>
                {new Date(customer.createdAt).toLocaleDateString('en-ZA')}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
function TransactionsTab({ customerId }: { customerId: string }) {
  const { data } = useSWR(`/api/customers/${customerId}/transactions`, fetcher)
  if (!data?.transactions?.length) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>
        No transactions yet
      </div>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'linear-gradient(180deg,#F5F5F5 0%,#EBEBEB 100%)', borderBottom: '1px solid #C0C0C0' }}>
            {['Date', 'Reference', 'Type', 'Amount', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6C757D', letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.transactions.map((tx: { id: string; type: string; reference: string; date: string; amount: string; status: string }, i: number) => (
            <tr key={tx.id} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
              <td style={{ padding: '5px 10px' }}>{new Date(tx.date).toLocaleDateString('en-ZA')}</td>
              <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 11 }}>{tx.reference}</td>
              <td style={{ padding: '5px 10px', textTransform: 'capitalize' }}>{tx.type}</td>
              <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>R {tx.amount}</td>
              <td style={{ padding: '5px 10px', textTransform: 'capitalize' }}>{tx.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
