'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { AlertTriangle, ShieldBan, ShieldCheck, Loader2, Camera } from 'lucide-react'
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
import { colors } from '@/lib/design-tokens'

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

type CustomerDoc = {
  id: string; documentType: string; fileName: string; r2Key: string
  notes?: string; uploadedAt: string
}

const DEALER_LABELS: Record<string, string> = {
  casual: 'Casual', dealer_1: 'Dealer 1', dealer_2: 'Dealer 2', dealer_3: 'Dealer 3',
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  trading_licence:      'Trading Licence',
  sars_certificate:     'SARS Certificate',
  company_registration: 'Company Registration',
  id_copy:              'ID Copy',
  other:                'Other',
}

const COMMODITY_OPTIONS = [
  'Copper', 'Aluminium', 'Steel (Ferrous)', 'Non-Ferrous Metals',
  'Stainless Steel', 'Lead', 'Brass', 'Iron', 'E-Waste (Electronics)',
  'Plastic', 'Paper / Cardboard', 'Catalytic Converters', 'Batteries', 'Other',
]

const EDIT_TABS = ['Personal', 'Business', 'Banking', 'Compliance'] as const
const PROFILE_TABS = ['Overview', 'Transactions', 'Documents', 'Blacklist'] as const

// ─── Design tokens (mirrors Settings page) ────────────────────────────────────

const sHdrStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)',
  borderBottom: '1px solid #C0C0C0',
  padding: '4px 10px',
}
const lblStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 2,
}
const titleBtn: React.CSSProperties = {
  fontSize: 11, padding: '2px 10px', cursor: 'pointer', borderRadius: 2,
  background: 'linear-gradient(180deg,#F5F5F5 0%,#E0E0E0 100%)',
  border: '1px solid #ABABAB', color: '#333',
  display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' as const,
}

