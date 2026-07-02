'use client'

/**
 * Shared date-range picker for the report viewer — From/To inputs plus the
 * familiar preset buttons (same presets and styling as the Overview tab).
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colors } from '@/lib/design-tokens'
import { LegacyButton } from './LegacyButton'

interface DateRangeFilterProps {
  from: string
  to: string
  onChange: (from: string, to: string) => void
}

export function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const today = new Date().toISOString().split('T')[0]!
  const monthStart = today.substring(0, 8) + '01'

  const presets = [
    { label: 'Today',       from: today, to: today },
    { label: 'Last 7 days', from: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]! })(), to: today },
    { label: 'This week',   from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split('T')[0]! })(), to: today },
    { label: 'This month',  from: monthStart, to: today },
  ]

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>From</Label>
        <Input type="date" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} className="w-40 h-9 text-sm" />
      </div>
      <div>
        <Label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>To</Label>
        <Input type="date" value={to} min={from} max={today} onChange={(e) => onChange(from, e.target.value)} className="w-40 h-9 text-sm" />
      </div>
      <div className="flex gap-2 flex-wrap pb-1">
        {presets.map((p) => (
          <LegacyButton key={p.label} onClick={() => onChange(p.from, p.to)}>
            {p.label}
          </LegacyButton>
        ))}
      </div>
    </div>
  )
}
