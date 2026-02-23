"use client"

import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { ProductOperationLogsList } from '@/components/shared/product-operation-logs/ProductOperationLogsList'
import type { ProductOperationLog } from '@/components/shared/product-operation-logs/ProductOperationLogItem'

interface ProductOperationLogsCardProps {
  /** When provided, skip fetch and use this data (enables parallel fetch from parent) */
  data?: ProductOperationLog[] | null
  loading?: boolean
  error?: string | null
}

export function ProductOperationLogsCard({ data: dataProp, loading: loadingProp, error: errorProp }: ProductOperationLogsCardProps = {}) {
  const [logs, setLogs] = useState<ProductOperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isControlled = dataProp !== undefined
  const logsDisplay = isControlled ? (dataProp ?? []) : logs
  const loadingDisplay = isControlled ? (loadingProp ?? false) : loading
  const errorDisplay = isControlled ? errorProp : error

  useEffect(() => {
    if (isControlled) return

    async function fetchLogs() {
      try {
        const response = await fetch('/api/last-product-operation')
        if (!response.ok) throw new Error('Failed to fetch product operation logs')
        const data = await response.json()
        setLogs(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product operation logs')
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [isControlled])

  return (
    <div className="min-w-0">
      <div className="mb-2 sm:mb-3">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
          Product Sync Operations
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Create and edit history across shops
        </p>
      </div>

      <ProductOperationLogsList
        logs={logsDisplay}
        loading={loadingDisplay}
        error={errorDisplay}
        maxHeight={660}
        skeletonCount={4}
      />
    </div>
  )
}
