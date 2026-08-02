'use client'

import { useState, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'
import { AlertTriangle, ShieldBan, ShieldCheck, Loader2, Camera, Pencil } from 'lucide-react'
import { PhotoUploader, PhotoViewer } from '@/components/PhotoUploader'
import { TradeCommoditiesSelect } from '@/components/customers/TradeCommoditiesSelect'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { fetcher } from '@/lib/swrFetcher'
import {
  UpdateCustomerSchema,
  BlacklistSchema,
  type UpdateCustomerInput,
  type UpdateCustomerFormInput,
  type BlacklistInput,
} from '@/lib/schemas/customer'
import { colors, badgeStyle } from '@/lib/design-tokens'
import { Btn, HEADER_GRAD, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'


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
  id_copy:              'ID',
  passport:             'Passport',
  trading_licence:      'Trading License',
  company_registration: 'Company Registration',
  eea_license:          'EEA License',
  sars_certificate:     'VAT Certificate',
  other:                'Other',
}

const EDIT_TABS = ['Personal', 'Business', 'Banking', 'Compliance'] as const
const PROFILE_TABS = ['Overview', 'Transactions', 'Documents', 'Blacklist'] as const

// Get profile tabs based on customer type
function getProfileTabs(customerType: string) {
  if (customerType === 'casual') {
    return ['Overview', 'Transactions'] as const
  }
  return PROFILE_TABS
}

// ─── Design tokens (mirrors Settings page) ────────────────────────────────────

const sHdrStyle: React.CSSProperties = {
  background: HEADER_GRAD,
  borderBottom: '1px solid #C0C0C0',
  padding: '4px 10px',
}
const lblStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: '#6C757D', marginBottom: 2,
}

