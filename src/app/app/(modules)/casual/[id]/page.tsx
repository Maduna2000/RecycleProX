'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useSession } from 'next-auth/react'
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

function SHdr({ title }: { title: string }) {
  return (
    <div style={sectionHdr}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>{title}</span>
    </div>
  )
}

// ─── Read-only profile field ───────────────────────────────────────────────────
function PField({ label, value, mono, span2 }: {
  label: string; value?: string | null; mono?: boolean; span2?: boolean
}) {
  const display = value ?? '—'
  return (
    <div style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <span style={lbl}>{label}</span>
      <span style={{
        display: 'block', fontSize: 12,
        color: display === '—' ? '#9CA3AF' : '#212529',
        fontFamily: mono ? 'monospace' : undefined,
        minHeight: 16, lineHeight: '16px',
      }}>
        {display}
      </span>
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
  const [editOpen, setEditOpen] = useState(false)

  const { data: customer, isLoading } = useSWR<Customer>(`/api/customers/${id}`, fetcher)

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
  const fmt = (v?: string | null) => v ?? undefined

  const titleBtn: React.CSSProperties = {
    fontSize: 11, padding: '2px 10px', cursor: 'pointer', borderRadius: 2,
    background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)',
    border: '1px solid #ABABAB', color: '#333', display: 'flex', alignItems: 'center', gap: 4,
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
          <button onClick={() => setEditOpen(true)} style={titleBtn}>✏  Edit</button>
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
            <Accordion type="single" collapsible defaultValue="personal">
              <AccordionItem value="personal">
                <AccordionTrigger style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>
                  Personal Details
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <PField label="First Name" value={customer.firstName} />
                    <PField label="Last Name" value={customer.lastName} />
                    <PField label="ID Number" value={customer.idNumber} mono />
                    <PField label="Phone (Mobile)" value={customer.phone} mono />
                    <PField label="Physical Address" value={fmt(customer.physicalAddress)} span2 />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {customer.customerNotes && (
                <AccordionItem value="notes">
                  <AccordionTrigger style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>
                    Notes
                  </AccordionTrigger>
                  <AccordionContent>
                    <p style={{ padding: '8px 12px', fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap', margin: 0 }}>
                      {customer.customerNotes}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
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

          <SHdr title="Actions" />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button
              onClick={() => setEditOpen(true)}
              style={{ fontSize: 11, padding: '4px 8px', background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)', border: '1px solid #ABABAB', borderRadius: 2, cursor: 'pointer', textAlign: 'left', color: '#333', width: '100%' }}
            >
              ✏  Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* ── Edit Modal ────────────────────────────────────────────────────────────── */}
      {editOpen && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setEditOpen(false)}
          onSuccess={() => { mutate(`/api/customers/${id}`); setEditOpen(false) }}
        />
      )}
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

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const EditCasualSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  phone: z.string().min(1, 'Required'),
  physicalAddress: z.string().optional(),
})

type EditCasualInput = z.infer<typeof EditCasualSchema>

function EditCustomerModal({ customer, onClose, onSuccess }: { customer: Customer; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<EditCasualInput>({
    resolver: zodResolver(EditCasualSchema),
    defaultValues: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      physicalAddress: customer.physicalAddress ?? '',
    },
  })

  async function onSubmit(data: EditCasualInput) {
    setLoading(true)
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) { toast.success('Customer updated'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name</Label>
              <Input {...register('firstName')} className="mt-1" disabled={loading} />
              {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <Label>Last Name</Label>
              <Input {...register('lastName')} className="mt-1" disabled={loading} />
              {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}
            </div>
          </div>
          <div>
            <Label>Phone (Mobile)</Label>
            <Input {...register('phone')} className="mt-1" disabled={loading} />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
          </div>
          <div>
            <Label>Physical Address</Label>
            <Input {...register('physicalAddress')} className="mt-1" disabled={loading} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
