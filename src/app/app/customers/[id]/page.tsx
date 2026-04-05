'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, ArrowLeft, ShieldBan, ShieldCheck, Pencil, Loader2, Camera } from 'lucide-react'
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
  phone: string; email?: string; physicalAddress?: string; postalAddress?: string
  vatNumber?: string; customerType: string; primaryFunction?: string
  companyName?: string; contactPerson?: string
  dateOfBirth?: string; gender?: string; nationality?: string
  bankName?: string; bankAccountNo?: string; bankBranchCode?: string
  creditLimit?: string
  policeRegisterNo?: string; licenseNumber?: string; licenseExpiry?: string
  tradeCommodities?: string[]; customerNotes?: string
  isActive: boolean; blacklisted: boolean; blacklistReason?: string; blacklistedAt?: string
  createdAt: string; priceGroupId?: string; idPhotoR2Key?: string
}

const TABS = ['Overview', 'Transactions', 'Documents', 'Blacklist'] as const

const COMMODITY_OPTIONS = [
  'Copper', 'Aluminium', 'Steel (Ferrous)', 'Non-Ferrous Metals',
  'Stainless Steel', 'Lead', 'Brass', 'Iron', 'E-Waste (Electronics)',
  'Plastic', 'Paper / Cardboard', 'Catalytic Converters', 'Batteries', 'Other',
]

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tab, setTab] = useState<typeof TABS[number]>('Overview')
  const [editOpen, setEditOpen] = useState(false)
  const [blacklistOpen, setBlacklistOpen] = useState(false)

  const { data: customer, isLoading } = useSWR<Customer>(`/api/customers/${id}`, fetcher)

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
  if (!customer) return <div className="flex items-center justify-center h-64 text-gray-400">Customer not found</div>

  const fullName = `${customer.firstName} ${customer.lastName}`

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>

      {/* Blacklist banner */}
      {customer.blacklisted && (
        <div className="mb-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800">Customer is Blacklisted</p>
            <p className="text-sm text-red-600 mt-0.5">{customer.blacklistReason}</p>
            {customer.blacklistedAt && (
              <p className="text-xs text-red-400 mt-1">Since {new Date(customer.blacklistedAt).toLocaleDateString('en-ZA')}</p>
            )}
          </div>
        </div>
      )}

      {/* Customer header card */}
      <div className="bg-white rounded-xl border p-6 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-lg">
              {customer.firstName.charAt(0)}{customer.lastName.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <p className="text-sm text-gray-500 font-mono">{customer.idNumber}</p>
              <p className="text-sm text-gray-500">{customer.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={customer.customerType === 'account' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}>
              {customer.customerType}
            </Badge>
            {customer.primaryFunction && (
              <Badge className="bg-purple-100 text-purple-700">{customer.primaryFunction}</Badge>
            )}
            {customer.blacklisted
              ? <Badge variant="destructive">Blacklisted</Badge>
              : <Badge className="bg-green-100 text-green-700">Active</Badge>}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && <OverviewTab customer={customer} />}
      {tab === 'Transactions' && <TransactionsTab customerId={id} />}
      {tab === 'Documents' && <DocumentsTab customer={customer} onPhotoSaved={() => mutate(`/api/customers/${id}`)} />}
      {tab === 'Blacklist' && (
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

      {/* Edit modal */}
      {editOpen && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setEditOpen(false)}
          onSuccess={() => { mutate(`/api/customers/${id}`); setEditOpen(false) }}
        />
      )}

      {/* Blacklist modal */}
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

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ customer }: { customer: Customer }) {
  const fmt = (v?: string | null) => v ?? '—'
  const fmtDate = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-ZA') : '—'
  const fmtMoney = (v?: string | null) => v ? `R ${parseFloat(v).toFixed(2)}` : '—'

  return (
    <div className="space-y-4">
      {/* Personal */}
      <Section title="Personal Details">
        <Field label="First Name" value={customer.firstName} />
        <Field label="Last Name" value={customer.lastName} />
        <Field label="ID Number" value={customer.idNumber} mono />
        <Field label="Date of Birth" value={fmtDate(customer.dateOfBirth)} />
        <Field label="Gender" value={fmt(customer.gender)} />
        <Field label="Nationality" value={fmt(customer.nationality)} />
        <Field label="Phone" value={customer.phone} />
        <Field label="Email" value={fmt(customer.email)} />
        <Field label="Physical Address" value={fmt(customer.physicalAddress)} />
        <Field label="Postal Address" value={fmt(customer.postalAddress)} />
      </Section>

      {/* Business */}
      <Section title="Business Details">
        <Field label="Customer Type" value={customer.customerType} />
        <Field label="Primary Function" value={fmt(customer.primaryFunction)} />
        <Field label="Company Name" value={fmt(customer.companyName)} />
        <Field label="Contact Person" value={fmt(customer.contactPerson)} />
        <Field label="VAT Number" value={fmt(customer.vatNumber)} />
        <Field label="Credit Limit" value={fmtMoney(customer.creditLimit)} />
        {customer.tradeCommodities && customer.tradeCommodities.length > 0 && (
          <div className="col-span-2">
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Trade Commodities</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {customer.tradeCommodities.map((c) => (
                <span key={c} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </dd>
          </div>
        )}
      </Section>

      {/* Banking */}
      <Section title="Banking Details">
        <Field label="Bank Name" value={fmt(customer.bankName)} />
        <Field label="Account Number" value={fmt(customer.bankAccountNo)} />
        <Field label="Branch Code" value={fmt(customer.bankBranchCode)} />
      </Section>

      {/* Compliance */}
      <Section title="Compliance">
        <Field label="Police Register No." value={fmt(customer.policeRegisterNo)} />
        <Field label="License Number" value={fmt(customer.licenseNumber)} />
        <Field label="License Expiry" value={fmtDate(customer.licenseExpiry)} />
        <Field label="Registered" value={new Date(customer.createdAt).toLocaleDateString('en-ZA')} />
      </Section>

      {/* Notes */}
      {customer.customerNotes && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.customerNotes}</p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3">{children}</dl>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className={`mt-1 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
function TransactionsTab({ customerId }: { customerId: string }) {
  const { data } = useSWR(`/api/customers/${customerId}/transactions`, fetcher)
  if (!data?.transactions?.length) {
    return <div className="bg-white rounded-xl border p-10 text-center text-gray-400">No transactions yet</div>
  }
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {['Date', 'Reference', 'Type', 'Amount', 'Status'].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {data.transactions.map((tx: { id: string; type: string; reference: string; date: string; amount: string; status: string }) => (
            <tr key={tx.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">{new Date(tx.date).toLocaleDateString('en-ZA')}</td>
              <td className="px-4 py-3 font-mono text-xs">{tx.reference}</td>
              <td className="px-4 py-3 capitalize">{tx.type}</td>
              <td className="px-4 py-3">R {tx.amount}</td>
              <td className="px-4 py-3 capitalize">{tx.status}</td>
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

  async function savePhotoKey(key: string) {
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idPhotoR2Key: key }),
    })
    if (res.ok) { onPhotoSaved() }
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

  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Camera className="w-4 h-4 text-green-600" />
        <h3 className="font-semibold text-gray-900">ID Document</h3>
      </div>

      {customer.idPhotoR2Key ? (
        <PhotoViewer
          r2Key={customer.idPhotoR2Key}
          alt={`${customer.firstName} ${customer.lastName} ID`}
          canDelete={isManager}
          onDelete={handlePhotoDeleted}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">No ID photo uploaded yet</p>
          <PhotoUploader
            context="customer_id"
            referenceId={customer.id}
            label="Upload ID Photo"
            onUploaded={savePhotoKey}
          />
        </div>
      )}
    </div>
  )
}

// ─── Blacklist Tab ────────────────────────────────────────────────────────────
function BlacklistTab({ customer, onAction, onUnblacklist }: { customer: Customer; onAction: () => void; onUnblacklist: () => void }) {
  return (
    <div className="bg-white rounded-xl border p-6">
      {customer.blacklisted ? (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="font-semibold text-red-800">Currently Blacklisted</p>
            <p className="text-sm text-red-600 mt-1">{customer.blacklistReason}</p>
            {customer.blacklistedAt && (
              <p className="text-xs text-red-400 mt-1">Since {new Date(customer.blacklistedAt).toLocaleDateString('en-ZA')}</p>
            )}
          </div>
          <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={onUnblacklist}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Remove from Blacklist
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">This customer is not blacklisted.</p>
          <Button variant="destructive" onClick={onAction}>
            <ShieldBan className="w-4 h-4 mr-2" /> Blacklist Customer
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
const EDIT_TABS = ['Personal', 'Business', 'Banking', 'Compliance'] as const

function EditCustomerModal({ customer, onClose, onSuccess }: { customer: Customer; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [editTab, setEditTab] = useState<typeof EDIT_TABS[number]>('Personal')

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
      contactPerson:    customer.contactPerson ?? '',
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>

        {/* Edit tabs */}
        <div className="flex gap-1 border-b -mx-1 mb-4">
          {EDIT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEditTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                editTab === t ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Personal */}
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
                <Label>Phone</Label>
                <Input {...register('phone')} className="mt-1" disabled={loading} />
                {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
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

          {/* Business */}
          {editTab === 'Business' && (
            <div className="space-y-3">
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
                <Label>Company Name</Label>
                <Input {...register('companyName')} className="mt-1" disabled={loading} />
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

          {/* Banking */}
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

          {/* Compliance */}
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
  const { register, handleSubmit, formState: { errors } } = useForm<BlacklistInput>({
    resolver: zodResolver(BlacklistSchema),
  })

  async function onSubmit(data: BlacklistInput) {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/blacklist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
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
