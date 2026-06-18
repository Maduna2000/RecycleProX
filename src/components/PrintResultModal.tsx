'use client'

import { useState } from 'react'
import { Dialog, DialogContent, ModalTitleBar, ModalBtn } from '@/components/ui/dialog'
import { Printer, FileText, CheckCircle2, Plus, ExternalLink, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

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
    if (!window.electronAPI) return
    setPrinting(true)
    try {
      await window.electronAPI.printSlip({ type, id })
      await window.electronAPI.openCashDrawer()
      toast.success('Receipt printed')
    } catch {
      toast.error('Print failed — check printer connection')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <ModalTitleBar title={`${label} Complete`} onClose={onClose} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>

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
            {/* Direct print button - shown only in Electron desktop app */}
            {isElectron && (
              <button
                onClick={printDirect}
                disabled={printing}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, width: '100%', padding: '1px 6px', background: '#E0E0E0', color: '#212529', border: '1px solid #999', borderRadius: 2, fontSize: 10, cursor: printing ? 'not-allowed' : 'pointer', opacity: printing ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!printing) (e.currentTarget as HTMLButtonElement).style.background = '#D0D0D0' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E0E0E0' }}
              >
                {printing ? (
                  <><Loader2 style={{ width: 9, height: 9, animation: 'spin 1s linear infinite' }} /> Printing...</>
                ) : (
                  <><Printer style={{ width: 9, height: 9 }} /> Print Receipt</>
                )}
              </button>
            )}
            <button
              onClick={() => openPdf(receiptUrl)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, width: '100%', padding: '1px 6px', background: '#E0E0E0', color: '#212529', border: '1px solid #999', borderRadius: 2, fontSize: 10, cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E0E0E0' }}
            >
              <Printer style={{ width: 9, height: 9 }} /> Print PDF Slip
            </button>
            <button
              onClick={printThermal}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, width: '100%', padding: '1px 6px', background: '#E0E0E0', color: '#212529', border: '1px solid #999', borderRadius: 2, fontSize: 10, cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D0D0D0' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E0E0E0' }}
            >
              <Download style={{ width: 9, height: 9 }} /> Download Thermal Receipt
            </button>
            {type === 'purchase' && (
              <button
                onClick={() => openPdf(vat264Url)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, width: '100%', padding: '1px 6px', background: '#E0E0E0', color: '#212529', border: '1px solid #999', borderRadius: 2, fontSize: 10, cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D0D0D0' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E0E0E0' }}
              >
                <FileText style={{ width: 9, height: 9 }} /> Download VAT264
              </button>
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #E0E0E0', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            {onViewPurchase ? (
              <button
                onClick={onViewPurchase}
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', background: '#E0E0E0', border: '1px solid #999', borderRadius: 2, cursor: 'pointer', color: '#212529' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#D0D0D0' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#E0E0E0' }}
              >
                <ExternalLink style={{ width: 9, height: 9 }} /> View Transaction
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 6 }}>
              {onDone && <ModalBtn variant="outline" onClick={onDone}>Done</ModalBtn>}
              <ModalBtn variant="primary" icon={<Plus style={{ width: 9, height: 9 }} />} onClick={onClose}>
                New {label}
              </ModalBtn>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
