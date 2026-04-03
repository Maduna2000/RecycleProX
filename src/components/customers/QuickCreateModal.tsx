'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { QuickCreateSchema, type QuickCreateInput } from '@/lib/schemas/customer'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { validateSaId } from '@/lib/utils/saId'

type Customer = {
  id: string; firstName: string; lastName: string; idNumber: string
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

  const idNumber = watch('idNumber', '')
  const idValidation = idNumber.length === 13 ? validateSaId(idNumber) : null

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Quick Create Customer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div>
            <Label>SA ID Number</Label>
            <Input {...register('idNumber')} className="mt-1" placeholder="13-digit ID number" disabled={loading} />
            {idNumber.length === 13 && idValidation && (
              <p className={`text-xs mt-1 ${idValidation.valid ? 'text-green-600' : 'text-red-600'}`}>
                {idValidation.valid
                  ? `✓ Valid — ${idValidation.gender}, born ${idValidation.dateOfBirth?.toLocaleDateString('en-ZA')}`
                  : `✗ ${idValidation.error}`}
              </p>
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
            <Input {...register('phone')} className="mt-1" placeholder="071 234 5678" disabled={loading} />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
          </div>
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
