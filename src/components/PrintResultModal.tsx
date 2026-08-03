'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Printer, FileText, CheckCircle2, Plus, ExternalLink, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter } from '@/components/rpx'
import { canAutoPrint, autoPrintReceipt } from '@/lib/print/autoPrintClient'

interface PrintResultModalProps {
  type:            'purchase' | 'sale'
  id:              string
  refNumber:       string
  onClose:         () => void
  onViewPurchase?: () => void
  onDone?:         () => void
}

export function PrintResultModal({ type, id, refNumber, onClose, onViewPurchase, onDone }: PrintResultModalProps) {
  const receiptUrl = `/api/${type}s/${id}/receipt?format=pdf`
  const vat264Url  = `/api/purchases/${id}/vat264`
  const label      = type === 'purchase' ? 'Purchase' : 'Sale'
  const [printing, setPrinting] = useState(false)
  const showDirectPrint = typeof window !== 'undefined' && canAutoPrint()

  function openPdf(url: string) { window.open(url, '_blank') }

  async function printThermal() {
    try {
      const res = await fetch(`/api/${type}s/${id}/receipt?format=thermal`)
      if (!res.ok) { toast.error('Failed to get thermal receipt'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `receipt-${refNumber}.bin`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Thermal receipt downloaded — send to printer')
    } catch { toast.error('Failed to download thermal receipt') }
  }

  async function printDirect() {
    setPrinting(true)
    try {
      await autoPrintReceipt({ type, id })
      toast.success('Receipt printed')
    } catch {
      toast.error('Print failed — check printer connection')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={400}>
        <RpxDialogHeader title={`${label} Complete`} onClose={onClose} />
        <RpxDialogBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Reference panel */}
          <div style={{ background: '#F8F9FA', border: '1px solid #E0E0E0', borderRadius: 3, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <CheckCircle2 style={{ width: 13, height: 13, color: '#217346', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#217346' }}>Transaction recorded successfully</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6C757D', marginBottom: 2 }}>Reference Number</div>
            <div style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color: '#1B3A6B' }}>{refNumber}</div>
          </div>

          <p style={{ fontSize: 11, color: '#6C757D', textAlign: 'center', margin: 0 }}>
            Print a receipt before starting the next transaction.
          </p>

          {/* Print / download actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Direct print button - shown in the Electron desktop app or a PWA served from the local-server deployment */}
            {showDirectPrint && (
              <Btn icon={Printer} loading={printing} onClick={printDirect} style={{ width: '100%', justifyContent: 'center' }}>
                {printing ? 'Printing...' : 'Print Receipt'}
              </Btn>
            )}
            <Btn icon={Printer} onClick={() => openPdf(receiptUrl)} style={{ width: '100%', justifyContent: 'center' }}>
              Print PDF Slip
            </Btn>
            <Btn icon={Download} onClick={printThermal} style={{ width: '100%', justifyContent: 'center' }}>
              Download Thermal Receipt
            </Btn>
            {type === 'purchase' && (
              <Btn icon={FileText} onClick={() => openPdf(vat264Url)} style={{ width: '100%', justifyContent: 'center' }}>
                Download VAT264
              </Btn>
            )}
          </div>
        </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          {onViewPurchase ? (
            <Btn icon={ExternalLink} onClick={onViewPurchase} style={{ marginRight: 'auto' }}>
              View Transaction
            </Btn>
          ) : <span />}
          {onDone && <Btn onClick={onDone}>Done</Btn>}
          <Btn variant="primary" icon={Plus} onClick={onClose}>
            New {label}
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
