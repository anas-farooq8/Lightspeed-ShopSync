'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ProductOperationLogsList } from '@/components/shared/product-operation-logs/ProductOperationLogsList'
import type { ProductOperationLog } from '@/components/shared/product-operation-logs/ProductOperationLogItem'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Filter, AlertCircle, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { sortShopsSourceFirstThenByTld, getShopRoleLabel } from '@/lib/utils'

interface Shop {
  tld: string
  role: string
}

interface ProductOperationLogsResponse {
  data: ProductOperationLog[]
  totalCount: number
  totalPages: number
  currentPage: number
  shops: Shop[]
}

const VALID_OPERATIONS = ['all', 'create', 'edit']
const VALID_STATUSES = ['all', 'success', 'error']

function parseSearchParams(searchParams: URLSearchParams) {
  const shop = searchParams.get('shop') || 'all'
  const operation = searchParams.get('operation') || 'all'
  const status = searchParams.get('status') || 'all'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  return {
    shop,
    operation: VALID_OPERATIONS.includes(operation) ? operation : 'all',
    status: VALID_STATUSES.includes(status) ? status : 'all',
    page,
  }
}

export function ProductSyncLogsTab() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlState = useMemo(() => parseSearchParams(searchParams), [searchParams])

  const [logs, setLogs] = useState<ProductOperationLog[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [isFilterLoading, setIsFilterLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shopFilter, setShopFilter] = useState(urlState.shop)
  const [operationFilter, setOperationFilter] = useState(urlState.operation)
  const [statusFilter, setStatusFilter] = useState(urlState.status)
  const [currentPage, setCurrentPage] = useState(urlState.page)
  const [totalPages, setTotalPages] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Sync URL -> state when URL changes (e.g. back/forward)
  useEffect(() => {
    setShopFilter(urlState.shop)
    setOperationFilter(urlState.operation)
    setStatusFilter(urlState.status)
    setCurrentPage(urlState.page)
  }, [urlState.shop, urlState.operation, urlState.status, urlState.page])

  const updateUrl = useCallback(
    (updates: { shop?: string; operation?: string; status?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString())
      if (updates.shop !== undefined) {
        if (updates.shop === 'all') params.delete('shop')
        else params.set('shop', updates.shop)
      }
      if (updates.operation !== undefined) {
        if (updates.operation === 'all') params.delete('operation')
        else params.set('operation', updates.operation)
      }
      if (updates.status !== undefined) {
        if (updates.status === 'all') params.delete('status')
        else params.set('status', updates.status)
      }
      if (updates.page !== undefined) {
        if (updates.page === 1) params.delete('page')
        else params.set('page', updates.page.toString())
      }
      const query = params.toString()
      router.push(`/dashboard/product-sync-logs${query ? `?${query}` : ''}`, { scroll: false })
    },
    [router, searchParams]
  )

  const fetchLogs = useCallback(
    async (page: number = 1, overrides?: { shop?: string; operation?: string; status?: string }) => {
      const shop = overrides?.shop ?? shopFilter
      const operation = overrides?.operation ?? operationFilter
      const status = overrides?.status ?? statusFilter
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ page: page.toString() })
        if (shop !== 'all') params.set('shop', shop)
        if (operation !== 'all') params.set('operation_type', operation)
        if (status !== 'all') params.set('status', status)

        const response = await fetch(`/api/product-operation-logs?${params}`)

        if (!response.ok) throw new Error('Failed to fetch product operation logs')

        const data: ProductOperationLogsResponse = await response.json()
        setLogs(data.data ?? [])
        setShops(sortShopsSourceFirstThenByTld(data.shops ?? []))
        setTotalPages(data.totalPages ?? 0)
        setTotalCount(data.totalCount ?? 0)
        setCurrentPage(data.currentPage ?? 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      } finally {
        setLoading(false)
        setIsFilterLoading(false)
      }
    },
    [shopFilter, operationFilter, statusFilter]
  )

  useEffect(() => {
    fetchLogs(urlState.page, {
      shop: urlState.shop,
      operation: urlState.operation,
      status: urlState.status,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.shop, urlState.operation, urlState.status, urlState.page])

  const handleShopFilterChange = useCallback(
    (value: string) => {
      setShopFilter(value)
      setIsFilterLoading(true)
      updateUrl({ shop: value, page: 1 })
    },
    [updateUrl]
  )

  const handleOperationFilterChange = useCallback(
    (value: string) => {
      setOperationFilter(value)
      setIsFilterLoading(true)
      updateUrl({ operation: value, page: 1 })
    },
    [updateUrl]
  )

  const handleStatusFilterChange = useCallback(
    (value: string) => {
      setStatusFilter(value)
      setIsFilterLoading(true)
      updateUrl({ status: value, page: 1 })
    },
    [updateUrl]
  )

  const handlePageChange = useCallback(
    (page: number) => {
      updateUrl({ page })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [updateUrl]
  )

  const hasNoData = totalCount === 0 && logs.length === 0
  const hasActiveFilters = shopFilter !== 'all' || operationFilter !== 'all' || statusFilter !== 'all'

  const paginationPages = useMemo(() => {
    const max = 7
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (currentPage <= 4) return Array.from({ length: max }, (_, i) => i + 1)
    if (currentPage >= totalPages - 3) return Array.from({ length: max }, (_, i) => totalPages - 6 + i)
    return Array.from({ length: max }, (_, i) => currentPage - 3 + i)
  }, [totalPages, currentPage])

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      <LoadingShimmer show={loading && logs.length === 0} position="top" />

      {loading && logs.length === 0 ? (
        <>
          {/* Filter row skeleton - matches sync-logs page */}
          <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="h-9 sm:h-10 bg-muted rounded-md flex-1 min-w-[140px] sm:flex-initial sm:w-[180px] animate-pulse" />
            <div className="h-9 sm:h-10 bg-muted rounded-md flex-1 min-w-[140px] sm:flex-initial sm:w-[180px] animate-pulse" />
            <div className="h-9 sm:h-10 bg-muted rounded-md flex-1 min-w-[140px] sm:flex-initial sm:w-[180px] animate-pulse" />
          </div>

          {/* Card with skeleton rows - same as dashboard */}
          <ProductOperationLogsList logs={[]} loading skeletonCount={5} />
        </>
      ) : (
        <>
          <div className="flex flex-row flex-wrap items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={shopFilter} onValueChange={handleShopFilterChange} disabled={isFilterLoading}>
              <SelectTrigger className="flex-1 min-w-0 sm:flex-initial sm:w-[180px] h-9 sm:h-10 cursor-pointer">
                <SelectValue placeholder="All Shops" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">
                  All Shops
                </SelectItem>
                {shops.map((shop) => (
                  <SelectItem key={shop.tld} value={shop.tld} className="cursor-pointer">
                    {shop.tld.toUpperCase()} - {getShopRoleLabel(shop.role) || 'Target'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={operationFilter} onValueChange={handleOperationFilterChange} disabled={isFilterLoading}>
              <SelectTrigger className="flex-1 min-w-0 sm:flex-initial sm:w-[180px] h-9 sm:h-10 cursor-pointer">
                <SelectValue placeholder="All Operations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">
                  All Operations
                </SelectItem>
                <SelectItem value="create" className="cursor-pointer">
                  Create
                </SelectItem>
                <SelectItem value="edit" className="cursor-pointer">
                  Edit
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusFilterChange} disabled={isFilterLoading}>
              <SelectTrigger className="flex-1 min-w-0 sm:flex-initial sm:w-[180px] h-9 sm:h-10 cursor-pointer">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">
                  All Status
                </SelectItem>
                <SelectItem value="success" className="cursor-pointer">
                  Success
                </SelectItem>
                <SelectItem value="error" className="cursor-pointer">
                  Error
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-3 sm:mb-4 text-xs sm:text-sm">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <AlertDescription className="text-xs sm:text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {!error && hasNoData && !hasActiveFilters && (
            <div className="flex items-center justify-center min-h-[200px] sm:min-h-[calc(100vh-300px)]">
              <div className="text-center px-4">
                <Package className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-2 sm:mb-3 opacity-50" />
                <h3 className="text-base sm:text-lg font-semibold mb-1">No Product Sync Operations Yet</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Create or edit products to see history here.
                </p>
              </div>
            </div>
          )}

          {!error && hasNoData && hasActiveFilters && (
            <div className="flex items-center justify-center min-h-[200px] sm:min-h-[calc(100vh-300px)]">
              <div className="text-center px-4">
                <Filter className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-2 sm:mb-3 opacity-50" />
                <h3 className="text-base sm:text-lg font-semibold mb-1">No Results</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Try adjusting your filters to see more results.
                </p>
              </div>
            </div>
          )}

          {!error && logs.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm text-muted-foreground">
                <span>
                  Showing page {currentPage} of {totalPages || 1}
                </span>
                <span>Total: {totalCount} entr{totalCount !== 1 ? 'ies' : 'y'}</span>
              </div>

              <ProductOperationLogsList logs={logs} />

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-3 sm:pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="cursor-pointer min-h-[36px] sm:min-h-0 touch-manipulation"
                  >
                    Previous
                  </Button>

                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {paginationPages.map((pageNum) => (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                        disabled={loading}
                        className="cursor-pointer w-8 sm:w-9 min-h-[36px] sm:min-h-0 touch-manipulation"
                      >
                        {pageNum}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || loading}
                    className="cursor-pointer min-h-[36px] sm:min-h-0 touch-manipulation"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
