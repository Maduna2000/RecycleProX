'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/swrFetcher'

/**
 * Hook to fetch the actual record title for dynamic routes.
 * Returns the record name/reference for display in breadcrumbs, title bar, and taskbar.
 *
 * Examples:
 *   /app/purchases/abc123 → "PUR-2025-001234"
 *   /app/customers/xyz789 → "John Smith"
 *   /app/sales/def456 → "SAL-2025-000789"
 */


type RoutePattern = {
  prefix: string
  apiPath: (id: string) => string
  extractTitle: (data: unknown) => string | null
  fallbackLabel: string
  parentLabel: string
}

const ROUTE_PATTERNS: RoutePattern[] = [
  {
    prefix: '/app/purchases/',
    apiPath: (id) => `/api/purchases/${id}`,
    extractTitle: (data) => {
      const d = data as { reference?: string } | null
      return d?.reference ?? null
    },
    fallbackLabel: 'Purchase',
    parentLabel: 'Purchases',
  },
  {
    prefix: '/app/customers/',
    apiPath: (id) => `/api/customers/${id}`,
    extractTitle: (data) => {
      const d = data as { firstName?: string; lastName?: string; accountCode?: string } | null
      if (d?.accountCode) return d.accountCode
      if (d?.firstName && d?.lastName) return `${d.firstName} ${d.lastName}`
      return null
    },
    fallbackLabel: 'Account',
    parentLabel: 'Accounts',
  },
  {
    prefix: '/app/sales/',
    apiPath: (id) => `/api/sales/${id}`,
    extractTitle: (data) => {
      const d = data as { reference?: string } | null
      return d?.reference ?? null
    },
    fallbackLabel: 'Sale',
    parentLabel: 'Sales',
  },
  {
    prefix: '/app/expenses/',
    apiPath: (id) => `/api/expenses/${id}`,
    extractTitle: (data) => {
      const d = data as { reference?: string; description?: string } | null
      return d?.reference ?? d?.description ?? null
    },
    fallbackLabel: 'Expense',
    parentLabel: 'Expenses',
  },
  {
    prefix: '/app/stocktake/',
    apiPath: (id) => `/api/stocktake/${id}`,
    extractTitle: (data) => {
      const d = data as { name?: string; reference?: string } | null
      return d?.name ?? d?.reference ?? null
    },
    fallbackLabel: 'Stocktake',
    parentLabel: 'Stocktake',
  },
]

function matchRoute(pathname: string): { pattern: RoutePattern; id: string } | null {
  for (const pattern of ROUTE_PATTERNS) {
    if (pathname.startsWith(pattern.prefix) && pathname !== pattern.prefix.slice(0, -1)) {
      const id = pathname.slice(pattern.prefix.length).split('/')[0]
      if (id) return { pattern, id }
    }
  }
  return null
}

export function useRecordTitle(pathname: string): {
  title: string | null
  isLoading: boolean
  isDetailPage: boolean
  parentPath: string | null
  parentLabel: string | null
} {
  const match = matchRoute(pathname)

  const { data, isLoading } = useSWR(
    match ? match.pattern.apiPath(match.id) : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  if (!match) {
    return {
      title: null,
      isLoading: false,
      isDetailPage: false,
      parentPath: null,
      parentLabel: null,
    }
  }

  const title = data ? match.pattern.extractTitle(data) : null

  return {
    title: title ?? (isLoading ? '…' : match.pattern.fallbackLabel),
    isLoading,
    isDetailPage: true,
    parentPath: match.pattern.prefix.slice(0, -1), // Remove trailing slash
    parentLabel: match.pattern.parentLabel,
  }
}

export default useRecordTitle