function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <span style={badgeStyle(color, bg)}>{text}</span>
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

  // Get tabs based on customer type
  const profileTabs = customer ? getProfileTabs(customer.customerType) : ['Overview'] as const

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
      <RpxDialogContent maxWidth={760} style={{ maxHeight: '90vh' }}>
        <RpxDialogHeader title="Customer Profile" onClose={handleClose} />

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
            <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #D0D0D0', padding: '4px 10px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#212529' }}>
                    {customer.firstName} {customer.lastName}
                  </span>

                  {/* Customer type badge - prominent */}
                  <Pill
                    text={customer.customerType === 'casual' ? 'Casual Seller' : 'Account Customer'}
                    bg={customer.customerType === 'casual' ? '#FEF3C7' : '#E8EFF8'}
                    color={customer.customerType === 'casual' ? '#92400E' : '#1B3A6B'}
                  />

                  {customer.accountCode && (
                    <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#1B3A6B', background: '#E8EFF8', border: '1px solid #B0C4DE', borderRadius: 2, padding: '1px 5px' }}>
                      {customer.accountCode}
                    </span>
                  )}

                  {/* Only show primary function for account customers */}
                  {customer.customerType === 'account' && customer.primaryFunction && (
                    <Pill text={customer.primaryFunction} bg="#E8F0E8" color="#1B5E20" />
                  )}

                  {customer.blacklisted
                    ? <Pill text="Blacklisted" bg={colors.dangerBg} color={colors.danger} />
                    : <Pill text="Active" bg={colors.actionBg} color={colors.action} />}
                </div>
                <Btn size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Btn>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                {customer.idNumber && (
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6C757D' }}>{customer.idNumber}</span>
                )}
                <span style={{ fontSize: 10, color: '#6C757D' }}>{customer.phone}</span>
              </div>
            </div>

            {/* ── Blacklist banner ───────────────────────────────────────────── */}
            {customer.blacklisted && (
              <div style={{ background: '#FFF0F0', borderBottom: '1px solid #F0C0C0', padding: '4px 10px', display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
                <AlertTriangle style={{ width: 12, height: 12, color: '#C53030', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#C53030' }}>Blacklisted</span>
                <span style={{ fontSize: 10, color: '#9B2C2C' }}>{customer.blacklistReason}</span>
                {customer.blacklistedAt && (
                  <span style={{ fontSize: 9, color: '#FC8181' }}>
                    · Since {new Date(customer.blacklistedAt).toLocaleDateString('en-ZA')}
                  </span>
                )}
              </div>
            )}

            {/* ── Section dropdown ──────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #C0C0C0', background: '#EFEFEF', flexShrink: 0 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary }}>View:</label>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as typeof tab)}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  border: '1px solid #C0C0C0',
                  borderRadius: 4,
                  background: '#FFF',
                  color: colors.textPrimary,
                  cursor: 'pointer',
                }}
              >
                {profileTabs.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
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
      </RpxDialogContent>
    </Dialog>
  )
}

// ─── Section & Field (Settings-style) ────────────────────────────────────────

function Section({ title, children, cols = 3 }: { title: string; children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ borderBottom: '1px solid #E0E0E0' }}>
      <div style={{ ...sHdrStyle, padding: '3px 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '6px 10px', padding: '6px 8px' }}>
        {children}
      </dl>
    </div>
  )
}

function Field({ label, value, mono, span2, span3 }: { label: string; value?: string | null; mono?: boolean; span2?: boolean; span3?: boolean }) {
  const display = value ?? '—'
  return (
    <div style={span3 ? { gridColumn: 'span 3' } : span2 ? { gridColumn: 'span 2' } : undefined}>
      <span style={{ ...lblStyle, fontSize: 9, marginBottom: 1 }}>{label}</span>
      <div style={{
        height: 22, border: '1px solid #D0D0D0', borderRadius: 2,
        background: '#F8F8F8', padding: '0 6px', fontSize: 11,
        color: display === '—' ? '#9CA3AF' : '#212529',
        fontFamily: mono ? 'monospace' : undefined,
        display: 'flex', alignItems: 'center',
        boxSizing: 'border-box' as const,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
      }}>
        {display}
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ customer }: { customer: Customer }) {
  const fmt      = (v?: string | null) => v || null
  const fmtDate  = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-ZA') : null
  const fmtMoney = (v?: string | null) => v ? `R ${parseFloat(v).toFixed(2)}` : null
  const isCasual = customer.customerType === 'casual'

  return (
    <div>
      <Section title="Personal & Contact" cols={isCasual ? 2 : 4}>
        <Field label="First Name"       value={customer.firstName} />
        <Field label="Last Name"        value={customer.lastName} />
        <Field label="ID Number"        value={customer.idNumber} mono />
        <Field label="Phone (Mobile)"   value={customer.phone} />
        {!isCasual && <Field label="Date of Birth"    value={fmtDate(customer.dateOfBirth)} />}
        {!isCasual && <Field label="Gender"           value={fmt(customer.gender)} />}
        {!isCasual && <Field label="Nationality"      value={fmt(customer.nationality)} />}
        {!isCasual && <Field label="Landline"         value={fmt(customer.landline)} />}
        {!isCasual && <Field label="Email"            value={fmt(customer.email)} span2 />}
        <Field label="Physical Address" value={fmt(customer.physicalAddress)} span2={!isCasual} />
        {!isCasual && <Field label="Postal Address"   value={fmt(customer.postalAddress)} span2 />}
      </Section>

      {!isCasual && (
        <Section title="Business & Pricing" cols={4}>
        <Field label="Customer Type"    value={customer.customerType} />
        <Field label="Primary Function" value={fmt(customer.primaryFunction)} />
        <Field label="Market Sector"    value={customer.marketSector === 'formal' ? 'Formal' : customer.marketSector === 'informal' ? 'Informal' : null} />
        <Field label="Dealer Category"  value={customer.dealerCategory ? DEALER_LABELS[customer.dealerCategory] : null} />
        <Field label="Apply VAT"        value={customer.zeroRated ? 'No' : 'Yes'} />
        <Field label="Price Group"      value={customer.priceGroup?.name ?? null} />
        <Field label="Credit Limit"     value={fmtMoney(customer.creditLimit)} />
        <Field label="Company Name"     value={fmt(customer.companyName)} />
        <Field label="Company Reg No"   value={fmt(customer.companyRegNumber)} />
        <Field label="Contact Person"   value={fmt(customer.contactPerson)} />
        <Field label="VAT Number"       value={fmt(customer.vatNumber)} span2 />
        {customer.tradeCommodities && customer.tradeCommodities.length > 0 && (
          <Field label="Trade Commodities" value={customer.tradeCommodities.join(', ')} span3 />
        )}
      </Section>
      )}

      {!isCasual && (
        <Section title="Banking & Compliance" cols={4}>
        <Field label="Bank Name"       value={fmt(customer.bankName)} />
        <Field label="Account Number"  value={fmt(customer.bankAccountNo)} mono />
        <Field label="Branch Code"     value={fmt(customer.bankBranchCode)} mono />
        <Field label="Registered"      value={new Date(customer.createdAt).toLocaleDateString('en-ZA')} />
        <Field label="Police Register No." value={fmt(customer.policeRegisterNo)} />
        <Field label="License Number"      value={fmt(customer.licenseNumber)} />
        <Field label="License Expiry"      value={fmtDate(customer.licenseExpiry)} />
      </Section>
      )}

      {customer.customerNotes && (
        <div style={{ borderBottom: '1px solid #E0E0E0' }}>
          <div style={{ ...sHdrStyle, padding: '3px 8px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</span>
          </div>
          <p style={{ fontSize: 11, color: '#212529', padding: '6px 8px', whiteSpace: 'pre-wrap', margin: 0 }}>
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
    <div style={{ borderBottom: '1px solid #E0E0E0' }}>
      <div style={sHdrStyle}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B' }}>Transactions</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F8F8F8', borderBottom: '1px solid #E0E0E0' }}>
            {['Date', 'Reference', 'Type', 'Amount', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '5px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6C757D' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.transactions.map((tx: { id: string; type: string; reference: string; date: string; amount: string; status: string }, i: number) => (
            <tr key={tx.id} style={{ borderTop: '1px solid #F0F0F0', background: i % 2 === 0 ? '#FAFAFA' : '#FFFFFF' }}>
              <td style={{ padding: '5px 12px', color: '#6C757D' }}>{new Date(tx.date).toLocaleDateString('en-ZA')}</td>
              <td style={{ padding: '5px 12px', fontFamily: 'monospace', color: '#212529' }}>{tx.reference}</td>
              <td style={{ padding: '5px 12px', textTransform: 'capitalize', color: '#212529' }}>{tx.type}</td>
              <td style={{ padding: '5px 12px', color: '#212529' }}>R {tx.amount}</td>
              <td style={{ padding: '5px 12px', textTransform: 'capitalize', color: '#6C757D' }}>{tx.status}</td>
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
  const [docType, setDocType] = useState<string>('id_copy')
  const [uploading, setUploading] = useState(false)
  const docFileRef = useRef<HTMLInputElement>(null)
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
      const fd = new FormData()
      fd.append('context', 'customer_document')
      fd.append('referenceId', customer.id)
      fd.append('file', file)
      const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) {
        const j = await uploadRes.json().catch(() => ({}))
        toast.error(j.error ?? 'Upload failed')
        return
      }
      const { key } = await uploadRes.json()
      const saveRes = await fetch(`/api/customers/${customer.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: docType, r2Key: key, fileName: file.name }),
      })
      if (saveRes.ok) { toast.success('Document uploaded'); mutateDocs() }
      else { toast.error('Failed to save document') }
    } catch {
      toast.error('Upload failed — check your connection')
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
    <div className="grid grid-cols-2 gap-0" style={{ height: '100%' }}>
      {/* Left: Compliance Documents */}
      <div style={{ borderRight: '1px solid #E0E0E0' }}>
        <div style={{ ...sHdrStyle, padding: '3px 8px' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compliance Documents</span>
        </div>
        <div style={{ padding: '6px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={{ border: '1px solid #C0C0C0', borderRadius: 2, padding: '2px 6px', fontSize: 10, background: '#fff' }}
            >
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input
              ref={docFileRef}
              type="file"
              style={{ display: 'none' }}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleDocUpload}
              disabled={uploading}
            />
            <Btn size="sm" loading={uploading} onClick={() => docFileRef.current?.click()}>
              + Upload
            </Btn>
          </div>
          {!docs?.length ? (
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>No documents uploaded.</p>
          ) : (
            <div style={{ border: '1px solid #E0E0E0', borderRadius: 2, overflow: 'hidden' }}>
              {docs.map((doc, i) => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', borderTop: i > 0 ? '1px solid #F0F0F0' : undefined, background: i % 2 === 0 ? '#FAFAFA' : '#FFF' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#212529', display: 'block' }}>{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                    <span style={{ fontSize: 9, color: '#9CA3AF' }}>{doc.fileName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleDocView(doc.r2Key)} style={{ fontSize: 9, color: '#1B3A6B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View</button>
                    {isManager && (
                      <button onClick={() => handleDocDelete(doc.id)} style={{ fontSize: 9, color: '#C53030', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: ID Photo */}
      <div>
        <div style={{ ...sHdrStyle, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Camera style={{ width: 10, height: 10, color: '#1B3A6B' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ID Photo</span>
        </div>
        <div style={{ padding: '6px 8px' }}>
          {customer.idPhotoR2Key ? (
            <PhotoViewer
              r2Key={customer.idPhotoR2Key}
              alt={`${customer.firstName} ${customer.lastName} ID`}
              canDelete={isManager}
              onDelete={handlePhotoDeleted}
              autoLoad={justUploaded}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>No ID photo uploaded yet</p>
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
    <div style={{ borderBottom: '1px solid #E0E0E0' }}>
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
            <Btn icon={ShieldCheck} onClick={onUnblacklist}>Remove from Blacklist</Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#6C757D', margin: 0 }}>This customer is not blacklisted.</p>
            <Btn variant="danger" icon={ShieldBan} onClick={onAction}>Blacklist Customer</Btn>
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
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [loading, setLoading] = useState(false)
  const [editTab, setEditTab] = useState<typeof EDIT_TABS[number]>('Personal')
  const { data: pgData } = useSWR<{ groups: { id: string; name: string; isActive: boolean }[] }>('/api/price-groups', fetcher)
  const priceGroups = (pgData?.groups ?? []).filter((g) => g.isActive)
  const { data: tcData } = useSWR<{ categories: { id: string; name: string; isActive: boolean }[] }>(
    '/api/settings/trade-commodities',
    fetcher
  )
  const commodityOptions = tcData?.categories?.filter((c) => c.isActive).map((c) => c.name) ?? []
  const isCasual = customer.customerType === 'casual'

  // Get edit tabs based on customer type
  const editTabs = isCasual ? ['Personal'] as const : EDIT_TABS

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
      <RpxDialogContent maxWidth={680} style={{ maxHeight: '90vh' }}>
        <RpxDialogHeader title="Edit Customer" onClose={onClose} />
        <RpxDialogBody>
        <div className="flex gap-1 border-b -mx-1 mb-4">
          {/* Only show tabs if not casual (casuals only have Personal) */}
          {!isCasual && editTabs.map((t) => (
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

        <form id="edit-customer-form" onSubmit={handleSubmit(onSubmit)}>
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

              {/* Only show these fields for account customers */}
              {!isCasual && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Date of Birth</Label>
                      <Input {...register('dateOfBirth')} type="date" className="mt-1" disabled={loading} />
                    </div>
                    <div>
                      <Label>Gender</Label>
                      <Select onValueChange={(v) => setValue('gender', v as 'male' | 'female' | 'other')} defaultValue={customer.gender ?? ''}>
                        <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                </>
              )}

              <div>
                <Label>Phone (Mobile)</Label>
                <Input {...register('phone')} className="mt-1" disabled={loading} />
                {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
              </div>

              {!isCasual && (
                <>
                  <div>
                    <Label>Landline <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Input {...register('landline')} className="mt-1" disabled={loading} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input {...register('email')} type="email" className="mt-1" disabled={loading} />
                  </div>
                </>
              )}

              <div>
                <Label>Physical Address</Label>
                <Input {...register('physicalAddress')} className="mt-1" disabled={loading} />
              </div>

              {!isCasual && (
                <div>
                  <Label>Postal Address</Label>
                  <Input {...register('postalAddress')} className="mt-1" disabled={loading} />
                </div>
              )}
            </div>
          )}

          {!isCasual && editTab === 'Business' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Market Sector</Label>
                  <Select onValueChange={(v) => setValue('marketSector', v === 'none' ? undefined : v as 'formal' | 'informal')} defaultValue={customer.marketSector ?? 'none'}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="formal">Formal (scrap yard)</SelectItem>
                      <SelectItem value="informal">Informal (street seller)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dealer Category</Label>
                  <Select
                    onValueChange={(v) => setValue('dealerCategory', v === 'none' ? undefined : v as 'casual' | 'dealer_1' | 'dealer_2' | 'dealer_3')}
                    defaultValue={customer.dealerCategory ?? 'none'}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="dealer_1">Dealer 1 → Price Group A</SelectItem>
                      <SelectItem value="dealer_2">Dealer 2 → Price Group B</SelectItem>
                      <SelectItem value="dealer_3">Dealer 3 → Price Group C</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isAdmin && (
                    <p className="text-xs mt-1 text-gray-500">Only an admin can change the dealer category</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <div>
                  <Label className="text-yellow-800">Apply VAT</Label>
                  <p className="text-xs text-yellow-700 mt-0.5">When unchecked, no VAT will be charged on this account&apos;s transactions</p>
                </div>
                <input
                  type="checkbox"
                  checked={!(watch('zeroRated') ?? false)}
                  onChange={(e) => setValue('zeroRated', !e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Customer Type</Label>
                  <Select onValueChange={(v) => setValue('customerType', v as 'casual' | 'account')} defaultValue={customer.customerType}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Primary Function</Label>
                  <Select onValueChange={(v) => setValue('primaryFunction', v as 'customer' | 'supplier' | 'both')} defaultValue={customer.primaryFunction ?? 'supplier'}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="No price group" /></SelectTrigger>
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
                <Label>Trade Commodities</Label>
                <div className="mt-1">
                  <TradeCommoditiesSelect
                    options={commodityOptions}
                    value={tradeCommodities}
                    onChange={(next) => setValue('tradeCommodities', next)}
                  />
                </div>
              </div>
              <div>
                <Label>Credit Limit (R)</Label>
                <Input {...register('creditLimit')} type="number" step="0.01" min="0" className="mt-1" disabled={loading} />
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

          {!isCasual && editTab === 'Banking' && (
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

          {!isCasual && editTab === 'Compliance' && (
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

        </form>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="edit-customer-form" loading={loading}>Save Changes</Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
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
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Blacklist Customer" onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)}>
          <RpxDialogBody>
            <Label>Reason <span className="text-gray-400 font-normal">(min 10 chars)</span></Label>
            <Input {...register('reason')} className="mt-1" placeholder="Reason for blacklisting..." disabled={loading} />
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason.message}</p>}
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn variant="danger" type="submit" loading={loading}>Blacklist Customer</Btn>
          </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}
