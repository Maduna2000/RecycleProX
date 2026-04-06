'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, FileText, X, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface PrintResultModalProps {
  type:      'purchase' | 'sale'
  id:        string
  refNumber: string
  onClose:   () => void
}

export function PrintResultModal({ type, id, refNumber, onClose }: PrintResultModalProps) {
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            {type === 'purchase' ? 'Purchase' : 'Sale'} Recorded
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="text-center py-2">
            <p className="text-sm text-gray-600">Reference:</p>
            <p className="text-xl font-bold font-mono text-gray-900">{refNumber}</p>
          </div>

          <p className="text-sm text-gray-600 text-center">
            Would you like to print a receipt?
          </p>

          <div className="space-y-2">
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => openPdf(receiptUrl)}
            >
              <Printer className="w-4 h-4 mr-2" /> Print PDF Slip
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={printThermal}
            >
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

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
