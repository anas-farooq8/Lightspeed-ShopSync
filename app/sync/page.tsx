'use client'

import { useState, useEffect } from 'react'
import { SyncLog } from '@/types/variant'
import { SyncLogCard } from '@/components/dashboard/SyncLogCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RefreshCw, Info, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSyncLogs()
  }, [])

  return (
    <div className="container mx-auto py-6 px-4">
      {/* Page Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Sync Status</h1>
          <p className="text-sm text-muted-foreground">
            Monitor synchronization operations between Lightspeed and our database
          </p>
        </div>
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

      {/* Information Alert */}
      <Alert className="mb-6 border-blue-200 bg-blue-50">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertTitle className="text-blue-900">About Sync Operations</AlertTitle>
        <AlertDescription className="text-blue-800 text-sm">
          <p className="mb-2">
            These sync operations keep our database synchronized with the Lightspeed eCom shops. 
            Each sync operation fetches products and variants from the Lightspeed API and updates our local database.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong>Fetched:</strong> Number of products/variants retrieved from Lightspeed API</li>
            <li><strong>Synced:</strong> Number of products/variants inserted or updated in our database</li>
            <li><strong>Deleted:</strong> Number of products/variants removed from our database (no longer exist in Lightspeed)</li>
            <li><strong>Filtered:</strong> Number of orphaned variants filtered out (variants without a parent product)</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
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
      {!loading && !error && syncLogs.length === 0 && (
        <div className="text-center py-12">
          <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-lg font-semibold mb-1">No Sync Operations Yet</h3>
          <p className="text-sm text-muted-foreground">
            Sync operations will appear here once the Python sync script has been run.
          </p>
        </div>
      )}

      {/* Sync Logs Grid */}
      {!loading && !error && syncLogs.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Showing {syncLogs.length} most recent sync operation{syncLogs.length !== 1 ? 's' : ''}
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {syncLogs.map((log) => (
              <SyncLogCard key={log.id} log={log} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
