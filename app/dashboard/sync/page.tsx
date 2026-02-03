'use client'

import { useState, useEffect } from 'react'
import { SyncLog } from '@/types/variant'
import { SyncLogCard } from '@/components/dashboard/SyncLogCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RefreshCw, AlertCircle, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ITEMS_PER_PAGE = 100

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const fetchSyncLogs = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/sync-logs')
      
      if (!response.ok) {
        throw new Error('Failed to fetch sync logs')
      }
      
      const data = await response.json()
      setSyncLogs(data.syncLogs || [])
      setFilteredLogs(data.syncLogs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    fetchSyncLogs()
  }, [])

  // Apply filters and reset to page 1
  useEffect(() => {
    let filtered = [...syncLogs]

    // Shop filter
    if (shopFilter !== 'all') {
      filtered = filtered.filter(log => log.shop_tld === shopFilter)
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(log => log.status === statusFilter)
    }

    setFilteredLogs(filtered)
    setCurrentPage(1) // Reset to first page when filters change
  }, [shopFilter, statusFilter, syncLogs])

  // Get unique shops with their info
  const shops = Array.from(new Set(syncLogs.map(log => log.shop_tld)))
    .map(tld => {
      const log = syncLogs.find(l => l.shop_tld === tld)
      return {
        tld: tld || 'unknown',
        role: log?.shop_role || 'unknown'
      }
    })
    .sort((a, b) => {
      // First sort by role: source comes before target
      if (a.role !== b.role) {
        return a.role === 'source' ? -1 : 1
      }
      // Then sort alphabetically by TLD within the same role
      return a.tld.toLowerCase().localeCompare(b.tld.toLowerCase())
    })

  // Pagination calculations
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const currentLogs = filteredLogs.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
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
            <Select value={shopFilter} onValueChange={setShopFilter}>
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
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        {!error && filteredLogs.length === 0 && syncLogs.length === 0 && (
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
        {!error && filteredLogs.length === 0 && syncLogs.length > 0 && (
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

        {/* Sync Logs Grid */}
        {!error && filteredLogs.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {startIndex + 1}-{Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} sync operation{filteredLogs.length !== 1 ? 's' : ''}
              </span>
              {totalPages > 1 && (
                <span>Page {currentPage} of {totalPages}</span>
              )}
            </div>
            
            <div className="space-y-3">
              {currentLogs.map((log) => (
                <SyncLogCard key={log.id} log={log} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
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
                  disabled={currentPage === totalPages}
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
