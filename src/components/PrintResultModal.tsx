'use client'

import { Dialog, DialogContent, ModalTitleBar } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, FileText, CheckCircle, Plus, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

interface PrintResultModalProps {
  type:             'purchase' | 'sale'
  id:               string
  refNumber:        string
  onClose:          () => void          // "New Purchase/Sale" — primary action
  onViewPurchase?:  () => void          // "View this transaction" — secondary
  onDone?:          () => void          // "Done" — go to dashboard
}

export function PrintResultModal({ type, id, refNumber, onClose, onViewPurchase, onDone }: PrintResultModalProps) {
  const receiptUrl = `/api/${type}s/${id}/receipt?format=pdf`
  const vat264Url  = `/api/purchases/${id}/vat264`

  function openPdf(url: string) {
    window.open(url, '_blank')
  }

  async function printThermal() {
    try {
      const res = await fetch(`/api/${type}s/${id}/receipt?format=thermal`)
      if (!res.ok) { toast.error('Failed to get thermal receipt'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `receipt-${refNumber}.bin`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Thermal receipt downloaded — send to printer')
    } catch {
      toast.error('Failed to download thermal receipt')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <ModalTitleBar title={`${type === 'purchase' ? 'Purchase' : 'Sale'} Complete`} onClose={onClose} />

        <div className="space-y-4 mt-2">
          <div className="text-center py-2 bg-green-50 rounded-lg border border-green-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Reference</p>
            <p className="text-xl font-bold font-mono text-gray-900 mt-0.5">{refNumber}</p>
          </div>

          <p className="text-sm text-gray-500 text-center">Print a receipt before starting the next transaction.</p>

          <div className="space-y-2">
            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => openPdf(receiptUrl)}>
              <Printer className="w-4 h-4 mr-2" /> Print PDF Slip
            </Button>

            <Button variant="outline" className="w-full" onClick={printThermal}>
              <Printer className="w-4 h-4 mr-2" /> Download Thermal Receipt
            </Button>

            {type === 'purchase' && (
              <Button
                variant="outline"
                className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => openPdf(vat264Url)}
              >
                <FileText className="w-4 h-4 mr-2" /> Download VAT264
              </Button>
            )}
          </div>

          <div className="border-t pt-3 flex items-center justify-between gap-2">
            {onViewPurchase && (
              <Button variant="ghost" size="sm" className="text-gray-500" onClick={onViewPurchase}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> View Transaction
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {onDone && (
                <Button variant="outline" size="sm" onClick={onDone}>
                  <CheckCircle className="w-3.5 h-3.5 mr-1" /> Done
                </Button>
              )}
              <Button
                className="bg-green-600 hover:bg-green-700 min-w-[140px]"
                onClick={onClose}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {type === 'purchase' ? 'New Purchase' : 'New Sale'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
