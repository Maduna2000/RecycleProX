'use client'

import { colors } from '@/lib/design-tokens'

export function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked:  boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: checked ? colors.action : colors.border }}
      role="switch"
      aria-checked={checked}
    >
      <span
        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(3px)' }}
      />
    </button>
  )
}
