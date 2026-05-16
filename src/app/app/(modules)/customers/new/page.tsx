'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { CreateCustomerSchema, type CreateCustomerFormInput, type CreateCustomerInput } from '@/lib/schemas/customer'
import { colors } from '@/lib/design-tokens'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const COMMODITY_OPTIONS = [
  'Copper', 'Aluminium', 'Steel (Ferrous)', 'Non-Ferrous Metals',
  'Stainless Steel', 'Lead', 'Brass', 'Iron', 'E-Waste (Electronics)',
  'Plastic', 'Paper / Cardboard', 'Catalytic Converters', 'Batteries', 'Other',
]

// ─── Label + field helper ──────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <label className="text-[11px] font-semibold" style={{ color: '#374151' }}>{label}</label>
      {children}
      {error && <span className="text-[10px]" style={{ color: colors.danger }}>{error}</span>}
    </div>
  )
}

// ─── Windows-style panel section heading ──────────────────────────────────────
function SectionHead({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#1B3A6B' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: '#C0C0C0' }} />
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function NewAccountPage() {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)
  const [dupLink, setDupLink] = useState<string | null>(null)

  const { data: pgData } = useSWR<{ priceGroups: { id: string; name: string }[] }>('/api/price-groups', fetcher)
  const priceGroups = pgData?.priceGroups ?? []

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateCustomerFormInput, unknown, CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerSchema),
    defaultValues: {
      customerType:     'account',
      primaryFunction:  'supplier',
      tradeCommodities: [],
      zeroRated:        false,
    },
  })

  const tradeCommodities = (watch('tradeCommodities') as string[] | undefined) ?? []
  const dealerCategory   = watch('dealerCategory')
  const marketSector     = watch('marketSector')
  const zeroRated        = watch('zeroRated') ?? false

  function toggleCommodity(val: string) {
    if (tradeCommodities.includes(val)) {
      setValue('tradeCommodities', tradeCommodities.filter((c) => c !== val))
    } else {
      setValue('tradeCommodities', [...tradeCommodities, val])
    }
  }

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
      router.push('/app/customers')
    } finally {
      setLoading(false)
    }
  }

  // Shared input style
  const inputCls = "w-full px-2 py-1 text-[12px] border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7]"
  const inputStyle = { borderColor: '#ABABAB', color: '#212529', boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.10)' }
  const selectCls = "w-full px-2 py-1 text-[12px] border rounded-[2px] bg-white focus:outline-none focus:border-[#0078D7] cursor-pointer"

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Panel ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 bg-white border" style={{ borderColor: '#B0B0B0', borderRadius: 2 }}>

        {/* Panel title bar */}
        <div className="shrink-0 px-3 py-1.5 flex items-center justify-between border-b" style={{ borderColor: '#C0C0C0', background: 'linear-gradient(180deg,#EAEAEA 0%,#D4D4D4 100%)' }}>
          <span className="text-[12px] font-bold" style={{ color: '#1B3A6B' }}>Customer / Vendor Details</span>
          {dupLink && (
            <button
              type="button"
              className="text-[11px] underline"
              style={{ color: '#185ABD' }}
              onClick={() => router.push(`/app/customers/${dupLink}`)}
            >
              Duplicate ID — view existing →
            </button>
          )}
        </div>

        {/* ── 2-column form body ─── */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 min-h-0 overflow-auto">
          <div className="flex flex-1 p-4 gap-6 items-start">

            {/* ──── LEFT COLUMN (60%) ──────────────────────────── */}
            <div className="flex-[3] min-w-0 space-y-0">

              <SectionHead label="Identity" />

              <div className="grid grid-cols-2 gap-x-3">
                <Field label="First Name *" error={errors.firstName?.message}>
                  <input {...register('firstName')} className={inputCls} style={inputStyle} disabled={loading} />
                </Field>
                <Field label="Last Name (Surname) *" error={errors.lastName?.message}>
                  <input {...register('lastName')} className={inputCls} style={inputStyle} disabled={loading} />
                </Field>
              </div>

              <Field label="ID Number (13 digits) *" error={errors.idNumber?.message}>
                <input {...register('idNumber')} className={inputCls} style={inputStyle} placeholder="e.g. 9001015800086" disabled={loading} />
              </Field>

              <div className="grid grid-cols-3 gap-x-3">
                <Field label="Date of Birth">
                  <input {...register('dateOfBirth')} type="date" className={inputCls} style={inputStyle} disabled={loading} />
                </Field>
                <Field label="Gender">
                  <select {...register('gender')} className={selectCls} style={inputStyle} disabled={loading}>
                    <option value="">— Select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Nationality">
                  <input {...register('nationality')} className={inputCls} style={inputStyle} placeholder="e.g. South African" disabled={loading} />
                </Field>
              </div>

              <SectionHead label="Contact" />

              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Cell Number *" error={errors.phone?.message}>
                  <input {...register('phone')} className={inputCls} style={inputStyle} placeholder="+268XXXXXXXX" disabled={loading} />
                </Field>
                <Field label="Tel Number (Landline)">
                  <input {...register('landline')} className={inputCls} style={inputStyle} disabled={loading} />
                </Field>
              </div>

              <Field label="E-Mail" error={errors.email?.message}>
                <input {...register('email')} type="email" className={inputCls} style={inputStyle} disabled={loading} />
              </Field>

              <SectionHead label="Company / Business" />

              <Field label="Company / Vendor Name">
                <input {...register('companyName')} className={inputCls} style={inputStyle} disabled={loading} />
              </Field>

              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Company Reg No">
                  <input {...register('companyRegNumber')} className={inputCls} style={inputStyle} disabled={loading} />
                </Field>
                <Field label="VAT No" error={errors.vatNumber?.message}>
                  <input {...register('vatNumber')} className={inputCls} style={inputStyle} placeholder="7–15 digits" disabled={loading} />
                </Field>
              </div>

              <Field label="Police Reg No">
                <input {...register('policeRegisterNo')} className={inputCls} style={inputStyle} disabled={loading} />
              </Field>

              <SectionHead label="Classification" />

              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Default Pricing Group">
                  <select
                    className={selectCls}
                    style={inputStyle}
                    disabled={loading}
                    onChange={(e) => setValue('priceGroupId', e.target.value || undefined)}
                    defaultValue=""
                  >
                    <option value="">— None —</option>
                    {priceGroups.map((pg) => (
                      <option key={pg.id} value={pg.id}>{pg.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Primary Function">
                  <select {...register('primaryFunction')} className={selectCls} style={inputStyle} disabled={loading}>
                    <option value="supplier">Supplier (sells to us)</option>
                    <option value="customer">Customer (buys from us)</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
              </div>

              <div className="flex items-center gap-4 py-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px]" style={{ color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={zeroRated}
                    onChange={(e) => setValue('zeroRated', e.target.checked)}
                    className="w-3.5 h-3.5"
                    disabled={loading}
                  />
                  Zero Rated VAT
                </label>
              </div>

              <SectionHead label="Banking" />
              <div className="grid grid-cols-3 gap-x-3">
                <Field label="Bank Name">
                  <input {...register('bankName')} className={inputCls} style={inputStyle} placeholder="e.g. FNB, ABSA" disabled={loading} />
                </Field>
                <Field label="Account Number">
                  <input {...register('bankAccountNo')} className={inputCls} style={inputStyle} disabled={loading} />
                </Field>
                <Field label="Branch Code">
                  <input {...register('bankBranchCode')} className={inputCls} style={inputStyle} placeholder="6 digits" disabled={loading} />
                </Field>
              </div>

            </div>

            {/* ──── RIGHT COLUMN (40%) ─────────────────────────── */}
            <div className="flex-[2] min-w-0 space-y-0">

              <SectionHead label="Market Sector" />
              <div className="flex gap-4 mb-3 py-1">
                {(['formal', 'informal'] as const).map((s) => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer text-[12px]" style={{ color: '#374151' }}>
                    <input
                      type="radio"
                      name="marketSector"
                      checked={marketSector === s}
                      onChange={() => setValue('marketSector', s)}
                      className="w-3.5 h-3.5"
                      disabled={loading}
                    />
                    {s === 'formal' ? 'Formal' : 'Informal'}
                  </label>
                ))}
              </div>

              <Field label="Customer Category">
                <select
                  className={selectCls}
                  style={inputStyle}
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

              <SectionHead label="Trade Commodities" />
              <div className="space-y-1 mb-3">
                {COMMODITY_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer text-[11px] py-0.5" style={{ color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={tradeCommodities.includes(opt)}
                      onChange={() => toggleCommodity(opt)}
                      className="w-3.5 h-3.5"
                      disabled={loading}
                    />
                    {opt}
                  </label>
                ))}
              </div>

              <SectionHead label="Physical Address" />
              <Field label="Street / Area">
                <textarea
                  {...register('physicalAddress')}
                  rows={3}
                  className={inputCls}
                  style={{ ...inputStyle, resize: 'none' }}
                  disabled={loading}
                />
              </Field>

              <SectionHead label="Postal Address" />
              <Field label="PO Box / Postal">
                <textarea
                  {...register('postalAddress')}
                  rows={3}
                  className={inputCls}
                  style={{ ...inputStyle, resize: 'none' }}
                  disabled={loading}
                />
              </Field>

              <SectionHead label="Notes" />
              <Field label="Internal Notes">
                <textarea
                  {...register('customerNotes')}
                  rows={3}
                  className={inputCls}
                  style={{ ...inputStyle, resize: 'none' }}
                  disabled={loading}
                />
              </Field>

            </div>
          </div>
        </form>

        {/* ── Action bar ────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center gap-2 px-4 py-2 border-t"
          style={{ borderColor: '#B0B0B0', background: 'linear-gradient(180deg,#F5F5F5 0%,#E8E8E8 100%)' }}
        >
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={loading}
            className="h-7 px-5 rounded-sm text-[12px] font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: '#217346', border: '1px solid #176338' }}
          >
            {loading ? <><Loader2 className="w-3 h-3 animate-spin" />Saving…</> : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/app/customers')}
            disabled={loading}
            className="h-7 px-5 rounded-sm text-[12px] font-medium"
            style={{ background: '#FFFFFF', border: '1px solid #ABABAB', color: '#374151' }}
          >
            Cancel
          </button>
          <span className="ml-auto text-[10px]" style={{ color: colors.textSecondary }}>
            Account Code assigned automatically on save
          </span>
        </div>
      </div>
    </div>
  )
}
