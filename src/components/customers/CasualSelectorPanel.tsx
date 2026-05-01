'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, ScanLine, UserCheck, UserPlus, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { validateSaId } from '@/lib/utils/saId'

// ─── Types ────────────────────────────────────────────────────────────────────

type SelectedCustomer = {
  id: string; firstName: string; lastName: string; idNumber: string
  phone: string; blacklisted: boolean; priceGroupId?: string | null
  tradeCommodities?: string[] | null; zeroRated?: boolean
  physicalAddress?: string | null
}

type LookupStatus = 'idle' | 'loading' | 'found' | 'not_found'
type ScanStatus   = 'idle' | 'scanning' | 'error'

interface CasualForm {
  idNumber:        string
  firstName:       string
  lastName:        string
  phone:           string
  physicalAddress: string
}

interface Props {
  onSelect: (customer: SelectedCustomer) => void
}

// ─── OCR extraction using Tesseract.js ────────────────────────────────────────

async function extractFromIdImage(
  file: File
): Promise<{ idNumber: string | null; firstName: string | null; lastName: string | null }> {
  // Dynamic import keeps Tesseract out of the initial bundle
  const { recognize } = await import('tesseract.js')
  const { data: { text } } = await recognize(file, 'eng', { logger: () => {} })

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  function extractAfterLabel(labels: string[]): string | null {
    for (const label of labels) {
      const idx = lines.findIndex((l) => l.toUpperCase().startsWith(label))
      if (idx !== -1) {
        const sameLine = lines[idx]!.substring(label.length).replace(/^[:\s]+/, '').trim()
        if (sameLine.length > 1) return sameLine
        if (lines[idx + 1]) return lines[idx + 1]!.trim()
      }
    }
    return null
  }

  // ID number: labelled field first, then fallback regex for alphanumeric+slash/hyphen patterns
  const idRaw =
    extractAfterLabel(['ID NO', 'ID NUMBER', 'NATIONAL ID', 'IDENTITY NUMBER', 'ID:']) ??
    lines.find((l) => /^[A-Z0-9]{2,}[\/\-][A-Z0-9]+/i.test(l)) ??
    null

  return {
    idNumber:  idRaw ? idRaw.replace(/\s/g, '').toUpperCase() : null,
    firstName: extractAfterLabel(['NAMES', 'FIRST NAME', 'GIVEN NAME', 'FORENAMES', 'FIRST NAMES']),
    lastName:  extractAfterLabel(['SURNAME', 'LAST NAME', 'FAMILY NAME']),
  }
}

// ─── CasualSelectorPanel ──────────────────────────────────────────────────────

