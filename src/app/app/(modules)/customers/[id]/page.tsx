'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { AlertTriangle, ShieldBan, ShieldCheck, Loader2 } from 'lucide-react'
import { PhotoUploader, PhotoViewer } from '@/components/PhotoUploader'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  UpdateCustomerSchema,
  BlacklistSchema,
  type UpdateCustomerInput,
  type UpdateCustomerFormInput,
  type BlacklistInput,
} from '@/lib/schemas/customer'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; landline?: string; email?: string; physicalAddress?: string; postalAddress?: string
  vatNumber?: string; customerType: string; primaryFunction?: string
  companyName?: string; companyRegNumber?: string; contactPerson?: string
  dateOfBirth?: string; gender?: string; nationality?: string
  bankName?: string; bankAccountNo?: string; bankBranchCode?: string
  creditLimit?: string
  policeRegisterNo?: string; licenseNumber?: string; licenseExpiry?: string
  tradeCommodities?: string[]; customerNotes?: string
  isActive: boolean; blacklisted: boolean; blacklistReason?: string; blacklistedAt?: string
  createdAt: string; priceGroupId?: string; idPhotoR2Key?: string
  priceGroup?: { id: string; name: string }
  marketSector?: 'formal' | 'informal'
  dealerCategory?: 'casual' | 'dealer_1' | 'dealer_2' | 'dealer_3'
  zeroRated?: boolean
  accountCode?: string | null
}

const DEALER_LABELS: Record<string, string> = {
  casual: 'Casual', dealer_1: 'Dealer 1', dealer_2: 'Dealer 2', dealer_3: 'Dealer 3',
}

type CustomerDoc = {
  id: string; documentType: string; fileName: string; r2Key: string
  notes?: string; uploadedAt: string
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  trading_licence:      'Trading Licence',
  sars_certificate:     'SARS Certificate',
  company_registration: 'Company Registration',
  id_copy:              'ID Copy',
  other:                'Other',
}

const TABS = ['Overview', 'Transactions', 'Documents', 'Blacklist'] as const

const COMMODITY_OPTIONS = [
  'Copper', 'Aluminium', 'Steel (Ferrous)', 'Non-Ferrous Metals',
  'Stainless Steel', 'Lead', 'Brass', 'Iron', 'E-Waste (Electronics)',
  'Plastic', 'Paper / Cardboard', 'Catalytic Converters', 'Batteries', 'Other',
]

