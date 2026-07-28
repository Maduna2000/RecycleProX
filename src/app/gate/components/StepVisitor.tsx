'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertCircle, CheckCircle2, History, IdCard } from 'lucide-react'

const VisitorSchema = z.object({
  idNumber:  z.string().min(1, 'Required'),
  firstName: z.string().min(1, 'Required'),
  lastName:  z.string().min(1, 'Required'),
  phone:     z.string().optional(),
})
type VisitorForm = z.infer<typeof VisitorSchema>

export interface VisitorInfo {
  firstName:       string
  lastName:        string
  idNumber:        string
  phone?:          string
  /** Matched an existing account-type Customer by exact ID number — see handleIdLookup. */
  isAccountHolder?: boolean
}

interface Props {
  onNext: (visitor: VisitorInfo) => void
}

const inputClass = 'w-full border border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow'

// customerId is deliberately never surfaced here — the server always
// re-derives it from visitorIdNumber at creation time (see gateService.ts),
// so this screen only needs to show the guard what it found, not decide
// anything security-relevant itself.
export default function StepVisitor({ onNext }: Props) {
  const form = useForm<VisitorForm>({ resolver: zodResolver(VisitorSchema) })
  const [lookingUp, setLookingUp] = useState(false)
  const [matched, setMatched] = useState<{ firstName: string; lastName: string } | null>(null)
  const [isAccountHolder, setIsAccountHolder] = useState(false)
  const [blacklistError, setBlacklistError] = useState<string | null>(null)
  const [repeatInfo, setRepeatInfo] = useState<{ count: number; lastVisitAt: string | null } | null>(null)
  const lastLookedUp = useRef<string>('')

  async function handleIdLookup(idNumber: string) {
    const trimmed = idNumber.trim()
    if (trimmed.length < 4 || trimmed === lastLookedUp.current) return
    lastLookedUp.current = trimmed

    setLookingUp(true)
    setBlacklistError(null)
    setMatched(null)
    setIsAccountHolder(false)
    setRepeatInfo(null)

    try {
      const [customerRes, repeatRes] = await Promise.all([
        fetch(`/api/customers/lookup?idNumber=${encodeURIComponent(trimmed)}`),
        fetch(`/api/gate/repeat-visit?idNumber=${encodeURIComponent(trimmed)}`),
      ])

      if (customerRes.ok) {
        const customer = await customerRes.json()
        if (customer) {
          if (customer.blacklisted) {
            setBlacklistError(`This visitor is blacklisted: ${customer.blacklistReason || 'No reason provided'} — entry cannot be registered.`)
          } else {
            form.setValue('firstName', customer.firstName, { shouldValidate: true })
            form.setValue('lastName', customer.lastName, { shouldValidate: true })
            form.setValue('phone', customer.phone || '')
            setMatched({ firstName: customer.firstName, lastName: customer.lastName })
            setIsAccountHolder(customer.customerType === 'account')
          }
        }
      }

      if (repeatRes.ok) {
        const info = await repeatRes.json()
        if (info.count > 0) setRepeatInfo(info)
      }
    } catch {
      // Lookup failure shouldn't block manual entry — the server re-checks
      // blacklist status authoritatively at submit time regardless.
    } finally {
      setLookingUp(false)
    }
  }

  function handleSubmit(data: VisitorForm) {
    if (blacklistError) return
    onNext({ firstName: data.firstName, lastName: data.lastName, idNumber: data.idNumber, phone: data.phone, isAccountHolder })
  }

  return (
    <div className="flex-1 flex flex-col p-5 sm:p-8 max-w-lg sm:max-w-xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <IdCard className="w-5 h-5 text-blue-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Who&apos;s entering?</h2>
      </div>
      <p className="text-slate-500 mb-6 sm:mb-7">Enter the visitor&apos;s National ID / Passport number</p>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">National ID / Passport *</label>
          <div className="relative">
            <input
              {...form.register('idNumber', { onBlur: (e) => handleIdLookup(e.target.value) })}
              autoComplete="off"
              className={inputClass}
              placeholder="e.g. 9001015800086"
            />
            {lookingUp && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 animate-spin" />
            )}
          </div>
          {form.formState.errors.idNumber && (
            <p className="text-red-500 text-xs mt-1">{form.formState.errors.idNumber.message}</p>
          )}
          {matched && (
            <p className="text-emerald-700 text-xs font-medium mt-1.5 flex items-center gap-1.5 bg-emerald-50 rounded-lg px-2.5 py-1.5 w-fit">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Registered customer: {matched.firstName} {matched.lastName}
              {isAccountHolder && ' — photo capture will be skipped'}
            </p>
          )}
        </div>

        {blacklistError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">
            <p className="text-red-700 text-sm font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {blacklistError}
            </p>
          </div>
        )}

        {repeatInfo && !blacklistError && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3">
            <p className="text-blue-700 text-sm flex items-center gap-2">
              <History className="w-4 h-4 shrink-0" />
              Visited {repeatInfo.count} time{repeatInfo.count !== 1 ? 's' : ''} before
              {repeatInfo.lastVisitAt && `, last on ${new Date(repeatInfo.lastVisitAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">First Name *</label>
            <input
              {...form.register('firstName')}
              autoComplete="given-name"
              className={inputClass}
              placeholder="John"
            />
            {form.formState.errors.firstName && (
              <p className="text-red-500 text-xs mt-1">{form.formState.errors.firstName.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Last Name *</label>
            <input
              {...form.register('lastName')}
              autoComplete="family-name"
              className={inputClass}
              placeholder="Smith"
            />
            {form.formState.errors.lastName && (
              <p className="text-red-500 text-xs mt-1">{form.formState.errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">Phone Number</label>
          <input
            {...form.register('phone')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
            placeholder="76123456"
          />
        </div>

        <button
          type="submit"
          disabled={!!blacklistError}
          className="mt-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-lg font-semibold h-14 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
        >
          Continue →
        </button>
      </form>
    </div>
  )
}
