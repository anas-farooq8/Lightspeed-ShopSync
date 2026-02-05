'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { SyncLog } from '@/types/database'
import { SyncLogCard } from '@/components/dashboard/SyncLogCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Filter, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { sortShopsSourceFirstThenByTld, getShopRoleLabel } from '@/lib/utils'

const ITEMS_PER_DATE = 20
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', DATE_OPTIONS)

interface DateGroup {
  date: string
  logs: SyncLog[]
  displayCount: number
}

interface Shop {
  tld: string
  role: string
}

interface SyncLogsResponse {
  syncLogs: SyncLog[]
  totalDates: number
  totalPages: number
  currentPage: number
  shops: Shop[]
}

function SyncLogsPageHeader() {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold mb-1">Sync Logs</h1>
      <p className="text-sm text-muted-foreground">
        Monitor synchronization operations with Lightspeed API
      </p>
    </div>
  )
}

export default function SyncLogsPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [isFilterLoading, setIsFilterLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shopFilter, setShopFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [dateDisplayCounts, setDateDisplayCounts] = useState<Map<string, number>>(new Map())
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [totalDates, setTotalDates] = useState(0)

  const fetchSyncLogs = useCallback(async (
    page: number = 1,
    overrides?: { shop?: string; status?: string }
  ) => {
    const shop = overrides?.shop ?? shopFilter
    const status = overrides?.status ?? statusFilter
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        shop,
        status
      })
      
      const response = await fetch(`/api/sync-logs?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch sync logs')
      }
      
      const data: SyncLogsResponse = await response.json()
      setSyncLogs(data.syncLogs || [])
      setShops(sortShopsSourceFirstThenByTld(data.shops))
      setTotalPages(data.totalPages || 0)
      setTotalDates(data.totalDates || 0)
      setCurrentPage(data.currentPage || 1)
      
      // Expand the most recent date by default
      if (data.syncLogs.length > 0) {
        const mostRecentDate = formatDate(data.syncLogs[0].started_at)
        setExpandedDates(new Set([mostRecentDate]))
      } else {
        setExpandedDates(new Set())
      }
      
      // Reset display counts
      setDateDisplayCounts(new Map())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [shopFilter, statusFilter])

  useEffect(() => {
    fetchSyncLogs(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleShopFilterChange = useCallback((value: string) => {
    setShopFilter(value)
    setIsFilterLoading(true)
    fetchSyncLogs(1, { shop: value }).finally(() => setIsFilterLoading(false))
  }, [fetchSyncLogs])

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value)
    setIsFilterLoading(true)
    fetchSyncLogs(1, { status: value }).finally(() => setIsFilterLoading(false))
  }, [fetchSyncLogs])

  const groupedByDate = useMemo<DateGroup[]>(() => {
    const dateMap = new Map<string, SyncLog[]>()
    for (const log of syncLogs) {
      const date = formatDate(log.started_at)
      const arr = dateMap.get(date) ?? []
      arr.push(log)
      dateMap.set(date, arr)
    }
    return Array.from(dateMap.entries()).map(([date, logs]) => ({
      date,
      logs,
      displayCount: dateDisplayCounts.get(date) ?? ITEMS_PER_DATE
    }))
  }, [syncLogs, dateDisplayCounts])

  const toggleDate = useCallback((date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }, [])

  const showMoreForDate = useCallback((date: string) => {
    setDateDisplayCounts(prev => {
      const next = new Map(prev)
      next.set(date, (next.get(date) ?? ITEMS_PER_DATE) + ITEMS_PER_DATE)
      return next
    })
  }, [])

  const handlePageChange = useCallback((page: number) => {
    fetchSyncLogs(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [fetchSyncLogs])

  const hasNoData = totalDates === 0 && syncLogs.length === 0
  const hasActiveFilters = shopFilter !== 'all' || statusFilter !== 'all'

  const paginationPages = useMemo(() => {
    const max = 7
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (currentPage <= 4) return Array.from({ length: max }, (_, i) => i + 1)
    if (currentPage >= totalPages - 3) return Array.from({ length: max }, (_, i) => totalPages - 6 + i)
    return Array.from({ length: max }, (_, i) => currentPage - 3 + i)
  }, [totalPages, currentPage])

  return (
    <div className="w-full h-full p-6">
      <div className="max-w-full mx-auto">
        {/* Global Loading Shimmer */}
        <LoadingShimmer show={isFilterLoading} position="top" />
        
        <SyncLogsPageHeader />

        {loading && syncLogs.length === 0 ? (
          <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
            <div className="text-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading sync logs...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />

              <Select value={shopFilter} onValueChange={handleShopFilterChange} disabled={isFilterLoading}>
                <SelectTrigger className="w-[180px] h-10 cursor-pointer">
                  <SelectValue placeholder="All Shops" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="cursor-pointer">All Shops</SelectItem>
                  {shops.map(shop => (
                    <SelectItem key={shop.tld} value={shop.tld} className="cursor-pointer">
                      {shop.tld.toUpperCase()} - {getShopRoleLabel(shop.role) || 'Target'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={handleStatusFilterChange} disabled={isFilterLoading}>
                <SelectTrigger className="w-[180px] h-10 cursor-pointer">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="cursor-pointer">All Status</SelectItem>
                  <SelectItem value="success" className="cursor-pointer">Success</SelectItem>
                  <SelectItem value="error" className="cursor-pointer">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && hasNoData && !hasActiveFilters && (
          <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 300px)' }}>
            <div className="text-center">
              <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold mb-1">No Sync Operations Yet</h3>
              <p className="text-sm text-muted-foreground">
                Sync operations will appear here once the Python sync script has been run.
              </p>
            </div>
          </div>
        )}

        {!error && hasNoData && hasActiveFilters && (
          <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 300px)' }}>
            <div className="text-center">
              <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold mb-1">No Results</h3>
              <p className="text-sm text-muted-foreground">
                Try adjusting your filters to see more results.
              </p>
            </div>
          </div>
        )}

        {/* Sync Logs Grouped by Date */}
        {!error && syncLogs.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing page {currentPage} of {totalPages}
              </span>
              {totalPages > 1 && (
                <span>Total: {totalDates} day{totalDates !== 1 ? 's' : ''}</span>
              )}
            </div>
            
            <div className="space-y-3">
              {groupedByDate.map((group) => {
                const isExpanded = expandedDates.has(group.date)
                const displayLogs = group.logs.slice(0, group.displayCount)
                const hasMore = group.logs.length > group.displayCount

                return (
                  <div key={group.date} className="border rounded-lg overflow-hidden">
                    {/* Date Header */}
                    <button
                      onClick={() => toggleDate(group.date)}
                      className="w-full px-4 py-3 bg-muted/50 hover:bg-muted/70 transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-base">{group.date}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {group.logs.length} sync{group.logs.length !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {/* Logs List */}
                    {isExpanded && (
                      <div className="p-4 space-y-3">
                        {displayLogs.map((log) => (
                          <SyncLogCard key={log.id} log={log} />
                        ))}
                        
                        {hasMore && (
                          <div className="flex justify-center pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => showMoreForDate(group.date)}
                              className="cursor-pointer"
                            >
                              Show More ({group.logs.length - group.displayCount} remaining)
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="cursor-pointer"
                >
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {paginationPages.map((pageNum) => (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      disabled={loading}
                      className="cursor-pointer w-9"
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
                  className="cursor-pointer"
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
    </div>
  )
}
