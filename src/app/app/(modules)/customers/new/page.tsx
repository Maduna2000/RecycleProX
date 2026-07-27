'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { CreateCustomerSchema, type CreateCustomerFormInput, type CreateCustomerInput } from '@/lib/schemas/customer'
import { TradeCommoditiesSelect } from '@/components/customers/TradeCommoditiesSelect'
import { colors } from '@/lib/design-tokens'
import { Btn, Field, inp, lbl, PortalPage, SectionLabel } from '@/components/rpx'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const TITLE_OPTIONS = ['—', 'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev', 'Other']

const readOnlyInp: React.CSSProperties = { ...inp, color: '#9CA3AF', background: '#F3F4F6', cursor: 'not-allowed' }

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewAccountPage() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const returnTo    = searchParams.get('returnTo')
  const [loading,      setLoading]      = useState(false)
  const [dupLink,      setDupLink]      = useState<string | null>(null)
  const [bankOpen,     setBankOpen]     = useState(false)

  const { data: pgData } = useSWR<{ priceGroups: { id: string; name: string }[] }>('/api/price-groups', fetcher)
  const priceGroups = pgData?.priceGroups ?? []

  const { data: tcData } = useSWR<{ categories: { id: string; name: string; isActive: boolean }[] }>(
    '/api/settings/trade-commodities',
    fetcher
  )
  const commodityOptions = tcData?.categories?.filter((c) => c.isActive).map((c) => c.name) ?? []

  const {
    register, handleSubmit, setValue, watch,
    formState: { errors },
  } = useForm<CreateCustomerFormInput, unknown, CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerSchema),
    defaultValues: {
      customerType:     'account',
      primaryFunction:  'supplier',
      tradeCommodities: [],
      zeroRated:        true,
      isActive:         true,
    },
  })

  const isActiveFalse   = watch('isActive') === false
  const tradeCommodities = (watch('tradeCommodities') as string[] | undefined) ?? []
  const dealerCategory  = watch('dealerCategory')
  const marketSector    = watch('marketSector')
  const zeroRated       = watch('zeroRated') ?? false

  async function onSubmit(data: CreateCustomerInput) {
    setLoading(true)
    setDupLink(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.status === 409) {
        const j = await res.json()
        setDupLink(j.existingCustomerId ?? null)
        toast.error('A customer with this ID number already exists')
        return
      }
      if (!res.ok) {
        const j = await res.json()
        toast.error(j.error ?? 'Failed to create account')
        return
      }
      toast.success('Account created successfully')
      router.push(returnTo ?? '/app/customers')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PortalPage title="Customer / Vendor Details">
      <div className="flex flex-col flex-1 min-h-0">

        {dupLink && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: colors.dangerBg, borderBottom: `1px solid ${colors.danger}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.danger }}>A customer with this ID number already exists</span>
            <Btn size="sm" variant="danger" onClick={() => router.push(`/app/customers/${dupLink}`)}>View existing record →</Btn>
          </div>
        )}

        {/* ── 2-column form ─────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 min-h-0 overflow-auto">
          <div className="flex flex-1 p-3 gap-4 items-start min-w-0">

            {/* ════ LEFT COLUMN (60%) ═══════════════════════════ */}
            <div className="flex-[3] min-w-0 space-y-1.5">

              {/* Customer/Vendor Name */}
              <Field label="Customer / Vendor Name">
                <input {...register('companyName')} style={inp} disabled={loading} />
              </Field>

              {/* Title · Surname · Initials · Code row */}
              <div className="grid gap-2" style={{ gridTemplateColumns: '80px 1fr 80px 80px' }}>
                <Field label="Title">
                  {/* UI-only — not submitted to API */}
                  <select style={inp} disabled={loading} defaultValue="">
                    {TITLE_OPTIONS.map((t) => (
                      <option key={t} value={t === '—' ? '' : t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Surname" required>
                  <input {...register('lastName')} style={inp} disabled={loading} />
                  {errors.lastName && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.lastName.message}</p>}
                </Field>
                <Field label="Initials" required>
                  <input {...register('firstName')} style={inp} disabled={loading} />
                  {errors.firstName && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.firstName.message}</p>}
                </Field>
                <Field label="Code">
                  <input readOnly value="" placeholder="Auto" style={readOnlyInp} />
                </Field>
              </div>

              {/* Inactive Indicator */}
              <div className="flex gap-6 py-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-[12px]" style={{ color: '#374151' }}>
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5"
                    checked={isActiveFalse}
                    onChange={(e) => setValue('isActive', !e.target.checked)}
                    disabled={loading}
                  />
                  <span style={lbl}>Inactive Indicator</span>
                </label>
              </div>

              {/* VAT Number · ID Number */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="VAT Number (10 Char)">
                  <input {...register('vatNumber')} style={inp} placeholder="7–15 digits" disabled={loading} />
                  {errors.vatNumber && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.vatNumber.message}</p>}
                </Field>
                <Field label="ID Number (13 Char)" required>
                  <input {...register('idNumber')} style={inp} placeholder="e.g. 9001015800086" disabled={loading} />
                  {errors.idNumber && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.idNumber.message}</p>}
                </Field>
              </div>

              {/* Default Pricing · Primary Function */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Default Pricing Category">
                  <select
                    style={inp}
                    disabled={loading}
                    defaultValue=""
                    onChange={(e) => setValue('priceGroupId', e.target.value || undefined)}
                  >
                    <option value="">— None —</option>
                    {priceGroups.map((pg) => (
                      <option key={pg.id} value={pg.id}>{pg.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Primary Function">
                  <select {...register('primaryFunction')} style={inp} disabled={loading}>
                    <option value="supplier">Supplier (sells to us)</option>
                    <option value="customer">Customer (buys from us)</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
              </div>

              {/* Tel Number */}
              <Field label="Tel Number">
                <input {...register('landline')} style={inp} disabled={loading} />
              </Field>

              {/* Cell Number */}
              <Field label="Cell Number" required>
                <input {...register('phone')} style={inp} placeholder="+268XXXXXXXX" disabled={loading} />
                {errors.phone && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.phone.message}</p>}
              </Field>

              {/* Company Reg No */}
              <Field label="Company Reg No (14 Char)">
                <input {...register('companyRegNumber')} style={inp} disabled={loading} />
              </Field>

              {/* E-Mail */}
              <Field label="E-Mail Address">
                <input {...register('email')} type="email" style={inp} disabled={loading} />
                {errors.email && <p style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>{errors.email.message}</p>}
              </Field>

              {/* Police Register No */}
              <Field label="Police Register No">
                <input {...register('policeRegisterNo')} style={inp} disabled={loading} />
              </Field>

              {/* Apply VAT (stored inverted as zeroRated) */}
              <div
                className="flex items-center gap-2 py-1.5 px-2 rounded-[2px] border mt-1"
                style={{ borderColor: '#F59E0B', background: zeroRated ? '#FFFBEB' : '#FAFAFA' }}
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5"
                  checked={!zeroRated}
                  onChange={(e) => setValue('zeroRated', !e.target.checked)}
                  disabled={loading}
                  id="applyVatCheck"
                />
                <label htmlFor="applyVatCheck" className="cursor-pointer text-[12px] font-bold" style={{ color: '#92400E' }}>
                  Apply VAT
                </label>
                {zeroRated && (
                  <span className="text-[10px] ml-1" style={{ color: '#78350F' }}>
                    No VAT charged on this account&apos;s transactions
                  </span>
                )}
              </div>

              {/* Trade Commodities — multi-select dropdown, right under VAT */}
              <Field label="Trade Commodities">
                <TradeCommoditiesSelect
                  options={commodityOptions}
                  value={tradeCommodities}
                  onChange={(next) => setValue('tradeCommodities', next)}
                  disabled={loading}
                />
              </Field>

              {/* Bank Details (collapsible) */}
              <div className="border rounded-[2px] mt-1" style={{ borderColor: '#C0C0C0' }}>
                <button
                  type="button"
                  onClick={() => setBankOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-left"
                  style={{ background: '#F5F5F5' }}
                >
                  <span style={lbl}>Bank Details</span>
                  {bankOpen
                    ? <ChevronDown className="w-3.5 h-3.5" style={{ color: '#6C757D' }} />
                    : <ChevronRight className="w-3.5 h-3.5" style={{ color: '#6C757D' }} />}
                </button>
                {bankOpen && (
                  <div className="p-2 grid grid-cols-3 gap-2">
                    <Field label="Bank Name">
                      <input {...register('bankName')} style={inp} placeholder="e.g. FNB, ABSA" disabled={loading} />
                    </Field>
                    <Field label="Account Number">
                      <input {...register('bankAccountNo')} style={inp} disabled={loading} />
                    </Field>
                    <Field label="Branch Code">
                      <input {...register('bankBranchCode')} style={inp} placeholder="6 digits" disabled={loading} />
                    </Field>
                  </div>
                )}
              </div>

              <SectionLabel text="Notes" />
              <Field label="Internal Notes">
                <textarea
                  {...register('customerNotes')}
                  rows={2}
                  style={{ ...inp, height: 'auto', padding: '6px 8px', resize: 'none' }}
                  disabled={loading}
                />
              </Field>

            </div>

            {/* ════ RIGHT COLUMN (40%) ══════════════════════════ */}
            <div className="flex-[2] min-w-0 space-y-1.5">

              {/* Market Sector — scrollable listbox */}
              <Field label="Market Sector">
                <div
                  className="border rounded-[2px] overflow-y-auto"
                  style={{ borderColor: '#ABABAB', height: 52, background: '#FFFFFF' }}
                >
                  {(['formal', 'informal'] as const).map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 px-2 py-1 cursor-pointer text-[12px]"
                      style={{
                        background: marketSector === s ? colors.borderFocus : 'transparent',
                        color: marketSector === s ? '#FFFFFF' : '#212529',
                      }}
                    >
                      <input
                        type="radio"
                        name="marketSector"
                        checked={marketSector === s}
                        onChange={() => setValue('marketSector', s)}
                        className="w-3 h-3"
                        disabled={loading}
                      />
                      {s === 'formal' ? 'Formal' : 'Informal'}
                    </label>
                  ))}
                </div>
              </Field>

              {/* Customer Category */}
              <Field label="Customer Category">
                <select
                  style={inp}
                  disabled={loading}
                  value={dealerCategory ?? ''}
                  onChange={(e) => setValue('dealerCategory', (e.target.value || undefined) as typeof dealerCategory)}
                >
                  <option value="">— Select —</option>
                  <option value="casual">Casual</option>
                  <option value="dealer_1">Dealer 1</option>
                  <option value="dealer_2">Dealer 2</option>
                  <option value="dealer_3">Dealer 3</option>
                </select>
              </Field>

              {/* Physical Address */}
              <Field label="Physical Address">
                <textarea
                  {...register('physicalAddress')}
                  rows={3}
                  style={{ ...inp, height: 'auto', padding: '6px 8px', resize: 'none' }}
                  disabled={loading}
                  placeholder="Street, Area, City"
                />
              </Field>

              {/* Postal Address */}
              <Field label="Postal Address">
                <textarea
                  {...register('postalAddress')}
                  rows={3}
                  style={{ ...inp, height: 'auto', padding: '6px 8px', resize: 'none' }}
                  disabled={loading}
                  placeholder="PO Box or postal address"
                />
              </Field>

              {/* Gender + DOB + Nationality (optional personal details) */}
              <SectionLabel text="Personal Details" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Gender">
                  <select {...register('gender')} style={inp} disabled={loading}>
                    <option value="">— Select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Date of Birth">
                  <input {...register('dateOfBirth')} type="date" style={inp} disabled={loading} />
                </Field>
              </div>
              <Field label="Nationality">
                <input {...register('nationality')} style={inp} placeholder="e.g. South African" disabled={loading} />
              </Field>

            </div>
          </div>
        </form>

        {/* ── Action bar ──────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center gap-3 px-4 py-2 border-t"
          style={{ borderColor: '#B0B0B0', background: 'linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)' }}
        >
          <Btn variant="primary" loading={loading} onClick={handleSubmit(onSubmit)}>Save</Btn>
          <Btn disabled={loading} onClick={() => router.push(returnTo ?? '/app/customers')}>Cancel</Btn>

          <div className="h-4 w-px mx-1" style={{ background: '#C0C0C0' }} />

          <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
            After saving: Special Prices · Loans · GRV&apos;s · Orders · View Docs available on the customer profile
          </span>
        </div>
      </div>
    </PortalPage>
  )
}
