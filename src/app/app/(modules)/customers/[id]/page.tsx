'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { ArrowLeft, AlertTriangle, ShieldBan, ShieldCheck, Save, Pencil } from 'lucide-react'
import { PhotoUploader, PhotoViewer } from '@/components/PhotoUploader'
import { LoansTab } from '@/components/customers/LoansTab'
import { BusinessLoanTab } from '@/components/customers/BusinessLoanTab'
import { TradeCommoditiesSelect } from '@/components/customers/TradeCommoditiesSelect'
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
import {
  inp, lbl, HEADER_GRAD, NAVY,
  Btn, TabStrip, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const selectStyle = inp
const inpDisabled: React.CSSProperties = { ...inp, background: '#F5F5F5', color: '#6C757D', cursor: 'default' }
const selectDisabled = inpDisabled

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

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  trading_licence:      'Trading Licence',
  sars_certificate:     'SARS Certificate',
  company_registration: 'Company Registration',
  id_copy:              'ID Copy',
  other:                'Other',
}

const TABS_ACCOUNT = ['Overview', 'Transactions', 'Loans', 'Business Loan', 'Documents', 'Blacklist'] as const
const TABS_CASUAL = ['Overview', 'Transactions', 'Documents', 'Blacklist'] as const
const SECTION_TABS = ['Personal', 'Business', 'Banking', 'Compliance', 'Notes'] as const

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
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [tab, setTab] = useState<string>('Overview')
  const [sectionTab, setSectionTab] = useState<typeof SECTION_TABS[number]>('Personal')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [blacklistOpen, setBlacklistOpen] = useState(false)

  const { data: customer, isLoading } = useSWR<Customer>(`/api/customers/${id}`, fetcher)
  const { data: pgData } = useSWR<{ groups: { id: string; name: string; isActive: boolean }[] }>('/api/price-groups', fetcher)
  const priceGroups = (pgData?.groups ?? []).filter((g) => g.isActive)

  const { data: tcData } = useSWR<{ categories: { id: string; name: string; isActive: boolean }[] }>(
    '/api/settings/trade-commodities',
    fetcher
  )
  const commodityOptions = tcData?.categories?.filter((c) => c.isActive).map((c) => c.name) ?? []

  // Fetch loan summary for sidebar (only for account customers)
  const { data: loanData } = useSWR<{ summary: { outstanding: string } }>(
    customer?.customerType === 'account' ? `/api/customers/${id}/loans` : null,
    fetcher
  )
  const loanOutstanding = loanData?.summary?.outstanding ?? '0'

  const fmtDateInput = (v?: string | null) => {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().split('T')[0]
  }

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<UpdateCustomerFormInput, unknown, UpdateCustomerInput>({
    resolver: zodResolver(UpdateCustomerSchema),
    values: customer ? {
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
    } : undefined,
  })

  const tradeCommodities = (watch('tradeCommodities') as string[] | undefined) ?? []

  async function onSubmit(data: UpdateCustomerInput) {
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

  const fullName    = `${customer.firstName} ${customer.lastName}`
  const fmtDate     = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-ZA') : '—'

  return (
    <PortalPage title={fullName}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#F5F5F5' }}>
      {/* ── Sub-header ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Btn size="sm" icon={ArrowLeft} onClick={() => router.back()}>Customers</Btn>
          <span style={{ fontSize: 11, color: '#6C757D' }}>{customer.customerType === 'account' ? 'Account Customer' : 'Casual Customer'}</span>
          {customer.accountCode && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: NAVY, background: '#E8EFF8', border: '1px solid #B0C4DE', borderRadius: 2, padding: '1px 6px' }}>
              {customer.accountCode}
            </span>
          )}
          {customer.idNumber && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6C757D' }}>·  {customer.idNumber}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {!isEditing ? (
            <Btn size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>Edit</Btn>
          ) : (
            <>
              <Btn size="sm" onClick={handleCancel} disabled={saving}>Cancel</Btn>
              <Btn variant="primary" size="sm" icon={Save} loading={saving} onClick={handleSubmit(onSubmit)}>
                {saving ? 'Saving...' : 'Save'}
              </Btn>
            </>
          )}
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
      <TabStrip
        tabs={(customer.customerType === 'account'
          ? TABS_ACCOUNT.filter((t) => t !== 'Business Loan' || customer.dealerCategory === 'dealer_3')
          : TABS_CASUAL
        ).map((t) => ({ value: t, label: t }))}
        active={tab}
        onChange={setTab}
        style={{ padding: '8px 10px 0', background: '#F5F5F5' }}
      />

      {/* ── Two-column layout: main content + sidebar ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minHeight: 0, overflowY: 'auto' }}>

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
                      <span style={lbl}>Date of Birth</span>
                      <input {...register('dateOfBirth')} type="date" disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div>
                      <span style={lbl}>Gender</span>
                      <select {...register('gender')} disabled={!isEditing || saving} style={isEditing ? selectStyle : selectDisabled}>
                        <option value="">—</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <span style={lbl}>Nationality</span>
                      <input {...register('nationality')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div>
                      <span style={lbl}>Phone (Mobile)</span>
                      <input {...register('phone')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                      {errors.phone && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.phone.message}</span>}
                    </div>
                    <div>
                      <span style={lbl}>Landline</span>
                      <input {...register('landline')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <span style={lbl}>Email</span>
                      <input {...register('email')} type="email" disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={lbl}>Physical Address</span>
                      <input {...register('physicalAddress')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={lbl}>Postal Address</span>
                      <input {...register('postalAddress')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section Content - Business */}
              {sectionTab === 'Business' && (
                <div>
                  <SHdr title="Business Details" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <div>
                      <span style={lbl}>Customer Type</span>
                      <select {...register('customerType')} disabled={!isEditing || saving} style={isEditing ? selectStyle : selectDisabled}>
                        <option value="casual">Casual</option>
                        <option value="account">Account</option>
                      </select>
                    </div>
                    <div>
                      <span style={lbl}>Primary Function</span>
                      <select {...register('primaryFunction')} disabled={!isEditing || saving} style={isEditing ? selectStyle : selectDisabled}>
                        <option value="supplier">Supplier (sells to us)</option>
                        <option value="customer">Customer (buys from us)</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                    <div>
                      <span style={lbl}>Market Sector</span>
                      <select value={watch('marketSector') ?? ''} onChange={(e) => setValue('marketSector', e.target.value === '' ? undefined : e.target.value as 'formal' | 'informal')} disabled={!isEditing || saving} style={isEditing ? selectStyle : selectDisabled}>
                        <option value="">—</option>
                        <option value="formal">Formal (scrap yard)</option>
                        <option value="informal">Informal (street seller)</option>
                      </select>
                    </div>
                    <div>
                      <span style={lbl}>Dealer Category{!isAdmin ? ' (admin only)' : ''}</span>
                      <select value={watch('dealerCategory') ?? ''} onChange={(e) => setValue('dealerCategory', e.target.value === '' ? undefined : e.target.value as 'casual' | 'dealer_1' | 'dealer_2' | 'dealer_3')} disabled={!isEditing || saving || !isAdmin} style={isEditing && isAdmin ? selectStyle : selectDisabled}>
                        <option value="">—</option>
                        <option value="casual">Casual</option>
                        <option value="dealer_1">Dealer 1</option>
                        <option value="dealer_2">Dealer 2</option>
                        <option value="dealer_3">Dealer 3</option>
                      </select>
                    </div>
                    <div>
                      <span style={lbl}>VAT Status</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26 }}>
                        <input type="checkbox" checked={!(watch('zeroRated') ?? false)} onChange={(e) => setValue('zeroRated', !e.target.checked)} disabled={!isEditing || saving} style={{ width: 14, height: 14, cursor: isEditing ? 'pointer' : 'default' }} />
                        <span style={{ fontSize: 12, color: '#212529' }}>Apply VAT</span>
                      </div>
                    </div>
                    <div>
                      <span style={lbl}>Price Group</span>
                      <select value={watch('priceGroupId') ?? ''} onChange={(e) => setValue('priceGroupId', e.target.value === '' ? undefined : e.target.value)} disabled={!isEditing || saving} style={isEditing ? selectStyle : selectDisabled}>
                        <option value="">—</option>
                        {priceGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <span style={lbl}>Company Name</span>
                      <input {...register('companyName')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div>
                      <span style={lbl}>Company Reg No</span>
                      <input {...register('companyRegNumber')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <span style={lbl}>Contact Person</span>
                      <input {...register('contactPerson')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div>
                      <span style={lbl}>VAT Number</span>
                      <input {...register('vatNumber')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                      {errors.vatNumber && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.vatNumber.message}</span>}
                    </div>
                    <div>
                      <span style={lbl}>Trade Commodities</span>
                      <TradeCommoditiesSelect
                        options={commodityOptions}
                        value={tradeCommodities}
                        onChange={(next) => setValue('tradeCommodities', next)}
                        disabled={!isEditing || saving}
                      />
                    </div>
                    <div>
                      <span style={lbl}>Credit Limit (R)</span>
                      <input {...register('creditLimit')} type="number" step="0.01" min="0" disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section Content - Banking */}
              {sectionTab === 'Banking' && (
                <div>
                  <SHdr title="Banking Details" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <div>
                      <span style={lbl}>Bank Name</span>
                      <input {...register('bankName')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} placeholder={isEditing ? 'e.g. ABSA, FNB, Standard Bank' : ''} />
                    </div>
                    <div>
                      <span style={lbl}>Account Number</span>
                      <input {...register('bankAccountNo')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <span style={lbl}>Branch Code</span>
                      <input {...register('bankBranchCode')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} placeholder={isEditing ? '6-digit code' : ''} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section Content - Compliance */}
              {sectionTab === 'Compliance' && (
                <div>
                  <SHdr title="Compliance" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                    <div>
                      <span style={lbl}>Police Register No.</span>
                      <input {...register('policeRegisterNo')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <span style={lbl}>License Number</span>
                      <input {...register('licenseNumber')} disabled={!isEditing || saving} style={{ ...(isEditing ? inp : inpDisabled), fontFamily: 'monospace' }} />
                    </div>
                    <div>
                      <span style={lbl}>License Expiry</span>
                      <input {...register('licenseExpiry')} type="date" disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                    </div>
                    <div>
                      <span style={lbl}>Registered</span>
                      <input value={fmtDate(customer.createdAt)} disabled style={inpDisabled} />
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
          {tab === 'Loans' && customer.customerType === 'account' && (
            <LoansTab
              customerId={id}
              customerName={fullName}
              userRole={session?.user?.role ?? ''}
              userAllowedModules={(session?.user as { allowedModules?: string[] })?.allowedModules ?? []}
            />
          )}
          {tab === 'Business Loan' && customer.customerType === 'account' && customer.dealerCategory === 'dealer_3' && (
            <BusinessLoanTab
              customerId={id}
              customerName={fullName}
              userRole={session?.user?.role ?? ''}
            />
          )}
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
                bg={customer.blacklisted ? colors.dangerBg : colors.actionBg}
                color={customer.blacklisted ? colors.danger : colors.action}
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
            {customer.customerType === 'account' && parseFloat(loanOutstanding) > 0 && (
              <div>
                <span style={lbl}>Loan Balance</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: '#D97706' }}>
                  R {parseFloat(loanOutstanding).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <SHdr title="Actions" />
          <div style={{ padding: '8px 10px' }}>
            <Btn
              size="sm"
              icon={customer.blacklisted ? ShieldCheck : ShieldBan}
              variant={customer.blacklisted ? 'secondary' : 'danger'}
              onClick={() => setTab('Blacklist')}
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              {customer.blacklisted ? 'Remove Blacklist' : 'Blacklist'}
            </Btn>
          </div>
        </div>
      </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      {blacklistOpen && (
        <BlacklistModal
          customerId={id}
          onClose={() => setBlacklistOpen(false)}
          onSuccess={() => { mutate(`/api/customers/${id}`); setBlacklistOpen(false) }}
        />
      )}
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
          <label style={{ display: 'inline-block', cursor: uploading ? 'not-allowed' : 'pointer' }}>
            <span style={{ pointerEvents: 'none' }}>
              <Btn size="sm" loading={uploading}>{uploading ? 'Uploading…' : '+ Upload Document'}</Btn>
            </span>
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
            <Btn icon={ShieldCheck} onClick={onUnblacklist}>Remove from Blacklist</Btn>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#6C757D', marginBottom: 10 }}>This customer is not blacklisted.</p>
            <Btn variant="danger" icon={ShieldBan} onClick={onAction}>Blacklist Customer</Btn>
          </>
        )}
      </div>
    </div>
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
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Blacklist Customer" onClose={onClose} />
        <form onSubmit={handleSubmit(onSubmit)}>
          <RpxDialogBody>
            <span style={lbl}>Reason (min 10 chars)</span>
            <input {...register('reason')} style={inp} placeholder="Reason for blacklisting..." disabled={loading} />
            {errors.reason && <p style={{ fontSize: 10, color: '#DC2626', marginTop: 3 }}>{errors.reason.message}</p>}
          </RpxDialogBody>
          <RpxDialogFooter>
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn variant="danger" type="submit" loading={loading}>
              {loading ? 'Blacklisting...' : 'Blacklist Customer'}
            </Btn>
          </RpxDialogFooter>
        </form>
      </RpxDialogContent>
    </Dialog>
  )
}
