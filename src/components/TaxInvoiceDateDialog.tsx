'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/dialog'
import { colors } from '@/lib/design-tokens'
import { fromSastInputValue, toSastInputValue, type TaxInvoiceDateSource } from '@/lib/utils/taxInvoiceDate'
import {
  inp, lbl, Btn,
  RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

type Info = { effectiveDate: string; source: TaxInvoiceDateSource; override: string | null }

const SOURCE_LABEL: Record<TaxInvoiceDateSource, string> = {
  override: 'manually set',
  payment: 'last payment date',
  created: 'transaction date (paid at creation)',
}

/** Manager-only editor for the date printed on a Tax Invoice. Times are Eswatini time (SAST). */
export function TaxInvoiceDateDialog({ kind, id, refNumber, onClose }: {
  kind: 'sale' | 'purchase'
  id: string
  refNumber: string
  onClose: () => void
}) {
  const base = `/api/${kind === 'sale' ? 'sales' : 'purchases'}/${id}/tax-invoice-date`
  const [info, setInfo] = useState<Info | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(base)
      .then(async (res) => {
        const j = await res.json()
        if (!res.ok) throw new Error(j.error ?? 'Failed to load')
        if (cancelled) return
        setInfo(j)
        setValue(toSastInputValue(new Date(j.effectiveDate)))
      })
      .catch((err) => { toast.error(err instanceof Error ? err.message : 'Failed to load tax invoice date'); onClose() })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base])

  async function save(date: string | null) {
    setSaving(true)
    const res = await fetch(base, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    setSaving(false)
    if (res.ok) { toast.success(date ? 'Tax invoice date updated' : 'Tax invoice date reset'); onClose() }
    else {
      const j = await res.json().catch(() => ({}))
      toast.error(typeof j.error === 'string' ? j.error : 'Failed to update tax invoice date')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={420}>
        <RpxDialogHeader title="Tax Invoice Date" onClose={onClose} />
        <RpxDialogBody>
          <p style={{ fontSize: 12.5, color: colors.textSecondary, margin: '0 0 12px' }}>
            Date printed on the tax invoice for <span style={{ fontWeight: 600, color: colors.textPrimary }}>{refNumber}</span>.
            {info && <> Currently the {SOURCE_LABEL[info.source]}.</>}
          </p>
          <span style={lbl}>Invoice date &amp; time (Eswatini time)</span>
          <input
            type="datetime-local"
            value={value}
            max={toSastInputValue(new Date())}
            onChange={(e) => setValue(e.target.value)}
            style={inp}
            disabled={!info || saving}
          />
        </RpxDialogBody>
        <RpxDialogFooter>
          {info?.override && (
            <Btn onClick={() => save(null)} disabled={saving}>Reset to payment date</Btn>
          )}
          <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" loading={saving} disabled={!info || !value} onClick={() => save(fromSastInputValue(value))}>
            Save
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
