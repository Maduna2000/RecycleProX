'use client'

/**
 * Reports module — catalog of business reports (grouped by area) with a
 * parameter panel, on-screen preview, and PDF/Excel downloads.
 *
 * Deep-linkable: /app/reports?report=<id> selects a report in the catalog.
 */
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FileBarChart2 } from 'lucide-react'
import { PortalPage, PANEL } from '@/components/rpx'
import { colors, fontSize } from '@/lib/design-tokens'
import { REPORT_CATALOG } from '@/lib/reports/catalog'
import { ReportCatalog } from './_components/ReportCatalog'
import { ReportViewer } from './_components/ReportViewer'

export default function ReportsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const urlReport = searchParams.get('report')
  const selectedId = urlReport && REPORT_CATALOG.some((r) => r.id === urlReport) ? urlReport : null
  const selected = REPORT_CATALOG.find((r) => r.id === selectedId) ?? null

  if (!isManager) {
    return (
      <PortalPage title="Reports">
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
          Access restricted to managers and administrators.
        </div>
      </PortalPage>
    )
  }

  function handleSelect(id: string) {
    router.replace(`/app/reports?report=${id}`, { scroll: false })
  }

  return (
    <PortalPage title="Reports">
      <div className="flex gap-3 flex-1 min-h-0" style={{ padding: 10 }}>
        {/* Catalog rail */}
        <div className="w-80 shrink-0 flex flex-col min-h-0">
          <ReportCatalog selectedId={selectedId} onSelect={handleSelect} />
        </div>

        {/* Viewer */}
        <div className="flex-1 min-w-0 overflow-auto pb-6">
          {selected ? (
            <ReportViewer report={selected} />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 text-center"
              style={{ ...PANEL, minHeight: 260, color: colors.textSecondary }}
            >
              <FileBarChart2 className="w-7 h-7" style={{ color: '#C0C0C0' }} />
              <p style={{ fontSize: fontSize.sm }}>Select a report from the catalog to set parameters, preview, and download.</p>
            </div>
          )}
        </div>
      </div>
    </PortalPage>
  )
}
