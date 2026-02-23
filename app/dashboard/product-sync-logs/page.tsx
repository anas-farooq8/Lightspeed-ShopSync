'use client'

import { Suspense } from 'react'
import { ProductSyncLogsTab } from '@/components/product-sync-logs/ProductSyncLogsTab'
import { ProductOperationLogsList } from '@/components/shared/product-operation-logs/ProductOperationLogsList'

export default function ProductSyncLogsPage() {
  return (
    <div className="w-full h-full p-4 sm:p-5 md:p-6">
      <div className="max-w-full mx-auto min-w-0">
        <div className="mb-4 sm:mb-5">
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Product Sync Logs</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Create and edit history across shops
          </p>
        </div>

        <Suspense fallback={<ProductOperationLogsList logs={[]} loading skeletonCount={5} />}>
          <ProductSyncLogsTab />
        </Suspense>
      </div>
    </div>
  )
}
