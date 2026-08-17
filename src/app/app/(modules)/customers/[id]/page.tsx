'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Dialog } from '@/components/ui/dialog'
import { colors, badgeStyle } from '@/lib/design-tokens'
import { AlertTriangle, ShieldBan, ShieldCheck, Save, Pencil } from 'lucide-react'
import { LoansTab } from '@/components/customers/LoansTab'
import { BusinessLoanTab } from '@/components/customers/BusinessLoanTab'
import { TradeCommoditiesSelect } from '@/components/customers/TradeCommoditiesSelect'
import { TransactionsTab } from '@/components/customers/TransactionsTab'
import { DocumentsTab } from '@/components/customers/DocumentsTab'
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
import {
  inp, lbl, HEADER_GRAD, NAVY,
  Btn, TabStrip, PortalPage,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

const selectStyle = inp
const inpDisabled: React.CSSProperties = { ...inp, background: '#F5F5F5', color: '#6C757D', cursor: 'default' }
const selectDisabled = inpDisabled


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

// Flat, single-level tab row — Personal/Business/Banking/Compliance/Notes
// used to be a second, nested tab strip inside an "Overview" wrapper tab;
// now they're just the first five tabs alongside everything else, since
// "Overview" never rendered anything of its own beyond hosting them.
const TABS_ACCOUNT = ['Personal', 'Business', 'Banking', 'Compliance', 'Notes', 'Transactions', 'Loans', 'Business Loan', 'Documents', 'Blacklist'] as const
const TABS_CASUAL = ['Personal', 'Business', 'Banking', 'Compliance', 'Notes', 'Transactions', 'Documents', 'Blacklist'] as const

function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{title}</span>
    </div>
  )
}

// ─── Pill badge ────────────────────────────────────────────────────────────────
function Pill({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <span style={badgeStyle(color, bg)}>{text}</span>
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [tab, setTab] = useState<string>('Personal')
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
      idNumber: customer.idNumber,
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
    if (tab === 'Notes' && !customer?.customerNotes && !isEditing) {
      setTab('Personal')
    }
  }, [customer?.customerNotes, tab, isEditing])

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
    // Capped and centered like the Float page's own `max-w-3xl mx-auto`
    // content wrapper — passed as cardStyle so it's the actual ContentCard
    // (with its real border/radius) that shrinks, instead of drawing a
    // second, separate border around an inner div. No top border/radius —
    // PageTitleBar (also capped to 960px on this route) already draws the
    // top edge and its own bottom border serves as the seam between the
    // two, so this box continues seamlessly below it rather than doubling
    // the border line.
    <PortalPage
      title={fullName}
      cardStyle={{ maxWidth: 960, margin: '0 auto', width: '100%', borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#fff' }}>
      {/* ── Sub-header ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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

      {/* ── Tab strip + Edit/Save controls (same row) ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 10px 0', background: '#F5F5F5' }}>
        <TabStrip
          tabs={(customer.customerType === 'account'
            ? TABS_ACCOUNT.filter((t) => t !== 'Business Loan' || customer.dealerCategory === 'dealer_3')
            : TABS_CASUAL
          )
            .filter((t) => t !== 'Notes' || customer.customerNotes || isEditing)
            .map((t) => ({ value: t, label: t }))}
          active={tab}
          onChange={setTab}
        />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 5, flexShrink: 0 }}>
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

      {/* ── Two-column layout: main content + sidebar ─────────────────────────── */}
      {/* Fills the capped 960px ContentCard from cardStyle above (760 content
          + 200 sidebar). alignItems: 'stretch' (the flex default, set
          explicitly here) so the main content and sidebar panels' own
          backgrounds always reach the full height of this row — with
          'flex-start' they were only as tall as their own content, leaving
          a visible seam of the page's own background below any short tab
          (e.g. Notes, Compliance) instead of one uniform panel down to the
          box's actual bottom edge. */}
      <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0, overflowY: 'auto' }}>

        {/* Main content — fixed width so every tab (Personal, Business,
            Loans, …) renders at the same, page-appropriate size instead of
            its fields/table stretching out to fill whatever's left. */}
        <div style={{ width: 760, flexShrink: 0, borderRight: '1px solid #D0D0D0', background: '#fff' }}>

          {/* Section Content - Personal */}
          {tab === 'Personal' && (
            <div>
              <SHdr title="Personal Details" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 16px', padding: '10px 12px' }}>
                <div>
                  <span style={lbl}>First Name <span style={{ color: colors.danger }}>*</span></span>
                  <input {...register('firstName')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                  {errors.firstName && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.firstName.message}</span>}
                </div>
                <div>
                  <span style={lbl}>Last Name <span style={{ color: colors.danger }}>*</span></span>
                  <input {...register('lastName')} disabled={!isEditing || saving} style={isEditing ? inp : inpDisabled} />
                  {errors.lastName && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.lastName.message}</span>}
                </div>
                <div>
                  <span style={lbl}>ID Number{!isManager ? ' (manager only)' : ''}</span>
                  <input
                    {...register('idNumber')}
                    disabled={!isEditing || saving || !isManager}
                    style={{ ...(isEditing && isManager ? inp : inpDisabled), fontFamily: 'monospace' }}
                  />
                  {errors.idNumber && <span style={{ fontSize: 10, color: '#DC2626' }}>{errors.idNumber.message}</span>}
                  {isEditing && isManager && (
                    <span style={{ fontSize: 10, color: colors.textMuted }}>Only change this to correct a data-entry mistake — it must stay the customer&apos;s real ID.</span>
                  )}
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
                  <span style={lbl}>Phone (Mobile) <span style={{ color: colors.danger }}>*</span></span>
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
          {tab === 'Business' && (
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
                <div style={{ gridColumn: 'span 2' }}>
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
          {tab === 'Banking' && (
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
          {tab === 'Compliance' && (
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
          {tab === 'Notes' && (
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
          {tab === 'Documents'    && <DocumentsTab customerId={id} />}
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