function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, borderRadius: 2, padding: '1px 6px', background: bg, color }}>
      {text}
    </span>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function CustomerProfileModal({
  customerId,
  onClose,
}: {
  customerId: string | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<typeof PROFILE_TABS[number]>('Overview')
  const [editOpen, setEditOpen] = useState(false)
  const [blacklistOpen, setBlacklistOpen] = useState(false)

  const { data: customer, isLoading } = useSWR<Customer>(
    customerId ? `/api/customers/${customerId}` : null,
    fetcher,
  )

  function handleClose() {
    setTab('Overview')
    setEditOpen(false)
    setBlacklistOpen(false)
    onClose()
  }

  function refreshCustomer() {
    if (customerId) mutate(`/api/customers/${customerId}`)
  }

  return (
    <Dialog open={!!customerId} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-5xl h-[92vh] flex flex-col overflow-hidden p-0" showCloseButton={false}>
        <ModalTitleBar title="Customer Profile" onClose={handleClose} />

        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.textSecondary }} />
          </div>
        )}
        {!isLoading && !customer && (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
            Customer not found
          </div>
        )}

        {customer && (
          <>
            {/* ── Customer info bar ─────────────────────────────────────────── */}
            <div style={{ background: 'linear-gradient(180deg,#FAFAFA 0%,#F0F0F0 100%)', borderBottom: '1px solid #D0D0D0', padding: '7px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>
                    {customer.firstName} {customer.lastName}
                  </span>
                  {customer.accountCode && (
                    <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#1B3A6B', background: '#E8EFF8', border: '1px solid #B0C4DE', borderRadius: 2, padding: '1px 6px' }}>
                      {customer.accountCode}
                    </span>
                  )}
                  <Pill text={customer.customerType} bg="#E8EFF8" color="#1B3A6B" />
                  {customer.primaryFunction && (
                    <Pill text={customer.primaryFunction} bg="#E8F0E8" color="#1B5E20" />
                  )}
                  {customer.blacklisted
                    ? <Pill text="Blacklisted" bg="#FEE2E2" color="#B91C1C" />
                    : <Pill text="Active" bg="#DCFCE7" color="#166534" />}
                </div>
                <button onClick={() => setEditOpen(true)} style={titleBtn}>✏  Edit</button>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                {customer.idNumber && (
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6C757D' }}>{customer.idNumber}</span>
                )}
                <span style={{ fontSize: 11, color: '#6C757D' }}>{customer.phone}</span>
              </div>
            </div>

            {/* ── Blacklist banner ───────────────────────────────────────────── */}
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

            {/* ── Tab strip ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', borderBottom: '1px solid #C0C0C0', background: '#EFEFEF', flexShrink: 0 }}>
              {PROFILE_TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '6px 14px', fontSize: 12, fontWeight: tab === t ? 700 : 400,
                    color: tab === t ? '#217346' : '#6C757D',
                    background: 'none', border: 'none',
                    borderBottom: tab === t ? '2px solid #217346' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ── Scrollable tab content ─────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {tab === 'Overview'     && <OverviewTab customer={customer} />}
              {tab === 'Transactions' && <TransactionsTab customerId={customer.id} />}
              {tab === 'Documents'    && <DocumentsTab customer={customer} onPhotoSaved={refreshCustomer} />}
              {tab === 'Blacklist'    && (
                <BlacklistTab
                  customer={customer}
                  onAction={() => setBlacklistOpen(true)}
                  onUnblacklist={async () => {
                    const res = await fetch(`/api/customers/${customer.id}/unblacklist`, { method: 'POST' })
                    if (res.ok) { toast.success('Customer unblacklisted'); refreshCustomer() }
                    else toast.error('Failed to unblacklist customer')
                  }}
                />
              )}
            </div>
          </>
        )}

        {/* Nested modals */}
        {editOpen && customer && (
          <EditCustomerModal
            customer={customer}
            onClose={() => setEditOpen(false)}
            onSuccess={() => { refreshCustomer(); setEditOpen(false) }}
          />
        )}
        {blacklistOpen && customer && (
          <BlacklistModal
            customerId={customer.id}
            onClose={() => setBlacklistOpen(false)}
            onSuccess={() => { refreshCustomer(); setBlacklistOpen(false) }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Section & Field (Settings-style) ────────────────────────────────────────

function Section({ title, children, cols = 2 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ borderBottom: '1px solid #E0E0E0' }}>
      <div style={sHdrStyle}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>{title}</span>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '8px 16px', padding: '10px 12px' }}>
        {children}
      </dl>
    </div>
  )
}

function Field({ label, value, mono, span2 }: { label: string; value?: string | null; mono?: boolean; span2?: boolean }) {
  const display = value ?? '—'
  return (
    <div style={span2 ? { gridColumn: 'span 2' } : undefined}>
      <span style={lblStyle}>{label}</span>
      <span style={{ display: 'block', fontSize: 12, color: display === '—' ? '#9CA3AF' : '#212529', fontFamily: mono ? 'monospace' : undefined, minHeight: 16, lineHeight: '16px' }}>
        {display}
      </span>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ customer }: { customer: Customer }) {
  const fmt      = (v?: string | null) => v || null
  const fmtDate  = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-ZA') : null
  const fmtMoney = (v?: string | null) => v ? `R ${parseFloat(v).toFixed(2)}` : null

  return (
    <div style={{ border: '1px solid #D0D0D0', margin: 8, borderRadius: 2, overflow: 'hidden' }}>
      <Section title="Personal Details">
        <Field label="First Name"       value={customer.firstName} />
        <Field label="Last Name"        value={customer.lastName} />
        <Field label="ID Number"        value={customer.idNumber} mono />
        <Field label="Date of Birth"    value={fmtDate(customer.dateOfBirth)} />
        <Field label="Gender"           value={fmt(customer.gender)} />
        <Field label="Nationality"      value={fmt(customer.nationality)} />
        <Field label="Phone (Mobile)"   value={customer.phone} />
        <Field label="Landline"         value={fmt(customer.landline)} />
        <Field label="Email"            value={fmt(customer.email)} />
        <Field label="Physical Address" value={fmt(customer.physicalAddress)} span2 />
        <Field label="Postal Address"   value={fmt(customer.postalAddress)} span2 />
      </Section>

      <Section title="Business Details">
        <Field label="Customer Type"    value={customer.customerType} />
        <Field label="Primary Function" value={fmt(customer.primaryFunction)} />
        <Field label="Market Sector"    value={customer.marketSector === 'formal' ? 'Formal (Scrap Yard)' : customer.marketSector === 'informal' ? 'Informal (Street Seller)' : null} />
        <Field label="Dealer Category"  value={customer.dealerCategory ? DEALER_LABELS[customer.dealerCategory] : null} />
        <Field label="VAT"              value={customer.zeroRated ? 'Zero Rated' : 'Standard'} />
        <Field label="Price Group"      value={customer.priceGroup?.name ?? null} />
        <Field label="Company Name"     value={fmt(customer.companyName)} />
        <Field label="Company Reg No"   value={fmt(customer.companyRegNumber)} />
        <Field label="Contact Person"   value={fmt(customer.contactPerson)} />
        <Field label="VAT Number"       value={fmt(customer.vatNumber)} />
        <Field label="Credit Limit"     value={fmtMoney(customer.creditLimit)} />
        {customer.tradeCommodities && customer.tradeCommodities.length > 0 && (
          <Field label="Trade Commodities" value={customer.tradeCommodities.join(', ')} span2 />
        )}
      </Section>

      <Section title="Banking Details">
        <Field label="Bank Name"       value={fmt(customer.bankName)} />
        <Field label="Account Number"  value={fmt(customer.bankAccountNo)} mono />
        <Field label="Branch Code"     value={fmt(customer.bankBranchCode)} mono />
      </Section>

      <Section title="Compliance">
        <Field label="Police Register No." value={fmt(customer.policeRegisterNo)} />
        <Field label="License Number"      value={fmt(customer.licenseNumber)} />
        <Field label="License Expiry"      value={fmtDate(customer.licenseExpiry)} />
        <Field label="Registered"          value={new Date(customer.createdAt).toLocaleDateString('en-ZA')} />
      </Section>

      {customer.customerNotes && (
        <div style={{ borderBottom: '1px solid #E0E0E0' }}>
          <div style={sHdrStyle}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Notes</span>
          </div>
          <p style={{ fontSize: 12, color: '#212529', padding: '10px 12px', whiteSpace: 'pre-wrap', margin: 0 }}>
            {customer.customerNotes}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({ customerId }: { customerId: string }) {
  const { data } = useSWR(`/api/customers/${customerId}/transactions`, fetcher)
  if (!data?.transactions?.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, fontSize: 13, color: '#9CA3AF' }}>
        No transactions yet
      </div>
    )
  }
  return (
    <div style={{ margin: 8, border: '1px solid #D0D0D0', borderRadius: 2, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#E8E8E8 100%)', borderBottom: '1px solid #C0C0C0' }}>
            {['Date', 'Reference', 'Type', 'Amount', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6C757D' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.transactions.map((tx: { id: string; type: string; reference: string; date: string; amount: string; status: string }, i: number) => (
            <tr key={tx.id} style={{ borderTop: i > 0 ? '1px solid #F0F0F0' : undefined, background: i % 2 === 0 ? '#FAFAFA' : '#FFFFFF' }}>
              <td style={{ padding: '5px 10px', color: '#6C757D' }}>{new Date(tx.date).toLocaleDateString('en-ZA')}</td>
              <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: '#212529' }}>{tx.reference}</td>
              <td style={{ padding: '5px 10px', textTransform: 'capitalize', color: '#212529' }}>{tx.type}</td>
              <td style={{ padding: '5px 10px', color: '#212529' }}>R {tx.amount}</td>
              <td style={{ padding: '5px 10px', textTransform: 'capitalize', color: '#6C757D' }}>{tx.status}</td>
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
  const [docType, setDocType] = useState<string>('trading_licence')
  const [uploading, setUploading] = useState(false)
  const { data: docs, mutate: mutateDocs } = useSWR<CustomerDoc[]>(
    `/api/customers/${customer.id}/documents`, fetcher,
  )

  async function savePhotoKey(key: string) {
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idPhotoR2Key: key }),
    })
    if (res.ok) { setJustUploaded(true); onPhotoSaved() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to save photo reference') }
  }

  async function handlePhotoDeleted() {
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idPhotoR2Key: null }),
    })
    if (res.ok) { onPhotoSaved() }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const presignRes = await fetch('/api/r2/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, context: 'customer_document', referenceId: customer.id, fileSize: file.size }),
      })
      if (!presignRes.ok) { toast.error('Failed to get upload URL'); return }
      const { uploadUrl: url, key } = await presignRes.json()
      const uploadRes = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!uploadRes.ok) { toast.error('Upload failed'); return }
      const saveRes = await fetch(`/api/customers/${customer.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: docType, r2Key: key, fileName: file.name }),
      })
      if (saveRes.ok) { toast.success('Document uploaded'); mutateDocs() }
      else { toast.error('Failed to save document') }
    } finally {
      setUploading(false)
      e.target.value = ''
    }
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
    <div style={{ margin: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Compliance Documents */}
      <div style={{ border: '1px solid #D0D0D0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={sHdrStyle}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Compliance Documents</span>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={{ border: '1px solid #C0C0C0', borderRadius: 2, padding: '3px 8px', fontSize: 12, background: '#fff' }}
            >
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1, ...titleBtn }}>
              {uploading ? 'Uploading…' : '+ Upload'}
              <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocUpload} disabled={uploading} />
            </label>
          </div>
          {!docs?.length ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>No compliance documents uploaded yet.</p>
          ) : (
            <div style={{ border: '1px solid #E0E0E0', borderRadius: 2, overflow: 'hidden' }}>
              {docs.map((doc, i) => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderTop: i > 0 ? '1px solid #F0F0F0' : undefined, background: i % 2 === 0 ? '#FAFAFA' : '#FFF' }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#212529', display: 'block' }}>{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{doc.fileName} · {new Date(doc.uploadedAt).toLocaleDateString('en-ZA')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleDocView(doc.r2Key)} style={{ fontSize: 11, color: '#1B3A6B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View</button>
                    {isManager && (
                      <button onClick={() => handleDocDelete(doc.id)} style={{ fontSize: 11, color: '#C53030', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ID Photo */}
      <div style={{ border: '1px solid #D0D0D0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ ...sHdrStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Camera style={{ width: 11, height: 11, color: '#1B3A6B' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>ID Document Photo</span>
        </div>
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
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>No ID photo uploaded yet</p>
              <PhotoUploader
                context="customer_id"
                referenceId={customer.id}
                label="Upload ID Photo"
                onUploaded={savePhotoKey}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Blacklist Tab ────────────────────────────────────────────────────────────

function BlacklistTab({ customer, onAction, onUnblacklist }: {
  customer: Customer; onAction: () => void; onUnblacklist: () => void
}) {
  return (
    <div style={{ margin: 8, border: '1px solid #D0D0D0', borderRadius: 2, overflow: 'hidden' }}>
      <div style={sHdrStyle}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Blacklist Status</span>
      </div>
      <div style={{ padding: '12px' }}>
        {customer.blacklisted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#FFF0F0', border: '1px solid #F0C0C0', borderRadius: 2, padding: '8px 12px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#C53030', margin: '0 0 4px' }}>Currently Blacklisted</p>
              <p style={{ fontSize: 12, color: '#9B2C2C', margin: '0 0 2px' }}>{customer.blacklistReason}</p>
              {customer.blacklistedAt && (
                <p style={{ fontSize: 11, color: '#FC8181', margin: 0 }}>Since {new Date(customer.blacklistedAt).toLocaleDateString('en-ZA')}</p>
              )}
            </div>
            <ModalBtn variant="outline" onClick={onUnblacklist} icon={<ShieldCheck style={{ width: 14, height: 14 }} />}>Remove from Blacklist</ModalBtn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#6C757D', margin: 0 }}>This customer is not blacklisted.</p>
            <ModalBtn variant="danger" onClick={onAction} icon={<ShieldBan style={{ width: 14, height: 14 }} />}>Blacklist Customer</ModalBtn>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit Customer Modal ──────────────────────────────────────────────────────

function EditCustomerModal({ customer, onClose, onSuccess }: {
  customer: Customer; onClose: () => void; onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [editTab, setEditTab] = useState<typeof EDIT_TABS[number]>('Personal')
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
      firstName:        customer.firstName,
      lastName:         customer.lastName,
      phone:            customer.phone,
      email:            customer.email ?? '',
      physicalAddress:  customer.physicalAddress ?? '',
      postalAddress:    customer.postalAddress ?? '',
      vatNumber:        customer.vatNumber ?? '',
      companyName:      customer.companyName ?? '',
      companyRegNumber: customer.companyRegNumber ?? '',
      contactPerson:    customer.contactPerson ?? '',
      landline:         customer.landline ?? '',
      customerType:     customer.customerType as 'casual' | 'account',
      primaryFunction:  (customer.primaryFunction as 'customer' | 'supplier' | 'both') ?? 'supplier',
      gender:           (customer.gender as 'male' | 'female' | 'other') ?? undefined,
      nationality:      customer.nationality ?? '',
      bankName:         customer.bankName ?? '',
      bankAccountNo:    customer.bankAccountNo ?? '',
      bankBranchCode:   customer.bankBranchCode ?? '',
      creditLimit:      customer.creditLimit ? String(parseFloat(customer.creditLimit)) : '',
      policeRegisterNo: customer.policeRegisterNo ?? '',
      licenseNumber:    customer.licenseNumber ?? '',
      dateOfBirth:      fmtDateInput(customer.dateOfBirth),
      licenseExpiry:    fmtDateInput(customer.licenseExpiry),
      tradeCommodities: customer.tradeCommodities ?? [],
      customerNotes:    customer.customerNotes ?? '',
      priceGroupId:     customer.priceGroupId ?? undefined,
      marketSector:     customer.marketSector ?? undefined,
      dealerCategory:   customer.dealerCategory ?? undefined,
      zeroRated:        customer.zeroRated ?? false,
    },
  })

  const tradeCommodities = (watch('tradeCommodities') as string[] | undefined) ?? []

  function toggleCommodity(val: string) {
    if (tradeCommodities.includes(val)) {
      setValue('tradeCommodities', tradeCommodities.filter((c) => c !== val))
    } else {
      setValue('tradeCommodities', [...tradeCommodities, val])
    }
  }

  async function onSubmit(data: UpdateCustomerInput) {
    setLoading(true)
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) { toast.success('Customer updated'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to update') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" showCloseButton={false}>
        <ModalTitleBar title="Edit Customer" onClose={onClose} />
        <div className="flex gap-1 border-b -mx-1 mb-4">
          {EDIT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEditTab(t)}
              className="px-3 py-2 text-xs font-medium border-b-2 transition-colors"
              style={editTab === t
                ? { borderColor: colors.process, color: colors.process }
                : { borderColor: 'transparent', color: colors.textSecondary }}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {editTab === 'Personal' && (
            <div className="space-y-3">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date of Birth</Label>
                  <Input {...register('dateOfBirth')} type="date" className="mt-1" disabled={loading} />
                </div>
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
              <div>
                <Label>Nationality</Label>
                <Input {...register('nationality')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Phone (Mobile)</Label>
                <Input {...register('phone')} className="mt-1" disabled={loading} />
                {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
              </div>
              <div>
                <Label>Landline <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input {...register('landline')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Email</Label>
                <Input {...register('email')} type="email" className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Physical Address</Label>
                <Input {...register('physicalAddress')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Postal Address</Label>
                <Input {...register('postalAddress')} className="mt-1" disabled={loading} />
              </div>
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
                <input
                  type="checkbox"
                  checked={watch('zeroRated') ?? false}
                  onChange={(e) => setValue('zeroRated', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Customer Type</Label>
                  <Select onValueChange={(v) => setValue('customerType', v as 'casual' | 'account')} defaultValue={customer.customerType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                    </SelectContent>
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
                <Select
                  onValueChange={(v) => setValue('priceGroupId', !v || v === 'none' ? undefined : v)}
                  value={watch('priceGroupId') ?? 'none'}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No price group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No price group</SelectItem>
                    {priceGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Company Name</Label>
                <Input {...register('companyName')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Company Reg No <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input {...register('companyRegNumber')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input {...register('contactPerson')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>VAT Number</Label>
                <Input {...register('vatNumber')} className="mt-1" disabled={loading} />
                {errors.vatNumber && <p className="text-xs text-red-600 mt-1">{errors.vatNumber.message}</p>}
              </div>
              <div>
                <Label>Credit Limit (R)</Label>
                <Input {...register('creditLimit')} type="number" step="0.01" min="0" className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label className="mb-2">Trade Commodities</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {COMMODITY_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tradeCommodities.includes(opt)}
                        onChange={() => toggleCommodity(opt)}
                        className="w-4 h-4 rounded border-gray-300 text-green-600"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <textarea
                  {...register('customerNotes')}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {editTab === 'Banking' && (
            <div className="space-y-3">
              <div>
                <Label>Bank Name</Label>
                <Input {...register('bankName')} className="mt-1" disabled={loading} placeholder="e.g. ABSA, FNB, Standard Bank" />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input {...register('bankAccountNo')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>Branch Code</Label>
                <Input {...register('bankBranchCode')} className="mt-1" disabled={loading} placeholder="6-digit branch code" />
              </div>
            </div>
          )}

          {editTab === 'Compliance' && (
            <div className="space-y-3">
              <div>
                <Label>Police Register No.</Label>
                <Input {...register('policeRegisterNo')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>License Number <span className="text-gray-400 font-normal">(Second-Hand Goods Act)</span></Label>
                <Input {...register('licenseNumber')} className="mt-1" disabled={loading} />
              </div>
              <div>
                <Label>License Expiry</Label>
                <Input {...register('licenseExpiry')} type="date" className="mt-1" disabled={loading} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
            <ModalBtn type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn type="submit" variant="primary" loading={loading}>Save Changes</ModalBtn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Blacklist Modal ──────────────────────────────────────────────────────────

function BlacklistModal({ customerId, onClose, onSuccess }: {
  customerId: string; onClose: () => void; onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<BlacklistInput>({
    resolver: zodResolver(BlacklistSchema),
  })

  async function onSubmit(data: BlacklistInput) {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) { toast.success('Customer blacklisted'); onSuccess() }
    else { const j = await res.json(); toast.error(j.error ?? 'Failed to blacklist') }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <ModalTitleBar title="Blacklist Customer" onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label>Reason <span className="text-gray-400 font-normal">(min 10 chars)</span></Label>
            <Input {...register('reason')} className="mt-1" placeholder="Reason for blacklisting..." disabled={loading} />
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <ModalBtn type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</ModalBtn>
            <ModalBtn type="submit" variant="danger" loading={loading}>Blacklist Customer</ModalBtn>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
