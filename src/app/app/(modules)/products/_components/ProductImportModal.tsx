'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, Download, FileWarning, CheckCircle2 } from 'lucide-react'
import { colors, fontSize, fontWeight } from '@/lib/design-tokens'
import { Dialog } from '@/components/ui/dialog'
import {
  Btn, RpxDialogContent, RpxDialogHeader, RpxDialogBody, RpxDialogFooter,
} from '@/components/rpx'

type ImportError = { row: number; code: string; reason: string }
type ImportResult = { imported: number; skipped: number; errors: ImportError[] }

const TEMPLATE_HEADER = 'code,name,category,unit,defaultBuyPrice,defaultSellPrice,minStockLevel'

function downloadTemplate(categoryName: string) {
  const exampleRow = `CU-BR,Copper — Bright,${categoryName},kg,85.00,95.00,50`
  const blob = new Blob([`${TEMPLATE_HEADER}\n${exampleRow}\n`], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'products-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function ProductImportModal({
  categoryNames, onClose, onSuccess,
}: {
  categoryNames: string[]
  onClose: () => void
  onSuccess: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleImport() {
    if (!file) return
    setUploading(true)
    setResult(null)
    try {
      const body = new FormData()
      body.append('csv', file)
      const res = await fetch('/api/products/import', { method: 'POST', body })
      const json = await res.json() as ImportResult | { error: string }
      if (!res.ok && !('imported' in json)) {
        toast.error('error' in json ? json.error : 'Import failed')
        return
      }
      const r = json as ImportResult
      setResult(r)
      if (r.imported > 0) {
        toast.success(`Imported ${r.imported} product${r.imported === 1 ? '' : 's'}${r.skipped > 0 ? ` — ${r.skipped} skipped` : ''}`)
        onSuccess()
      } else {
        toast.error('No products were imported — see the errors below')
      }
    } catch {
      toast.error('Failed to import — check your connection and try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <RpxDialogContent maxWidth={560}>
        <RpxDialogHeader title="Import Products from CSV" icon={Upload} onClose={onClose} />
        <RpxDialogBody>
          <div className="space-y-4">
            <p style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
              Upload a CSV file to add many products at once. The category for each row must already
              exist (Products → Categories) — rows with an unknown category are skipped, not created.
            </p>

            <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 3, padding: '10px 12px' }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Expected columns
              </div>
              <code style={{ fontSize: fontSize.xs, color: colors.textPrimary, wordBreak: 'break-all' }}>{TEMPLATE_HEADER}</code>
              <p style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 6 }}>
                unit is one of kg / ton / each / litre (defaults to kg). minStockLevel is optional.
              </p>
              <Btn
                onClick={() => downloadTemplate(categoryNames[0] ?? 'Copper')}
                icon={Download}
                style={{ marginTop: 8 }}
              >
                Download Template
              </Btn>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null) }}
                style={{ display: 'none' }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1.5px dashed ${colors.border}`, borderRadius: 4, padding: '18px 12px',
                  textAlign: 'center', cursor: 'pointer', background: colors.surface,
                }}
              >
                <Upload style={{ width: 20, height: 20, color: colors.textSecondary, margin: '0 auto 6px' }} />
                <div style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                  {file ? file.name : 'Click to choose a CSV file'}
                </div>
                <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>Max 5 MB</div>
              </div>
            </div>

            {result && (
              <div className="space-y-2">
                <div className="flex items-center gap-2" style={{
                  padding: '8px 10px', borderRadius: 3, fontSize: fontSize.sm,
                  background: result.imported > 0 ? colors.actionBg : colors.dangerBg,
                  color: result.imported > 0 ? colors.action : colors.danger,
                }}>
                  <CheckCircle2 size={14} />
                  {result.imported} imported, {result.skipped} skipped
                </div>
                {result.errors.length > 0 && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 3 }}>
                    {result.errors.map((e, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2"
                        style={{
                          padding: '6px 10px', fontSize: fontSize.xs,
                          borderBottom: i < result.errors.length - 1 ? `1px solid ${colors.rowDivider}` : undefined,
                        }}
                      >
                        <FileWarning size={12} style={{ color: colors.danger, flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: colors.textSecondary }}>
                          Row {e.row} <span style={{ fontFamily: 'monospace', color: colors.textPrimary }}>({e.code})</span>: {e.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </RpxDialogBody>
        <RpxDialogFooter>
          <Btn onClick={onClose} disabled={uploading}>{result ? 'Close' : 'Cancel'}</Btn>
          <Btn variant="primary" loading={uploading} disabled={!file} onClick={handleImport}>
            Import
          </Btn>
        </RpxDialogFooter>
      </RpxDialogContent>
    </Dialog>
  )
}
