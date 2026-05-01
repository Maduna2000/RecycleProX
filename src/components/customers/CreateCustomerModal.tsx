'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import useSWR from 'swr'
import { CreateCustomerSchema, type CreateCustomerInput, type CreateCustomerFormInput } from '@/lib/schemas/customer'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { validateSaId } from '@/lib/utils/saId'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CreatedCustomerSummary = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; accountCode: string | null; priceGroupId: string | null
  blacklisted: boolean; zeroRated: boolean
}

export function CreateCustomerModal({ open, onClose, onSuccess, defaultType = 'casual' }: { open: boolean; onClose: () => void; onSuccess: (customer?: CreatedCustomerSummary) => void; defaultType?: 'account' | 'casual' }) {
  const [loading, setLoading] = useState(false)
  const [duplicate, setDuplicate] = useState<{ id: string } | null>(null)

  const { data: pgData } = useSWR<{ groups: { id: string; name: string; isActive: boolean }[] }>('/api/price-groups', fetcher)
  const priceGroups = (pgData?.groups ?? []).filter((g) => g.isActive)

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<CreateCustomerFormInput, unknown, CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerSchema),
    defaultValues: { customerType: defaultType },
  })

  const idNumber    = watch('idNumber', '')
  const customerType = watch('customerType', 'casual')
  const idValidation = idNumber && idNumber.length >= 5 ? validateSaId(idNumber) : null

  async function onSubmit(data: CreateCustomerInput) {
    setLoading(true)
    setDuplicate(null)
    const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setLoading(false)

    if (res.status === 409) {
      const json = await res.json()
      setDuplicate({ id: json.existingCustomerId })
      return
    }
    if (!res.ok) {
      const json = await res.json()
      toast.error(json.error ?? 'Failed to create customer')
      return
    }
    const created = await res.json() as CreatedCustomerSummary
    const codeMsg = created.accountCode ? ` — code: ${created.accountCode}` : ''
    toast.success(`Customer created${codeMsg}`)
    reset()
    onSuccess(created)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); setDuplicate(null); onClose() } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>

        {duplicate && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            A customer with this ID already exists.{' '}
            <Link href={`/app/customers/${duplicate.id}`} className="underline font-medium" onClick={onClose}>View existing record →</Link>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer Type</Label>
              <Select onValueChange={(v) => setValue('customerType', v as 'casual' | 'account')} defaultValue={defaultType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>National ID Number</Label>
              <Input {...register('idNumber')} className="mt-1" placeholder="National ID" disabled={loading} />
              {idNumber && idNumber.length >= 5 && idValidation && !idValidation.valid && (
                <p className="text-xs mt-1 text-red-600">✗ {idValidation.error}</p>
              )}
              {errors.idNumber && <p className="text-xs text-red-600 mt-1">{errors.idNumber.message}</p>}
            </div>
          </div>

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

          {customerType === 'account' && priceGroups.length > 0 && (
            <div>
              <Label>Price Group <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Select onValueChange={(v: string | null) => setValue('priceGroupId', v === null || v === 'none' ? undefined : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No price group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No price group</SelectItem>
                  {priceGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Phone (Mobile)</Label>
            <Input {...register('phone')} className="mt-1" placeholder="76 123 456" disabled={loading} />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
          </div>

          {customerType === 'account' && (
            <div>
              <Label>Landline <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input {...register('landline')} className="mt-1" placeholder="e.g. +268 2404 xxxx" disabled={loading} />
            </div>
          )}

          <div>
            <Label>Email <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input {...register('email')} type="email" className="mt-1" disabled={loading} />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <Label>Physical Address <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input {...register('physicalAddress')} className="mt-1" disabled={loading} />
          </div>

          {customerType === 'account' && (
            <div>
              <Label>Company Reg No <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input {...register('companyRegNumber')} className="mt-1" placeholder="e.g. 2021/123456/07" disabled={loading} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Create Customer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
