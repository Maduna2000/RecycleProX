'use client'

/**
 * Reports module — two tabs:
 *  - Reports: catalog of business reports (grouped by area) with parameter
 *    panel, on-screen preview, and PDF/Excel downloads.
 *  - Overview: the original summary dashboard, unchanged.
 *
 * Deep-linkable: /app/reports?report=<id> selects a report in the catalog.
 */
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { PageShell } from '@/components/layout/PageShell'
import { colors } from '@/lib/design-tokens'
import { REPORT_CATALOG } from '@/lib/reports/catalog'
import { OverviewTab } from './_components/OverviewTab'
import { ReportCatalog } from './_components/ReportCatalog'
import { ReportViewer } from './_components/ReportViewer'

const TABS = [
  { value: 'reports', label: 'Reports' },
  { value: 'overview', label: 'Overview' },
] as const

export default function ReportsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isManager = ['admin', 'manager'].includes(session?.user?.role ?? '')

  const urlReport = searchParams.get('report')
  const selectedId = urlReport && REPORT_CATALOG.some((r) => r.id === urlReport) ? urlReport : null
  const [tab, setTab] = useState<string>('reports')

  const selected = REPORT_CATALOG.find((r) => r.id === selectedId) ?? null

  if (!isManager) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-40 text-sm" style={{ color: colors.textSecondary }}>
          Access restricted to managers and administrators.
        </div>
      </PageShell>
    )
  }

  function handleSelect(id: string) {
    router.replace(`/app/reports?report=${id}`, { scroll: false })
  }

  return (
    <PageShell
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'overview' ? (
        <div className="pt-2 overflow-auto">
          <OverviewTab />
        </div>
      ) : (
        <div className="flex gap-4 pt-2 flex-1 min-h-0">
          {/* Catalog rail */}
          <div className="w-80 shrink-0 overflow-auto pb-6">
            <ReportCatalog selectedId={selectedId} onSelect={handleSelect} />
          </div>

          {/* Viewer */}
          <div className="flex-1 min-w-0 overflow-auto pb-6">
            {selected ? (
              <ReportViewer report={selected} />
            ) : (
              <div
                className="rounded border bg-white px-4 py-16 text-center"
                style={{ borderColor: colors.border, color: colors.textSecondary, fontSize: 13 }}
              >
                Select a report from the catalog to set parameters, preview, and download.
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
