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

// ─── Client-side image compression ───────────────────────────────────────────
// Resizes to max 1600 px wide and re-encodes as JPEG before uploading.
// Keeps OCR accuracy while staying well under Vercel's 4.5 MB payload limit.

async function compressImage(file: File, maxPx = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

// ─── CasualSelectorPanel ──────────────────────────────────────────────────────

export function CasualSelectorPanel({ onSelect }: Props) {
  const [form, setForm] = useState<CasualForm>({
    idNumber: '', firstName: '', lastName: '', phone: '', physicalAddress: '',
  })
  const [lookupStatus,     setLookupStatus] = useState<LookupStatus>('idle')
  const [scanStatus,       setScanStatus]   = useState<ScanStatus>('idle')
  const [scanPhase,        setScanPhase]    = useState<'upload' | 'ocr'>('upload')
  const [scanProgress,     setScanProgress] = useState<number | null>(null)
  const [existingCustomer, setExisting]     = useState<SelectedCustomer | null>(null)
  const [isLocked,         setIsLocked]     = useState(false)
  const [confirming,       setConfirming]   = useState(false)
  const [scanR2Key,        setScanR2Key]    = useState<string | null>(null)

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

  // ── ID scan — upload to R2 then client-side OCR ──────────────────────────

  async function handleScan(file: File) {
    setScanStatus('scanning')
    setScanPhase('upload')
    setScanProgress(null)
    setScanR2Key(null)

    let worker: import('tesseract.js').Worker | null = null

    try {
      // 1. Compress before upload — phone camera photos can be 10+ MB; Vercel limit is 4.5 MB
      const compressed = await compressImage(file)

      // 2. Upload to R2 with 15 s hard timeout
      const uploadAbort = new AbortController()
      const uploadTimer = setTimeout(() => uploadAbort.abort(), 15_000)
      let uploadRes: Response
      try {
        const fd = new FormData()
        fd.append('file', compressed)
        uploadRes = await fetch('/api/id-scan', { method: 'POST', body: fd, signal: uploadAbort.signal })
      } catch (err) {
        const msg = (err instanceof Error && err.name === 'AbortError') ? 'Upload timed out' : 'Upload failed'
        toast.error(`${msg} — please enter details manually`)
        setScanStatus('error')
        return
      } finally {
        clearTimeout(uploadTimer)
      }

      // Guard against non-JSON responses (e.g. 413 "Request Entity Too Large" from proxy)
      let uploadData: { scanR2Key: string; error?: string } | null = null
      try {
        uploadData = await uploadRes.json()
      } catch {
        toast.error(`Upload failed (${uploadRes.status}) — please enter details manually`)
        setScanStatus('error')
        return
      }

      if (!uploadRes.ok || !uploadData?.scanR2Key) {
        toast.error(uploadData?.error ?? 'Upload failed — please enter details manually')
        setScanStatus('error')
        return
      }

      // 3. Photo saved — switch to OCR phase
      setScanR2Key(uploadData.scanR2Key)
      setScanPhase('ocr')
      toast.info('Photo saved — now reading ID text…')

      // 4. Run Tesseract client-side with progress + 40 s hard timeout
      const { createWorker } = await import('tesseract.js')
      worker = await createWorker('eng', 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setScanProgress(Math.round(m.progress * 100))
          }
        },
      })

      const ocrTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR_TIMEOUT')), 40_000),
      )

      let ocrText = ''
      try {
        const result = await Promise.race([
          worker.recognize(compressed),
          ocrTimeout,
        ]) as Awaited<ReturnType<typeof worker.recognize>>
        ocrText = result.data.text
      } catch (err) {
        if (err instanceof Error && err.message === 'OCR_TIMEOUT') {
          toast.warning('ID text could not be read — photo is saved, please enter details manually')
        } else {
          toast.warning('OCR failed — photo is saved, please enter details manually')
        }
        return
      }

      // 5. Extract fields
      const idMatch = ocrText.match(/\b(\d{13})\b/)
      const idNumber = idMatch ? idMatch[1] : null

      const extractAfterLabel = (labels: string[]): string | null => {
        for (const label of labels) {
          const pattern = new RegExp(`${label}[:\\s]+([A-Z][A-Za-z\\s]{1,40})`, 'i')
          const m = ocrText.match(pattern)
          if (m?.[1]) return m[1].trim()
        }
        return null
      }

      const firstName = extractAfterLabel(['NAMES', 'NAME', 'FORENAMES', 'FORENAME', 'FIRST NAME', 'GIVEN NAMES'])
      const lastName  = extractAfterLabel(['SURNAME', 'VAN', 'LAST NAME', 'FAMILY NAME'])

      // 6. Fill form fields
      setForm((f) => ({
        ...f,
        idNumber:  idNumber  ?? f.idNumber,
        firstName: firstName ?? f.firstName,
        lastName:  lastName  ?? f.lastName,
      }))

      if (idNumber && idNumber.length >= 5) {
        performLookup(idNumber)
      }

      if (idNumber || firstName || lastName) {
        toast.success('ID scanned — please verify the details')
      } else {
        toast.warning('Photo saved but text could not be read — please enter details manually')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      toast.error(`${msg} — please enter details manually`)
      setScanStatus('error')
    } finally {
      // 8. Always clean up
      if (worker) { try { await worker.terminate() } catch { /* ignore */ } }
      setScanProgress(null)
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

    setConfirming(true)
    try {
      let customer: SelectedCustomer

      if (existingCustomer) {
        customer = existingCustomer
      } else {
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
        customer = await res.json() as SelectedCustomer
      }

      // Link the scanned ID photo to this customer (fire-and-forget)
      if (scanR2Key) {
        fetch(`/api/customers/${customer.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ idPhotoR2Key: scanR2Key }),
        }).catch(() => {
          toast.warning('ID photo could not be linked — photo is saved but not yet attached')
        })
      }

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

      {/* Row 2: Scan ID button */}
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
            {scanPhase === 'upload'
              ? 'Uploading photo…'
              : scanProgress !== null
                ? `Reading ID… ${scanProgress}%`
                : 'Reading ID text… (up to 40 s)'}
          </>
        ) : (
          <>
            <ScanLine className="w-3.5 h-3.5" />
            {scanR2Key ? 'Re-scan ID Document' : 'Scan ID Document — upload a photo of the ID'}
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
          {scanR2Key && lookupStatus !== 'found' && !isBlacklisted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
              ID photo saved
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
