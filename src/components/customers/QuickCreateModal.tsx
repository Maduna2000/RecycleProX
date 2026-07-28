'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { QuickCreateSchema, type QuickCreateInput } from '@/lib/schemas/customer'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { validateSaId } from '@/lib/utils/saId'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string | null
  phone: string; customerType: string; blacklisted: boolean
}

interface Props {
  open: boolean
  prefillQuery?: string
  onClose: () => void
  onSuccess: (customer: Customer) => void
}

export function QuickCreateModal({ open, prefillQuery, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<QuickCreateInput>({
    resolver: zodResolver(QuickCreateSchema),
  })

  const idNumber = watch('idNumber') ?? ''
  const idValidation = idNumber.length >= 5 ? validateSaId(idNumber) : null

  useEffect(() => {
    if (prefillQuery && /^\d+$/.test(prefillQuery)) {
      setValue('idNumber', prefillQuery)
    }
  }, [prefillQuery, setValue])

  async function onSubmit(data: QuickCreateInput) {
    setLoading(true)
    const res = await fetch('/api/customers/quick-create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setLoading(false)
    if (res.ok) {
      const customer = await res.json()
      toast.success('Customer created')
      reset()
      onSuccess(customer)
    } else {
      const json = await res.json()
      toast.error(json.error ?? 'Failed to create customer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <RpxDialogContent maxWidth={440}>
        <RpxDialogHeader title="Quick Create Customer" onClose={onClose} />
        <RpxDialogBody>
        <form id="quick-create-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>National ID Number</Label>
            <Input {...register('idNumber')} className="mt-1" placeholder="National ID" disabled={loading} />
            {idNumber.length >= 5 && idValidation && !idValidation.valid && (
              <p className="text-xs mt-1 text-red-600">✗ {idValidation.error}</p>
            )}
            {errors.idNumber && <p className="text-xs text-red-600 mt-1">{errors.idNumber.message}</p>}
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
          <div>
            <Label>Phone</Label>
            <Input {...register('phone')} className="mt-1" placeholder="76 123 456" disabled={loading} />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
          </div>
        </form>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="quick-create-form" loading={loading}>
            {loading ? 'Creating...' : 'Quick Create'}
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
