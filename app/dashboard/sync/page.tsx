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

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

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
    }
  }

  useEffect(() => {
    fetchSyncLogs()
  }, [])

  // Apply filters
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
  }, [shopFilter, statusFilter, syncLogs])

  const shops = Array.from(new Set(syncLogs.map(log => log.shop_tld)))

  return (
    <div className="w-full h-full p-6">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-1">Sync Status</h1>
          <p className="text-sm text-muted-foreground">
            Monitor synchronization operations with Lightspeed API
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={shopFilter} onValueChange={setShopFilter}>
              <SelectTrigger className="w-[140px] cursor-pointer">
                <SelectValue placeholder="All Shops" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">All Shops</SelectItem>
                {shops.map(shop => (
                  <SelectItem key={shop} value={shop || 'unknown'} className="cursor-pointer">
                    {(shop || 'unknown').toUpperCase()}
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

          <div className="ml-auto">
            <Button
              onClick={fetchSyncLogs}
              disabled={loading}
              size="sm"
              className="gap-2 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading sync logs...</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-lg font-semibold mb-1">
              {syncLogs.length === 0 ? 'No Sync Operations Yet' : 'No Results'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {syncLogs.length === 0 
                ? 'Sync operations will appear here once the Python sync script has been run.'
                : 'Try adjusting your filters to see more results.'}
            </p>
          </div>
        )}

        {/* Sync Logs Grid */}
        {!loading && !error && filteredLogs.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Showing {filteredLogs.length} of {syncLogs.length} sync operation{syncLogs.length !== 1 ? 's' : ''}
            </div>
            
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <SyncLogCard key={log.id} log={log} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
