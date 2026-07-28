'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Btn } from '@/components/rpx'
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

// Shape of a customer row returned by the ID lookup endpoint — a casual
// search can turn up a customer who is actually registered as an Account.
type LookupCustomer = SelectedCustomer & {
  customerType?:  'casual' | 'account'
  companyName?:   string | null
  contactPerson?: string | null
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
  onSelect:          (customer: SelectedCustomer) => void
  // Fired instead of onSelect when the ID lookup matches a customer who is
  // registered as an Account (not Casual) — lets the host page switch tabs.
  onAccountMatch?:   (customer: SelectedCustomer) => void
  hideConfirmButton?: boolean
}

export interface CasualSelectorPanelRef {
  confirm: () => Promise<SelectedCustomer | null>
}

// ─── Client-side image compression ───────────────────────────────────────────

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

export const CasualSelectorPanel = forwardRef<CasualSelectorPanelRef, Props>(
  function CasualSelectorPanel({ onSelect, onAccountMatch, hideConfirmButton = false }, ref) {
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
        const data = await res.json() as LookupCustomer | null
        if (data) {
          // This ID belongs to a registered Account customer, not a Casual
          // one — hand off to the host page's Account tab instead of
          // silently treating them as casual.
          if (data.customerType === 'account' && onAccountMatch) {
            setLookupStatus('idle')
            setIsLocked(false)
            setExisting(null)
            setForm({ idNumber: '', firstName: '', lastName: '', phone: '', physicalAddress: '' })
            toast.info('This ID is registered as an Account customer — switched to Account tab')
            onAccountMatch(data)
            return
          }
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
    }, [onAccountMatch])

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
        const compressed = await compressImage(file)

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

        setScanR2Key(uploadData.scanR2Key)
        setScanPhase('ocr')
        toast.info('Photo saved — now reading ID text…')

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
        if (worker) { try { await worker.terminate() } catch { /* ignore */ } }
        setScanProgress(null)
        setScanStatus('idle')
      }
    }

    // ── Confirm Seller ────────────────────────────────────────────────────────

    async function handleConfirm(): Promise<SelectedCustomer | null> {
      const idCheck = validateSaId(form.idNumber)
      if (!idCheck.valid) { toast.error(idCheck.error ?? 'Invalid ID number'); return null }
      if (!form.firstName.trim()) { toast.error('First name is required'); return null }
      if (!form.lastName.trim())  { toast.error('Last name is required'); return null }
      if (!form.phone.trim())     { toast.error('Phone number is required'); return null }

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
            return null
          }
          customer = await res.json() as SelectedCustomer
        }

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
        return customer
      } catch {
        toast.error('Network error — please try again')
        return null
      } finally {
        setConfirming(false)
      }
    }

    // Expose confirm() to parent via ref
    useImperativeHandle(ref, () => ({ confirm: handleConfirm }))

    // ── Styles ────────────────────────────────────────────────────────────────

    const inputCls  = 'h-7 text-[12px] focus:ring-1 focus:ring-[#185ABD]'
    const lockedCls = isLocked ? 'bg-[#F8F9FA]' : ''
    const isBlacklisted = existingCustomer?.blacklisted === true

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <div className="space-y-1">
        {/* Row 1: National ID + inline Scan ID button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
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

          <Btn
            variant="secondary"
            icon={ScanLine}
            loading={scanStatus === 'scanning'}
            disabled={scanStatus === 'scanning'}
            onClick={() => fileInputRef.current?.click()}
            title={scanR2Key ? 'Re-scan ID document' : 'Scan ID document — upload a photo'}
          >
            {scanStatus === 'scanning'
              ? (scanPhase === 'upload' ? 'Uploading…' : scanProgress !== null ? `${scanProgress}%` : 'Reading…')
              : (scanR2Key ? 'Re-scan' : 'Scan ID')}
          </Btn>
        </div>

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

        {/* Row 5: Status badges + optional Confirm button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
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

          {!hideConfirmButton && (
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
          )}
        </div>
      </div>
    )
  }
)
