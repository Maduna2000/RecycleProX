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

const OCR_TIMEOUT_MS = 45_000

async function extractFromIdImage(
  file: File
): Promise<{ idNumber: string | null; firstName: string | null; lastName: string | null }> {
  const { createWorker } = await import('tesseract.js')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let worker: any = null

  const ocrPromise = (async () => {
    worker = await createWorker('eng', 1, { logger: () => {} })
    const { data: { text } } = await worker.recognize(file)
    return text as string
  })()

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('OCR timed out after 45 s')), OCR_TIMEOUT_MS)
  )

  let text: string
  try {
    text = await Promise.race([ocrPromise, timeoutPromise])
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }

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

  const idRaw =
    extractAfterLabel(['ID NO', 'ID NUMBER', 'NATIONAL ID', 'IDENTITY NUMBER', 'ID:']) ??
    lines.find((l) => /^[A-Z0-9]{2,}[/\-][A-Z0-9]+/i.test(l)) ??
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
      toast.success('ID scanned — please verify the details')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      toast.error(`${msg} — please enter details manually`)
    } finally {
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
        const j = await res.json() as { error?: string; issues?: { message: string }[] }
        const msg = j.issues?.[0]?.message ?? j.error ?? 'Failed to register customer'
        toast.error(msg)
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
      {/* Row 1: Full-width National ID field */}
      <div className="relative">
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

      {/* Row 2: Scan ID button — full width, clearly labeled */}
      <button
        type="button"
        disabled={scanStatus === 'scanning'}
        onClick={() => fileInputRef.current?.click()}
        className="w-full h-8 rounded border flex items-center justify-center gap-2 text-[11px] font-medium
                   transition-colors border-[#185ABD] text-[#185ABD] bg-blue-50 hover:bg-blue-100
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {scanStatus === 'scanning' ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Reading ID document… (this may take up to 30 s)
          </>
        ) : (
          <>
            <ScanLine className="w-3.5 h-3.5" />
            Scan ID Document — upload a photo of the ID
          </>
        )}
      </button>

      {/* Hidden file input */}
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

      {/* Row 3: First + Last name */}
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

      {/* Row 4: Phone + Address */}
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

      {/* Row 5: Status badge + Confirm */}
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
            : 'Confirm →'}
        </Button>
      </div>
    </div>
  )
}
