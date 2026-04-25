'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { CreateCustomerSchema, type CreateCustomerFormInput, type CreateCustomerInput } from '@/lib/schemas/customer'

const COMMODITY_OPTIONS = [
  'Copper', 'Aluminium', 'Steel (Ferrous)', 'Non-Ferrous Metals',
  'Stainless Steel', 'Lead', 'Brass', 'Iron', 'E-Waste (Electronics)',
  'Plastic', 'Paper / Cardboard', 'Catalytic Converters', 'Batteries', 'Other',
]

const DEALER_PRICE_GROUP_HINT: Record<string, string> = {
  dealer_1: 'Dealer 1', dealer_2: 'Dealer 2', dealer_3: 'Dealer 3',
}

function Section({
  title, emoji, optional = false, defaultOpen = false, children,
}: {
  title: string; emoji: string; optional?: boolean; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!optional) {
    return (
      <div className="bg-white rounded-xl border-2 border-blue-400 overflow-hidden">
        <div className="bg-blue-50 px-5 py-3 flex items-center gap-2">
          <span>{emoji}</span>
          <span className="font-semibold text-blue-800 text-sm">{title}</span>
          <span className="text-blue-500 text-xs font-normal ml-1">— required</span>
        </div>
        <div className="p-5">{children}</div>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-gray-50 px-5 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{emoji}</span>
          <span className="font-semibold text-gray-700 text-sm">{title}</span>
          <span className="text-gray-400 text-xs font-normal ml-1">— optional</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function NewAccountPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [dupLink, setDupLink] = useState<string | null>(null)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateCustomerFormInput, unknown, CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerSchema),
    defaultValues: {
      customerType:    'account',
      primaryFunction: 'supplier',
      tradeCommodities: [],
      zeroRated: false,
    },
  })

  const tradeCommodities = (watch('tradeCommodities') as string[] | undefined) ?? []
  const dealerCategory = watch('dealerCategory')
  const marketSector = watch('marketSector')

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
      const { id } = await res.json()
      toast.success('Account created successfully')
      router.push(`/app/customers/${id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/customers')} type="button">
            <ArrowLeft className="w-4 h-4 mr-1" /> Customers
          </Button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">New Account</span>
        </div>
        <Button
          type="button"
          className="bg-green-600 hover:bg-green-700"
          disabled={loading}
          onClick={handleSubmit(onSubmit)}
        >
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save Account'}
        </Button>
      </div>

      {dupLink && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <span className="font-semibold text-amber-800">Duplicate ID number. </span>
          <button
            type="button"
            className="text-blue-600 underline"
            onClick={() => router.push(`/app/customers/${dupLink}`)}
          >
            View existing customer →
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── REQUIRED ── */}
        <Section title="Required Details" emoji="★" defaultOpen>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>ID Number <span className="text-red-500">*</span></Label>
              <Input {...register('idNumber')} className="mt-1" placeholder="e.g. 9001015800086" disabled={loading} />
              {errors.idNumber && <p className="text-xs text-red-600 mt-1">{errors.idNumber.message}</p>}
            </div>
            <div>
              <Label>First Name <span className="text-red-500">*</span></Label>
              <Input {...register('firstName')} className="mt-1" disabled={loading} />
              {errors.firstName && <p className="text-xs text-red-600 mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <Label>Last Name <span className="text-red-500">*</span></Label>
              <Input {...register('lastName')} className="mt-1" disabled={loading} />
              {errors.lastName && <p className="text-xs text-red-600 mt-1">{errors.lastName.message}</p>}
            </div>
            <div className="col-span-2">
              <Label>Phone <span className="text-red-500">*</span></Label>
              <Input {...register('phone')} className="mt-1" placeholder="+268 or 8-digit local" disabled={loading} />
              {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
            </div>
            <div>
              <Label>Market Sector <span className="text-red-500">*</span></Label>
              <div className="flex gap-2 mt-1">
                {(['formal', 'informal'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setValue('marketSector', s)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                      marketSector === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {s === 'formal' ? 'Formal' : 'Informal'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Formal = registered scrap yard · Informal = street seller</p>
            </div>
            <div>
              <Label>Dealer Category</Label>
              <Select
                onValueChange={(v) => setValue('dealerCategory', v as 'casual' | 'dealer_1' | 'dealer_2' | 'dealer_3')}
                defaultValue=""
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="dealer_1">Dealer 1</SelectItem>
                  <SelectItem value="dealer_2">Dealer 2</SelectItem>
                  <SelectItem value="dealer_3">Dealer 3</SelectItem>
                </SelectContent>
              </Select>
              {dealerCategory && DEALER_PRICE_GROUP_HINT[dealerCategory] && (
                <p className="text-xs text-green-700 mt-1 font-medium">
                  → Will be assigned Price Group: {DEALER_PRICE_GROUP_HINT[dealerCategory]}
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── COMPANY DETAILS ── */}
        <Section title="Company Details" emoji="🏢" optional>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company Name</Label>
              <Input {...register('companyName')} className="mt-1" placeholder="e.g. xTimely Pty Ltd" disabled={loading} />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input {...register('contactPerson')} className="mt-1" placeholder="e.g. James Smith" disabled={loading} />
            </div>
            <div>
              <Label>VAT Number</Label>
              <Input {...register('vatNumber')} className="mt-1" placeholder="7–15 digits" disabled={loading} />
              {errors.vatNumber && <p className="text-xs text-red-600 mt-1">{errors.vatNumber.message}</p>}
            </div>
            <div>
              <Label>Email</Label>
              <Input {...register('email')} type="email" className="mt-1" disabled={loading} />
            </div>
          </div>
        </Section>

        {/* ── CLASSIFICATION & VAT ── */}
        <Section title="Classification & VAT" emoji="🏷️" optional>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <div>
                <p className="font-semibold text-yellow-800 text-sm">Zero-Rated VAT</p>
                <p className="text-xs text-yellow-700 mt-0.5">No VAT will be charged on this account&apos;s transactions</p>
              </div>
              <input
                type="checkbox"
                checked={watch('zeroRated') ?? false}
                onChange={(e) => setValue('zeroRated', e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-green-600 cursor-pointer"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Primary Function</Label>
                <Select onValueChange={(v) => setValue('primaryFunction', v as 'customer' | 'supplier' | 'both')} defaultValue="supplier">
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">Supplier (sells to us)</SelectItem>
                    <SelectItem value="customer">Customer (buys from us)</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Credit Limit (R)</Label>
                <Input {...register('creditLimit')} type="number" step="0.01" min="0" className="mt-1" placeholder="0.00" disabled={loading} />
              </div>
            </div>
          </div>
        </Section>

        {/* ── TRADE COMMODITIES ── */}
        <Section title="Trade Commodities" emoji="🪙" optional>
          <p className="text-xs text-gray-500 mb-3">Tick the materials this account trades in. Only those products will appear at the purchase screen.</p>
          <div className="grid grid-cols-2 gap-2">
            {COMMODITY_OPTIONS.map((opt) => (
              <label key={opt} className={`flex items-center gap-2 text-sm cursor-pointer px-3 py-2 rounded-lg border transition-colors ${
                tradeCommodities.includes(opt)
                  ? 'bg-green-50 border-green-300 text-green-800'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
              }`}>
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
        </Section>

        {/* ── BANKING ── */}
        <Section title="Banking Details" emoji="🏦" optional>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Bank Name</Label>
              <Input {...register('bankName')} className="mt-1" placeholder="e.g. FNB, ABSA" disabled={loading} />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input {...register('bankAccountNo')} className="mt-1" disabled={loading} />
            </div>
            <div>
              <Label>Branch Code</Label>
              <Input {...register('bankBranchCode')} className="mt-1" placeholder="6 digits" disabled={loading} />
            </div>
          </div>
        </Section>

        {/* ── DOCUMENTS (locked) ── */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 flex items-center gap-2">
            <span>📎</span>
            <span className="font-semibold text-gray-500 text-sm">Compliance Documents</span>
            <span className="text-gray-400 text-xs font-normal ml-1">— upload after saving</span>
          </div>
          <div className="p-5">
            <p className="text-sm text-gray-400">
              Save this account first, then upload trading licences, SARS certificates and other documents from the customer profile page.
            </p>
          </div>
        </div>

        {/* Save button (bottom) */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            className="bg-green-600 hover:bg-green-700 min-w-[140px]"
            disabled={loading}
          >
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save Account'}
          </Button>
        </div>

      </form>
    </div>
  )
}
