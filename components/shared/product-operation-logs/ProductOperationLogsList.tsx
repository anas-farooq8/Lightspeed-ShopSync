'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Package } from 'lucide-react'
import { ProductOperationLogItem, ProductOperationLogItemSkeleton } from '@/components/shared/product-operation-logs/ProductOperationLogItem'
import type { ProductOperationLog } from '@/components/shared/product-operation-logs/ProductOperationLogItem'

interface ProductOperationLogsListProps {
  /** Logs to display */
  logs: ProductOperationLog[]
  /** Show loading skeleton */
  loading?: boolean
  /** Error message to display */
  error?: string | null
  /** Max height for scrollable list (e.g. 660 for dashboard). Omit for full page. */
  maxHeight?: number
  /** Number of skeleton rows when loading */
  skeletonCount?: number
  /** Custom empty message */
  emptyMessage?: string
  /** Custom empty subtext */
  emptySubtext?: string
}

export function ProductOperationLogsList({
  logs,
  loading = false,
  error = null,
  maxHeight,
  skeletonCount = 4,
  emptyMessage = 'No product sync operations yet',
  emptySubtext = 'Create or edit products to see history here',
}: ProductOperationLogsListProps) {
  if (loading) {
    return (
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="divide-y divide-muted-foreground/40">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <ProductOperationLogItemSkeleton key={i} />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center justify-center py-6 sm:py-8 text-destructive text-sm sm:text-base px-4">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (logs.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 text-muted-foreground text-sm sm:text-base px-4">
          <Package className="h-10 w-10 mb-2 opacity-50" />
          <p>{emptyMessage}</p>
          <p className="text-xs mt-1">{emptySubtext}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardContent className="p-0">
        <div
          className={maxHeight != null ? 'overflow-y-auto overflow-x-hidden divide-y divide-muted-foreground/40' : 'divide-y divide-muted-foreground/40'}
          style={maxHeight != null ? { maxHeight: `${maxHeight}px` } : undefined}
        >
          {logs.map((log) => (
            <ProductOperationLogItem key={log.id} log={log} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
