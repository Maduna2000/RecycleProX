'use client'

import { PortalPage } from '@/components/rpx'
import { OrdersTab } from './ScaleTabs'

export default function ScaleOrdersPage() {
  return (
    // maxWidth matches src/lib/pageWidthCaps.ts, which PageTitleBar reads to
    // cap/border itself to match — every column on Orders already has a
    // fixed width, so an uncapped page just left a large dead gutter beside
    // the table instead of stretching any column into it.
    <PortalPage maxWidth={1100}>
      <OrdersTab />
    </PortalPage>
  )
}