// ─── Shared styles — mirrors the Settings page design tokens ──────────────────
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
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<typeof TABS[number]>('Overview')
  const [editOpen, setEditOpen] = useState(false)
  const [blacklistOpen, setBlacklistOpen] = useState(false)

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

  const fullName    = `${customer.firstName} ${customer.lastName}`
  const fmt         = (v?: string | null) => v ?? undefined
  const fmtDate     = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-ZA') : undefined
  const fmtMoney    = (v?: string | null) => v ? `R ${parseFloat(v).toFixed(2)}` : undefined

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
          <button onClick={() => router.back()} style={titleBtn}>← Customers</button>
          <span style={{ fontSize: 1, color: '#B0B0B0', userSelect: 'none' }}>│</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>{fullName}</span>
          <span style={{ fontSize: 11, color: '#6C757D' }}>·  {customer.customerType === 'account' ? 'Account Customer' : 'Casual Customer'}</span>
          {customer.accountCode && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#1B3A6B', background: '#E8EFF8', border: '1px solid #B0C4DE', borderRadius: 2, padding: '1px 6px' }}>
              {customer.accountCode}
            </span>
          )}
          {customer.idNumber && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6C757D' }}>·  {customer.idNumber}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setEditOpen(true)} style={titleBtn}>✏  Edit</button>
          <button
            onClick={() => router.push('/app/purchases/new')}
            style={{ fontSize: 11, padding: '2px 10px', background: 'linear-gradient(180deg,#2E8B57 0%,#1E6B3D 100%)', border: '1px solid #176338', borderRadius: 2, cursor: 'pointer', color: '#fff', fontWeight: 700 }}
          >
            + New Purchase
          </button>
        </div>
      </div>

      {/* ── Blacklist banner ──────────────────────────────────────────────────── */}
      {customer.blacklisted && (
        <div style={{ background: '#FFF0F0', borderBottom: '1px solid #F0C0C0', padding: '5px 12px', display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
          <AlertTriangle style={{ width: 13, height: 13, color: '#C53030', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#C53030' }}>Blacklisted</span>
          <span style={{ fontSize: 11, color: '#9B2C2C' }}>{customer.blacklistReason}</span>
          {customer.blacklistedAt && (
            <span style={{ fontSize: 10, color: '#FC8181' }}>
              · Since {new Date(customer.blacklistedAt).toLocaleDateString('en-ZA')}
            </span>
          )}
        </div>
      )}

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
            <Accordion type="multiple" defaultValue={['personal', 'business']}>
              <AccordionItem value="personal">
                <AccordionTrigger style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>
                  Personal Details
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <PField label="First Name"       value={customer.firstName} />
                    <PField label="Last Name"        value={customer.lastName} />
                    <PField label="ID Number"        value={customer.idNumber} mono />
                    <PField label="Date of Birth"    value={fmtDate(customer.dateOfBirth)} />
                    <PField label="Gender"           value={fmt(customer.gender)} />
                    <PField label="Nationality"      value={fmt(customer.nationality)} />
                    <PField label="Phone (Mobile)"   value={customer.phone} mono />
                    <PField label="Landline"         value={fmt(customer.landline)} mono />
                    <PField label="Email"            value={fmt(customer.email)} />
                    <PField label="Physical Address" value={fmt(customer.physicalAddress)} span2 />
                    <PField label="Postal Address"   value={fmt(customer.postalAddress)}  span2 />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="business">
                <AccordionTrigger style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>
                  Business Details
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <PField label="Customer Type"    value={customer.customerType} />
                    <PField label="Primary Function" value={fmt(customer.primaryFunction)} />

                    <div>
                      <span style={lbl}>Market Sector</span>
                      {customer.marketSector === 'formal'
                        ? <Pill text="Formal"   bg="#DBEAFE" color="#1E40AF" />
                        : customer.marketSector === 'informal'
                        ? <Pill text="Informal" bg="#FEF3C7" color="#92400E" />
                        : <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>}
                    </div>

                    <div>
                      <span style={lbl}>Dealer Category</span>
                      <span style={{ fontSize: 12, color: customer.dealerCategory ? '#212529' : '#9CA3AF' }}>
                        {customer.dealerCategory ? DEALER_LABELS[customer.dealerCategory] : '—'}
                        {customer.priceGroup && (
                          <span style={{ color: '#6C757D', marginLeft: 4 }}>· {customer.priceGroup.name}</span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span style={lbl}>VAT</span>
                      {customer.zeroRated
                        ? <Pill text="Zero Rated" bg="#FEF9C3" color="#713F12" />
                        : <span style={{ fontSize: 12, color: '#6C757D' }}>VAT Applied</span>}
                    </div>

                    <PField label="Price Group"    value={customer.priceGroup?.name} />
                    <PField label="Company Name"   value={fmt(customer.companyName)} />
                    <PField label="Company Reg No" value={fmt(customer.companyRegNumber)} mono />
                    <PField label="Contact Person" value={fmt(customer.contactPerson)} />
                    <PField label="VAT Number"     value={fmt(customer.vatNumber)} mono />
                    <PField label="Credit Limit"   value={fmtMoney(customer.creditLimit)} />

                    {customer.tradeCommodities && customer.tradeCommodities.length > 0 && (
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={lbl}>Trade Commodities</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                          {customer.tradeCommodities.map((c) => (
                            <Pill key={c} text={c} bg="#DCFCE7" color="#166534" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="banking">
                <AccordionTrigger style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>
                  Banking Details
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <PField label="Bank Name"      value={fmt(customer.bankName)} />
                    <PField label="Account Number" value={fmt(customer.bankAccountNo)} mono />
                    <PField label="Branch Code"    value={fmt(customer.bankBranchCode)} mono />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="compliance">
                <AccordionTrigger style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0', padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>
                  Compliance
                </AccordionTrigger>
                <AccordionContent>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <PField label="Police Register No." value={fmt(customer.policeRegisterNo)} mono />
                    <PField label="License Number"      value={fmt(customer.licenseNumber)} mono />
                    <PField label="License Expiry"      value={fmtDate(customer.licenseExpiry)} />
                    <PField label="Registered"          value={new Date(customer.createdAt).toLocaleDateString('en-ZA')} />
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
          {tab === 'Documents'    && <DocumentsTab customer={customer} onPhotoSaved={() => mutate(`/api/customers/${id}`)} />}
          {tab === 'Blacklist'    && (
            <BlacklistTab
              customer={customer}
              onAction={() => setBlacklistOpen(true)}
              onUnblacklist={async () => {
                const res = await fetch(`/api/customers/${id}/unblacklist`, { method: 'POST' })
                if (res.ok) { toast.success('Customer unblacklisted'); mutate(`/api/customers/${id}`) }
                else toast.error('Failed to unblacklist customer')
              }}
            />
          )}
        </div>

        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div style={{ width: 200, flexShrink: 0, background: '#FAFAFA' }}>
          <SHdr title="Profile" />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div>
              <span style={lbl}>Type</span>
              <Pill
                text={customer.customerType === 'account' ? 'Account' : 'Casual'}
                bg={customer.customerType === 'account' ? '#DBEAFE' : '#F3F4F6'}
                color={customer.customerType === 'account' ? '#1E40AF' : '#374151'}
              />
            </div>
            {customer.primaryFunction && (
              <div>
                <span style={lbl}>Function</span>
                <Pill text={customer.primaryFunction} bg="#F3E8FF" color="#6B21A8" />
              </div>
            )}
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
            {customer.priceGroup && (
              <div>
                <span style={lbl}>Price Group</span>
                <span style={{ fontSize: 11, color: '#212529', fontWeight: 600 }}>{customer.priceGroup.name}</span>
              </div>
            )}
          </div>

          <SHdr title="Actions" />
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button
              onClick={() => setEditOpen(true)}
              style={{ fontSize: 11, padding: '4px 8px', background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)', border: '1px solid #ABABAB', borderRadius: 2, cursor: 'pointer', textAlign: 'left', color: '#333', width: '100%' }}
            >
              ✏  Edit Profile
            </button>
            <button
              onClick={() => router.push('/app/purchases/new')}
              style={{ fontSize: 11, padding: '4px 8px', background: 'linear-gradient(180deg,#2E8B57 0%,#1E6B3D 100%)', border: '1px solid #176338', borderRadius: 2, cursor: 'pointer', color: '#fff', fontWeight: 700, width: '100%', textAlign: 'left' }}
            >
              + New Purchase
            </button>
            <button
              onClick={() => setTab('Blacklist')}
              style={{
                fontSize: 11, padding: '4px 8px', borderRadius: 2, cursor: 'pointer', width: '100%', textAlign: 'left',
                background: customer.blacklisted ? 'linear-gradient(180deg,#DCFCE7 0%,#BBF7D0 100%)' : 'linear-gradient(180deg,#FEE2E2 0%,#FECACA 100%)',
                border: `1px solid ${customer.blacklisted ? '#86EFAC' : '#FCA5A5'}`,
                color: customer.blacklisted ? '#166534' : '#991B1B',
              }}
            >
              {customer.blacklisted ? '✓  Remove Blacklist' : '⚠  Blacklist'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      {editOpen && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setEditOpen(false)}
          onSuccess={() => { mutate(`/api/customers/${id}`); setEditOpen(false) }}
        />
      )}
      {blacklistOpen && (
        <BlacklistModal
          customerId={id}
          onClose={() => setBlacklistOpen(false)}
          onSuccess={() => { mutate(`/api/customers/${id}`); setBlacklistOpen(false) }}
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

// ─── Documents Tab ────────────────────────────────────────────────────────────
function DocumentsTab({ customer, onPhotoSaved }: { customer: Customer; onPhotoSaved: () => void }) {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [justUploaded, setJustUploaded] = useState(false)
  const [docType, setDocType]           = useState<string>('trading_licence')
  const [uploading, setUploading]       = useState(false)
  const { data: docs, mutate: mutateDocs } = useSWR<CustomerDoc[]>(`/api/customers/${customer.id}/documents`, fetcher)

  async function savePhotoKey(key: string) {
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idPhotoR2Key: key }),
    })
    if (res.ok) { setJustUploaded(true); onPhotoSaved() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to save photo reference') }
  }

  async function handlePhotoDeleted() {
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idPhotoR2Key: null }),
    })
    if (res.ok) onPhotoSaved()
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const presignRes = await fetch('/api/r2/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, context: 'customer_document', referenceId: customer.id, fileSize: file.size }),
      })
      if (!presignRes.ok) { toast.error('Failed to get upload URL'); return }
      const { uploadUrl: url, key } = await presignRes.json()
      const uploadRes = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!uploadRes.ok) { toast.error('Upload failed'); return }
      const saveRes = await fetch(`/api/customers/${customer.id}/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: docType, r2Key: key, fileName: file.name }),
      })
      if (saveRes.ok) { toast.success('Document uploaded'); mutateDocs() }
      else toast.error('Failed to save document')
    } finally { setUploading(false); e.target.value = '' }
  }

  async function handleDocDelete(docId: string) {
    const res = await fetch(`/api/customers/${customer.id}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Document deleted'); mutateDocs() }
    else toast.error('Failed to delete document')
  }

  async function handleDocView(r2Key: string) {
    const res = await fetch(`/api/r2/view-url?key=${encodeURIComponent(r2Key)}`)
    if (res.ok) { const { url } = await res.json(); window.open(url, '_blank') }
    else toast.error('Failed to get view URL')
  }

  return (
    <div>
      {/* Compliance docs */}
      <SHdr title="Compliance Documents" />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            style={{ height: 26, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 7px', fontSize: 12, color: '#212529', background: '#fff', outline: 'none' }}
          >
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1, fontSize: 11, padding: '2px 10px', background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)', border: '1px solid #ABABAB', borderRadius: 2, color: '#333' }}>
            {uploading ? 'Uploading…' : '+ Upload Document'}
            <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocUpload} disabled={uploading} />
          </label>
        </div>

        {!docs?.length ? (
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>No compliance documents uploaded yet.</p>
        ) : (
          <div style={{ border: '1px solid #E0E0E0', borderRadius: 2, overflow: 'hidden' }}>
            {docs.map((doc, i) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', background: i % 2 === 0 ? '#fff' : '#FAFAFA', borderBottom: i < docs.length - 1 ? '1px solid #F0F0F0' : undefined }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#212529' }}>{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 6 }}>{doc.fileName} · {new Date(doc.uploadedAt).toLocaleDateString('en-ZA')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleDocView(doc.r2Key)} style={{ fontSize: 11, color: '#1B3A6B', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>View</button>
                  {isManager && (
                    <button onClick={() => handleDocDelete(doc.id)} style={{ fontSize: 11, color: '#C53030', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ID Photo */}
      <SHdr title="ID Document Photo" />
      <div style={{ padding: '10px 12px' }}>
        {customer.idPhotoR2Key ? (
          <PhotoViewer
            r2Key={customer.idPhotoR2Key}
            alt={`${customer.firstName} ${customer.lastName} ID`}
            canDelete={isManager}
            onDelete={handlePhotoDeleted}
            autoLoad={justUploaded}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>No ID photo uploaded yet.</p>
            <PhotoUploader context="customer_id" referenceId={customer.id} label="Upload ID Photo" onUploaded={savePhotoKey} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Blacklist Tab ────────────────────────────────────────────────────────────
function BlacklistTab({ customer, onAction, onUnblacklist }: {
  customer: Customer; onAction: () => void; onUnblacklist: () => void
}) {
  return (
    <div>
      <SHdr title="Blacklist Management" />
      <div style={{ padding: '12px' }}>
        {customer.blacklisted ? (
          <>
            <div style={{ background: '#FFF0F0', border: '1px solid #F0C0C0', borderRadius: 2, padding: '8px 12px', marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#C53030', margin: '0 0 4px' }}>Currently Blacklisted</p>
              <p style={{ fontSize: 12, color: '#9B2C2C', margin: '0 0 4px' }}>{customer.blacklistReason}</p>
              {customer.blacklistedAt && (
                <p style={{ fontSize: 10, color: '#FC8181', margin: 0 }}>
                  Since {new Date(customer.blacklistedAt).toLocaleDateString('en-ZA')}
                </p>
              )}
            </div>
            <button
              onClick={onUnblacklist}
              style={{ fontSize: 11, padding: '4px 12px', background: 'linear-gradient(180deg,#DCFCE7 0%,#BBF7D0 100%)', border: '1px solid #86EFAC', borderRadius: 2, cursor: 'pointer', color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ShieldCheck style={{ width: 12, height: 12 }} /> Remove from Blacklist
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#6C757D', marginBottom: 10 }}>This customer is not blacklisted.</p>
            <button
              onClick={onAction}
              style={{ fontSize: 11, padding: '4px 12px', background: 'linear-gradient(180deg,#FEE2E2 0%,#FECACA 100%)', border: '1px solid #FCA5A5', borderRadius: 2, cursor: 'pointer', color: '#991B1B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ShieldBan style={{ width: 12, height: 12 }} /> Blacklist Customer
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const EDIT_TABS = ['Personal', 'Business', 'Banking', 'Compliance'] as const

function EditCustomerModal({ customer, onClose, onSuccess }: { customer: Customer; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading]   = useState(false)
  const [editTab, setEditTab]   = useState<typeof EDIT_TABS[number]>('Personal')
  const { data: pgData } = useSWR<{ groups: { id: string; name: string; isActive: boolean }[] }>('/api/price-groups', fetcher)
  const priceGroups = (pgData?.groups ?? []).filter((g) => g.isActive)

  const fmtDateInput = (v?: string | null) => {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().split('T')[0]
  }

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<UpdateCustomerFormInput, unknown, UpdateCustomerInput>({
    resolver: zodResolver(UpdateCustomerSchema),
    defaultValues: {
      firstName: customer.firstName, lastName: customer.lastName,
      phone: customer.phone, email: customer.email ?? '',
      physicalAddress: customer.physicalAddress ?? '', postalAddress: customer.postalAddress ?? '',
      vatNumber: customer.vatNumber ?? '', companyName: customer.companyName ?? '',
      companyRegNumber: customer.companyRegNumber ?? '', contactPerson: customer.contactPerson ?? '',
      landline: customer.landline ?? '',
      customerType: customer.customerType as 'casual' | 'account',
      primaryFunction: (customer.primaryFunction as 'customer' | 'supplier' | 'both') ?? 'supplier',
      gender: (customer.gender as 'male' | 'female' | 'other') ?? undefined,
      nationality: customer.nationality ?? '',
      bankName: customer.bankName ?? '', bankAccountNo: customer.bankAccountNo ?? '', bankBranchCode: customer.bankBranchCode ?? '',
      creditLimit: customer.creditLimit ? String(parseFloat(customer.creditLimit)) : '',
      policeRegisterNo: customer.policeRegisterNo ?? '', licenseNumber: customer.licenseNumber ?? '',
      dateOfBirth: fmtDateInput(customer.dateOfBirth), licenseExpiry: fmtDateInput(customer.licenseExpiry),
      tradeCommodities: customer.tradeCommodities ?? [], customerNotes: customer.customerNotes ?? '',
      priceGroupId: customer.priceGroupId ?? undefined,
      marketSector: customer.marketSector ?? undefined, dealerCategory: customer.dealerCategory ?? undefined,
      zeroRated: customer.zeroRated ?? false,
    },
  })

  const tradeCommodities = (watch('tradeCommodities') as string[] | undefined) ?? []

  function toggleCommodity(val: string) {
    if (tradeCommodities.includes(val)) setValue('tradeCommodities', tradeCommodities.filter((c) => c !== val))
    else setValue('tradeCommodities', [...tradeCommodities, val])
  }

  async function onSubmit(data: UpdateCustomerInput) {
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>

        <div className="flex gap-1 border-b -mx-1 mb-4">
          {EDIT_TABS.map((t) => (
            <button key={t} type="button" onClick={() => setEditTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${editTab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {editTab === 'Personal' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First Name</Label><Input {...register('firstName')} className="mt-1" disabled={loading} />{errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}</div>
                <div><Label>Last Name</Label><Input {...register('lastName')} className="mt-1" disabled={loading} />{errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date of Birth</Label><Input {...register('dateOfBirth')} type="date" className="mt-1" disabled={loading} /></div>
                <div>
                  <Label>Gender</Label>
                  <Select onValueChange={(v) => setValue('gender', v as 'male' | 'female' | 'other')} defaultValue={customer.gender ?? ''}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Nationality</Label><Input {...register('nationality')} className="mt-1" disabled={loading} /></div>
              <div><Label>Phone (Mobile)</Label><Input {...register('phone')} className="mt-1" disabled={loading} />{errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}</div>
              <div><Label>Landline <span className="text-gray-400 font-normal">(optional)</span></Label><Input {...register('landline')} className="mt-1" disabled={loading} /></div>
              <div><Label>Email</Label><Input {...register('email')} type="email" className="mt-1" disabled={loading} /></div>
              <div><Label>Physical Address</Label><Input {...register('physicalAddress')} className="mt-1" disabled={loading} /></div>
              <div><Label>Postal Address</Label><Input {...register('postalAddress')} className="mt-1" disabled={loading} /></div>
            </div>
          )}

          {editTab === 'Business' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Market Sector</Label>
                  <Select onValueChange={(v) => setValue('marketSector', v === 'none' ? undefined : v as 'formal' | 'informal')} defaultValue={customer.marketSector ?? 'none'}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="formal">Formal (scrap yard)</SelectItem>
                      <SelectItem value="informal">Informal (street seller)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dealer Category</Label>
                  <Select onValueChange={(v) => setValue('dealerCategory', v === 'none' ? undefined : v as 'casual' | 'dealer_1' | 'dealer_2' | 'dealer_3')} defaultValue={customer.dealerCategory ?? 'none'}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="dealer_1">Dealer 1 → Price Group A</SelectItem>
                      <SelectItem value="dealer_2">Dealer 2 → Price Group B</SelectItem>
                      <SelectItem value="dealer_3">Dealer 3 → Price Group C</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <div>
                  <Label className="text-yellow-800">Zero-Rated VAT</Label>
                  <p className="text-xs text-yellow-700 mt-0.5">No VAT will be charged on this account&apos;s transactions</p>
                </div>
                <input type="checkbox" checked={watch('zeroRated') ?? false} onChange={(e) => setValue('zeroRated', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Customer Type</Label>
                  <Select onValueChange={(v) => setValue('customerType', v as 'casual' | 'account')} defaultValue={customer.customerType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="casual">Casual</SelectItem><SelectItem value="account">Account</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Primary Function</Label>
                  <Select onValueChange={(v) => setValue('primaryFunction', v as 'customer' | 'supplier' | 'both')} defaultValue={customer.primaryFunction ?? 'supplier'}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier">Supplier (sells to us)</SelectItem>
                      <SelectItem value="customer">Customer (buys from us)</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Price Group <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Select onValueChange={(v) => setValue('priceGroupId', !v || v === 'none' ? undefined : v)} value={watch('priceGroupId') ?? 'none'}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No price group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No price group</SelectItem>
                    {priceGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Company Name</Label><Input {...register('companyName')} className="mt-1" disabled={loading} /></div>
              <div><Label>Company Reg No</Label><Input {...register('companyRegNumber')} className="mt-1" disabled={loading} /></div>
              <div><Label>Contact Person</Label><Input {...register('contactPerson')} className="mt-1" disabled={loading} /></div>
              <div><Label>VAT Number</Label><Input {...register('vatNumber')} className="mt-1" disabled={loading} />{errors.vatNumber && <p className="text-xs text-red-600 mt-1">{errors.vatNumber.message}</p>}</div>
              <div><Label>Credit Limit (R)</Label><Input {...register('creditLimit')} type="number" step="0.01" min="0" className="mt-1" disabled={loading} /></div>
              <div>
                <Label className="mb-2">Trade Commodities</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {COMMODITY_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={tradeCommodities.includes(opt)} onChange={() => toggleCommodity(opt)} className="w-4 h-4 rounded border-gray-300 text-green-600" />{opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <textarea {...register('customerNotes')} rows={3} className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" disabled={loading} />
              </div>
            </div>
          )}

          {editTab === 'Banking' && (
            <div className="space-y-3">
              <div><Label>Bank Name</Label><Input {...register('bankName')} className="mt-1" disabled={loading} placeholder="e.g. ABSA, FNB, Standard Bank" /></div>
              <div><Label>Account Number</Label><Input {...register('bankAccountNo')} className="mt-1" disabled={loading} /></div>
              <div><Label>Branch Code</Label><Input {...register('bankBranchCode')} className="mt-1" disabled={loading} placeholder="6-digit branch code" /></div>
            </div>
          )}

          {editTab === 'Compliance' && (
            <div className="space-y-3">
              <div><Label>Police Register No.</Label><Input {...register('policeRegisterNo')} className="mt-1" disabled={loading} /></div>
              <div><Label>License Number <span className="text-gray-400 font-normal">(Second-Hand Goods Act)</span></Label><Input {...register('licenseNumber')} className="mt-1" disabled={loading} /></div>
              <div><Label>License Expiry</Label><Input {...register('licenseExpiry')} type="date" className="mt-1" disabled={loading} /></div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
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

// ─── Blacklist Modal ──────────────────────────────────────────────────────────
function BlacklistModal({ customerId, onClose, onSuccess }: { customerId: string; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<BlacklistInput>({ resolver: zodResolver(BlacklistSchema) })

  async function onSubmit(data: BlacklistInput) {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/blacklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) { toast.success('Customer blacklisted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to blacklist') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Blacklist Customer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label>Reason <span className="text-gray-400 font-normal">(min 10 chars)</span></Label>
            <Input {...register('reason')} className="mt-1" placeholder="Reason for blacklisting..." disabled={loading} />
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Blacklisting...</> : 'Blacklist Customer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
