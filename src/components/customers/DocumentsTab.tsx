'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { fetcher } from '@/lib/swrFetcher'
import { Btn, HEADER_GRAD, NAVY } from '@/components/rpx'
import { DocumentViewerModal } from '@/components/ui/DocumentViewerModal'

type CustomerDoc = {
  id: string; documentType: string; fileName: string; r2Key: string
  notes?: string; uploadedAt: string
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  id_copy:              'ID',
  passport:             'Passport',
  trading_licence:      'Trading License',
  company_registration: 'Company Registration',
  eea_license:          'EEA License',
}

const docLinkBtn: React.CSSProperties = { fontSize: 11, cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }

function SHdr({ title }: { title: string }) {
  return (
    <div style={{ background: HEADER_GRAD, borderBottom: '1px solid #C0C0C0', padding: '4px 10px', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{title}</span>
    </div>
  )
}

/**
 * Shared between the account and casual customer profile pages — both allow
 * uploading compliance documents (ID copies, licenses, etc.) as PDF or image,
 * via the customer_document R2 context (20 MB, PDF+image allowed), unlike
 * the photo-only customer_id context used for the quick ID Photo field.
 */
export function DocumentsTab({ customerId }: { customerId: string }) {
  const { data: session } = useSession()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')
  const [docType, setDocType]     = useState<string>('id_copy')
  const [uploading, setUploading] = useState(false)
  const [reuploadTarget, setReuploadTarget] = useState<CustomerDoc | null>(null)
  const [viewingDoc, setViewingDoc] = useState<{ doc: CustomerDoc; url: string } | null>(null)
  const [viewLoading, setViewLoading] = useState<string | null>(null)
  const docFileRef      = useRef<HTMLInputElement>(null)
  const reuploadFileRef = useRef<HTMLInputElement>(null)
  const { data: docs, mutate: mutateDocs } = useSWR<CustomerDoc[]>(`/api/customers/${customerId}/documents`, fetcher)

  // Shared by both the "new document" and "replace document" flows below —
  // just the R2 upload half, since what happens with the returned key differs.
  async function uploadDocumentFile(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('context', 'customer_document')
    fd.append('referenceId', customerId)
    fd.append('file', file)
    const uploadRes = await fetch('/api/r2/upload', { method: 'POST', body: fd })
    if (!uploadRes.ok) {
      const j = await uploadRes.json().catch(() => ({}))
      toast.error(j.error ?? 'Upload failed')
      return null
    }
    const { key } = await uploadRes.json()
    return key
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const key = await uploadDocumentFile(file)
      if (!key) return
      const saveRes = await fetch(`/api/customers/${customerId}/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: docType, r2Key: key, fileName: file.name }),
      })
      if (saveRes.ok) { toast.success('Document uploaded'); mutateDocs() }
      else toast.error('Failed to save document')
    } catch {
      toast.error('Upload failed — check your connection')
    } finally { setUploading(false); e.target.value = '' }
  }

  function triggerReupload(doc: CustomerDoc) {
    setReuploadTarget(doc)
    reuploadFileRef.current?.click()
  }

  // Replace = upload the new file and record it under the same document
  // (same type) first, only removing the old row/object once that succeeds —
  // so a failed upload never costs the existing document.
  async function handleDocReupload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const target = reuploadTarget
    if (!file || !target) return
    setUploading(true)
    try {
      const key = await uploadDocumentFile(file)
      if (!key) return
      const saveRes = await fetch(`/api/customers/${customerId}/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: target.documentType, r2Key: key, fileName: file.name }),
      })
      if (!saveRes.ok) { toast.error('Failed to save replacement'); return }
      await fetch(`/api/customers/${customerId}/documents/${target.id}`, { method: 'DELETE' })
      toast.success('Document replaced')
      mutateDocs()
    } catch {
      toast.error('Upload failed — check your connection')
    } finally { setUploading(false); setReuploadTarget(null); e.target.value = '' }
  }

  async function handleDocDelete(docId: string) {
    const res = await fetch(`/api/customers/${customerId}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Document deleted'); mutateDocs() }
    else toast.error('Failed to delete document')
  }

  async function handleDocView(doc: CustomerDoc) {
    setViewLoading(doc.id)
    const res = await fetch(`/api/r2/view-url?key=${encodeURIComponent(doc.r2Key)}`)
    setViewLoading(null)
    if (res.ok) { const { url } = await res.json(); setViewingDoc({ doc, url }) }
    else toast.error('Failed to get view URL')
  }

  return (
    <div>
      {/* Compliance docs */}
      <SHdr title="Compliance Documents" />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            style={{ height: 26, borderRadius: 2, border: '1px solid #ABABAB', padding: '0 7px', fontSize: 12, color: '#212529', background: '#fff', outline: 'none' }}
          >
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <Btn size="sm" loading={uploading} onClick={() => docFileRef.current?.click()}>
            {uploading ? 'Uploading…' : '+ Upload Document'}
          </Btn>
          <input ref={docFileRef} type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocUpload} disabled={uploading} />
          <input ref={reuploadFileRef} type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocReupload} disabled={uploading} />
        </div>

        {!docs?.length ? (
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>No compliance documents uploaded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.map((doc) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: 4, background: '#fff' }}>
                <div style={{ width: 30, height: 30, borderRadius: 4, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText style={{ width: 14, height: 14, color: '#9CA3AF' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#212529', margin: 0 }}>{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</p>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.fileName} · {new Date(doc.uploadedAt).toLocaleDateString('en-ZA')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  <button onClick={() => handleDocView(doc)} disabled={viewLoading === doc.id} style={{ ...docLinkBtn, color: '#1B3A6B', opacity: viewLoading === doc.id ? 0.5 : 1 }}>
                    {viewLoading === doc.id ? 'Loading…' : 'View'}
                  </button>
                  {isManager && (
                    <button onClick={() => triggerReupload(doc)} disabled={uploading} style={{ ...docLinkBtn, color: '#1B3A6B', opacity: uploading ? 0.5 : 1 }}>Re-upload</button>
                  )}
                  {isManager && (
                    <button onClick={() => handleDocDelete(doc.id)} style={{ ...docLinkBtn, color: '#C53030' }}>Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingDoc && (
        <DocumentViewerModal
          title={DOCUMENT_TYPE_LABELS[viewingDoc.doc.documentType] ?? viewingDoc.doc.documentType}
          subtitle={new Date(viewingDoc.doc.uploadedAt).toLocaleDateString('en-ZA')}
          url={viewingDoc.url}
          fileName={viewingDoc.doc.fileName}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  )
}