export function CasualSelectorPanel({ onSelect }: Props) {
  const [form, setForm] = useState<CasualForm>({
    idNumber: '', firstName: '', lastName: '', phone: '', physicalAddress: '',
  })
  const [lookupStatus,     setLookupStatus] = useState<LookupStatus>('idle')
  const [scanStatus,       setScanStatus]   = useState<ScanStatus>('idle')
  const [existingCustomer, setExisting]     = useState<SelectedCustomer | null>(null)
  const [isLocked,         setIsLocked]     = useState(false)
  const [confirming,       setConfirming]   = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  // ── ID lookup ──────────────────────────────────────────────────────────────

  const performLookup = useCallback(async (idNumber: string) => {
    setLookupStatus('loading')
    try {
      const res = await fetch(`/api/customers/lookup?idNumber=${encodeURIComponent(idNumber)}`)
      if (!res.ok) { setLookupStatus('idle'); return }
      const data = await res.json() as SelectedCustomer | null
      if (data) {
        setForm({
          idNumber:        data.idNumber,
          firstName:       data.firstName,
          lastName:        data.lastName,
          phone:           data.phone,
          physicalAddress: data.physicalAddress ?? '',
        })
        setExisting(data)
        setLookupStatus('found')
        setIsLocked(true)
      } else {
        setExisting(null)
        setLookupStatus('not_found')
        setIsLocked(false)
      }
    } catch {
      setLookupStatus('idle')
    }
  }, [])

  function handleIdChange(value: string) {
    setForm((f) => ({ ...f, idNumber: value }))
    setLookupStatus('idle')
    setIsLocked(false)
    setExisting(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length >= 5 && validateSaId(value).valid) {
      debounceRef.current = setTimeout(() => performLookup(value), 500)
    }
  }

  // ── ID scan (Tesseract OCR) ────────────────────────────────────────────────

  async function handleScan(file: File) {
    setScanStatus('scanning')
    try {
      const extracted = await extractFromIdImage(file)
      setForm((f) => ({
        ...f,
        idNumber:  extracted.idNumber  ?? f.idNumber,
        firstName: extracted.firstName ?? f.firstName,
        lastName:  extracted.lastName  ?? f.lastName,
      }))
      if (extracted.idNumber && extracted.idNumber.length >= 5) {
        performLookup(extracted.idNumber)
      }
      setScanStatus('idle')
      toast.success('ID scanned — please verify the details')
    } catch {
      setScanStatus('error')
      toast.error('Scan failed — please enter details manually')
      setScanStatus('idle')
    }
  }

  // ── Confirm Seller ────────────────────────────────────────────────────────

  async function handleConfirm() {
    const idCheck = validateSaId(form.idNumber)
    if (!idCheck.valid) { toast.error(idCheck.error ?? 'Invalid ID number'); return }
    if (!form.firstName.trim()) { toast.error('First name is required'); return }
    if (!form.lastName.trim())  { toast.error('Last name is required'); return }
    if (!form.phone.trim())     { toast.error('Phone number is required'); return }

    if (existingCustomer) {
      onSelect(existingCustomer)
      return
    }

    setConfirming(true)
    try {
      const res = await fetch('/api/customers/quick-create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          idNumber:        form.idNumber,
          firstName:       form.firstName.trim(),
          lastName:        form.lastName.trim(),
          phone:           form.phone.trim(),
          physicalAddress: form.physicalAddress.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        toast.error(j.error ?? 'Failed to register customer')
        return
      }
      const customer = await res.json() as SelectedCustomer
      onSelect(customer)
    } catch {
      toast.error('Network error — please try again')
    } finally {
      setConfirming(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls = 'h-8 text-[12px] focus:ring-1 focus:ring-[#185ABD]'
  const lockedCls = isLocked ? 'bg-[#F8F9FA]' : ''
  const isBlacklisted = existingCustomer?.blacklisted === true

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Row 1: ID + Scan */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={form.idNumber}
            onChange={(e) => handleIdChange(e.target.value)}
            placeholder="National ID number"
            className={`${inputCls} ${lockedCls} pr-7`}
            readOnly={isLocked}
            aria-label="National ID number"
          />
          {lookupStatus === 'loading' && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[#6C757D]" />
          )}
        </div>
        <button
          type="button"
          title={scanStatus === 'scanning' ? 'Reading ID…' : 'Scan ID document'}
          disabled={scanStatus === 'scanning'}
          onClick={() => fileInputRef.current?.click()}
          className="w-8 h-8 rounded border flex items-center justify-center transition-colors shrink-0
                     border-[#E0E0E0] bg-white hover:bg-[#F8F9FA] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scanStatus === 'scanning'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#185ABD]" />
            : <ScanLine className="w-3.5 h-3.5 text-[#6C757D]" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleScan(file)
            e.target.value = ''
          }}
        />
      </div>

      {/* Row 2: First + Last name */}
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={form.firstName}
          onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          placeholder="First name"
          className={`${inputCls} ${lockedCls}`}
          readOnly={isLocked}
          aria-label="First name"
        />
        <Input
          value={form.lastName}
          onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          placeholder="Last name"
          className={`${inputCls} ${lockedCls}`}
          readOnly={isLocked}
          aria-label="Last name"
        />
      </div>

      {/* Row 3: Phone + Address */}
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="76 123 456"
          className={`${inputCls} ${lockedCls}`}
          readOnly={isLocked}
          aria-label="Phone"
        />
        <Input
          value={form.physicalAddress}
          onChange={(e) => setForm((f) => ({ ...f, physicalAddress: e.target.value }))}
          placeholder="Address (optional)"
          className={inputCls}
          aria-label="Address"
        />
      </div>

      {/* Row 4: Status badge + Confirm */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {lookupStatus === 'found' && !isBlacklisted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
              <UserCheck className="w-3 h-3" /> Returning customer
            </span>
          )}
          {lookupStatus === 'not_found' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
              <UserPlus className="w-3 h-3" /> New customer
            </span>
          )}
          {isBlacklisted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
              <AlertTriangle className="w-3 h-3" /> Blacklisted — cannot process
            </span>
          )}
          {scanStatus === 'scanning' && (
            <span className="text-[10px] text-[#6C757D]">Reading ID…</span>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          disabled={confirming || isBlacklisted || scanStatus === 'scanning'}
          onClick={handleConfirm}
          className="h-7 px-3 text-[11px] bg-[#217346] hover:bg-[#1a5c38] text-white shrink-0"
        >
          {confirming
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Confirming…</>
            : 'Confirm Seller →'}
        </Button>
      </div>
    </div>
  )
}
