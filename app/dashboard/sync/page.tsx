'use client'

import { useState, useEffect } from 'react'
import { SyncLog } from '@/types/variant'
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

const ITEMS_PER_DATE = 20

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

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  const [dateDisplayCounts, setDateDisplayCounts] = useState<Map<string, number>>(new Map())
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [totalDates, setTotalDates] = useState(0)

  const fetchSyncLogs = async (page: number = 1) => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        shop: shopFilter,
        status: statusFilter
      })
      
      const response = await fetch(`/api/sync-logs?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch sync logs')
      }
      
      const data: SyncLogsResponse = await response.json()
      setSyncLogs(data.syncLogs || [])
      setShops(data.shops || [])
      setTotalPages(data.totalPages || 0)
      setTotalDates(data.totalDates || 0)
      setCurrentPage(data.currentPage || 1)
      
      // Expand the most recent date by default
      if (data.syncLogs.length > 0) {
        const mostRecentDate = new Date(data.syncLogs[0].started_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
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
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    fetchSyncLogs(1)
  }, [])

  // Apply filters - refetch from API
  useEffect(() => {
    if (!initialLoading) {
      fetchSyncLogs(1)
    }
  }, [shopFilter, statusFilter])

  // Group logs by date
  const groupedByDate: DateGroup[] = []
  const dateMap = new Map<string, SyncLog[]>()

  syncLogs.forEach(log => {
    const date = new Date(log.started_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    
    if (!dateMap.has(date)) {
      dateMap.set(date, [])
    }
    dateMap.get(date)!.push(log)
  })

  dateMap.forEach((logs, date) => {
    groupedByDate.push({
      date,
      logs,
      displayCount: dateDisplayCounts.get(date) || ITEMS_PER_DATE
    })
  })

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev)
      if (newSet.has(date)) {
        newSet.delete(date)
      } else {
        newSet.add(date)
      }
      return newSet
    })
  }

  const showMoreForDate = (date: string) => {
    setDateDisplayCounts(prev => {
      const newMap = new Map(prev)
      const currentCount = newMap.get(date) || ITEMS_PER_DATE
      newMap.set(date, currentCount + ITEMS_PER_DATE)
      return newMap
    })
  }

  const handlePageChange = (page: number) => {
    fetchSyncLogs(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Show full-page loading only on initial load
  if (initialLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading sync logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full p-6">
      <div className="max-w-full mx-auto">
        {/* Page Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-1">Sync Status</h1>
          <p className="text-sm text-muted-foreground">
            Monitor synchronization operations with Lightspeed API
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={shopFilter} onValueChange={setShopFilter} disabled={loading}>
              <SelectTrigger className="w-[180px] cursor-pointer">
                <SelectValue placeholder="All Shops" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">All Shops</SelectItem>
                {shops.map(shop => (
                  <SelectItem key={shop.tld} value={shop.tld} className="cursor-pointer">
                    {shop.tld.toUpperCase()} - {shop.role === 'source' ? 'Source' : 'Target'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && !initialLoading && (
              <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter} disabled={loading}>
            <SelectTrigger className="w-[140px] cursor-pointer">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="cursor-pointer">All Status</SelectItem>
              <SelectItem value="success" className="cursor-pointer">Success</SelectItem>
              <SelectItem value="error" className="cursor-pointer">Error</SelectItem>
              <SelectItem value="running" className="cursor-pointer">Running</SelectItem>
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

        {/* Empty State - Centered in viewport */}
        {!error && syncLogs.length === 0 && totalDates === 0 && shopFilter === 'all' && statusFilter === 'all' && (
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

        {/* No Results After Filter - Centered in viewport */}
        {!error && syncLogs.length === 0 && totalDates === 0 && (shopFilter !== 'all' || statusFilter !== 'all') && (
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
                Showing page {currentPage} of {totalPages} ({groupedByDate.length} day{groupedByDate.length !== 1 ? 's' : ''} on this page)
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
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 7) {
                      pageNum = i + 1
                    } else if (currentPage <= 4) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i
                    } else {
                      pageNum = currentPage - 3 + i
                    }

                    return (
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
                    )
                  })}
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
      </div>
    </div>
  )
}
