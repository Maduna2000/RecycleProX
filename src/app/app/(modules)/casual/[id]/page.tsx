'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { ArrowLeft, Save, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { inp, lbl, HEADER_GRAD, NAVY, Btn, TabStrip, PortalPage } from '@/components/rpx'

const inpDisabled: React.CSSProperties = { ...inp, background: '#F5F5F5', color: '#6C757D', cursor: 'default' }

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

function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{title}</span>
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

  return (
    <PortalPage
      title={fullName}
      actions={
        !isEditing ? (
          <Btn size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>Edit</Btn>
        ) : (
          <>
            <Btn size="sm" onClick={handleCancel} disabled={saving}>Cancel</Btn>
            <Btn variant="primary" size="sm" icon={Save} loading={saving} onClick={handleSubmit(onSubmit)}>
              {saving ? 'Saving...' : 'Save'}
            </Btn>
          </>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#F5F5F5' }}>
      {/* ── Sub-header ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Btn size="sm" icon={ArrowLeft} onClick={() => router.push('/app/casual')}>Casuals</Btn>
        <Pill text="Casual Seller" bg="#FEF3C7" color="#92400E" />
        {customer.idNumber && (
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6C757D' }}>·  {customer.idNumber}</span>
        )}
      </div>

      {/* ── Tab strip ─────────────────────────────────────────────────────────── */}
      <TabStrip
        tabs={TABS.map((t) => ({ value: t, label: t }))}
        active={tab}
        onChange={(v) => setTab(v as typeof TABS[number])}
        style={{ padding: '8px 10px 0', background: '#F5F5F5' }}
      />

      {/* ── Two-column layout: main content + sidebar ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* Main content */}
        <div style={{ flex: 1, borderRight: '1px solid #D0D0D0', background: '#fff' }}>

          {tab === 'Overview' && (
            <div>
              {/* Secondary Tab Strip for sections */}
              <TabStrip
                tabs={(customer.customerNotes || isEditing
                  ? SECTION_TABS
                  : SECTION_TABS.filter(t => t !== 'Notes')
                ).map((t) => ({ value: t, label: t }))}
                active={sectionTab}
                onChange={(v) => setSectionTab(v as typeof SECTION_TABS[number])}
                style={{ padding: '8px 10px 0', background: '#EFEFEF' }}
              />

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
    </PortalPage>
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
