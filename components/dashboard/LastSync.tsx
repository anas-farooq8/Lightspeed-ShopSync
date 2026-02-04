"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Clock, CheckCircle2, XCircle, Database, TrendingUp, TrendingDown, Store } from 'lucide-react'

interface LastSyncInfo {
  shop_id: string
  shop_name: string
  tld: string
  role: string
  base_url: string
  started_at: string
  completed_at: string
  duration_seconds: number
  status: string
  error_message: string | null
  products_fetched: number
  variants_fetched: number
  products_synced: number
  variants_synced: number
  products_deleted: number
  variants_deleted: number
  variants_filtered: number
}

export function LastSync() {
  const [syncInfo, setSyncInfo] = useState<LastSyncInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLastSync() {
      try {
        const response = await fetch('/api/last-sync')
        if (!response.ok) throw new Error('Failed to fetch last sync info')
        const data = await response.json()
        
        // Sort: source first, then targets sorted by TLD
        const sorted = Array.isArray(data) ? [...data].sort((a, b) => {
          // Source shops come first
          if (a.role === 'source' && b.role !== 'source') return -1
          if (a.role !== 'source' && b.role === 'source') return 1
          
          // Both are targets, sort by TLD
          return a.tld.localeCompare(b.tld)
        }) : []
        
        setSyncInfo(sorted)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load last sync information')
      } finally {
        setLoading(false)
      }
    }

    fetchLastSync()
  }, [])

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}m ${secs}s`
  }

  return (
    <div>
      {/* Heading - always visible */}
      <div className="mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Last Sync Status
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Most recent synchronization from Lightspeed API
        </p>
      </div>

      {loading ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-8 text-destructive text-base">
            {error}
          </CardContent>
        </Card>
      ) : syncInfo.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-8 text-muted-foreground text-base">
            No sync history available
          </CardContent>
        </Card>
      ) : (
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {syncInfo.map((sync) => (
              <div key={sync.shop_id} className="p-4 hover:bg-muted/30 transition-colors">
                {/* Shop Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-semibold text-base">{sync.shop_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {sync.role} · .{sync.tld}
                      </p>
                    </div>
                  </div>
                  {sync.status === 'success' ? (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-sm font-medium">Success</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-red-600">
                      <XCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Failed</span>
                    </div>
                  )}
                </div>

                {/* Sync Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {/* Started At */}
                  <div>
                    <span className="text-muted-foreground">Started:</span>
                    <p className="font-medium mt-0.5">{formatDateTime(sync.started_at)}</p>
                  </div>
                  
                  {/* Completed At */}
                  <div>
                    <span className="text-muted-foreground">Completed:</span>
                    <p className="font-medium mt-0.5">{formatDateTime(sync.completed_at)}</p>
                  </div>
                  
                  {/* Duration */}
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <p className="font-medium mt-0.5">{formatDuration(sync.duration_seconds)}</p>
                  </div>
                  
                  {/* Products */}
                  <div>
                    <span className="text-muted-foreground">Products:</span>
                    <p className="font-medium mt-0.5">
                      <span className="text-blue-600">{sync.products_fetched.toLocaleString()}</span> fetched, 
                      <span className="text-green-600"> {sync.products_synced.toLocaleString()}</span> synced
                      {sync.products_deleted > 0 && (
                        <>, <span className="text-red-600">{sync.products_deleted.toLocaleString()}</span> deleted</>
                      )}
                    </p>
                  </div>
                  
                  {/* Variants */}
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Variants:</span>
                    <p className="font-medium mt-0.5">
                      <span className="text-blue-600">{sync.variants_fetched.toLocaleString()}</span> fetched, 
                      <span className="text-green-600"> {sync.variants_synced.toLocaleString()}</span> synced
                      {sync.variants_deleted > 0 && (
                        <>, <span className="text-red-600">{sync.variants_deleted.toLocaleString()}</span> deleted</>
                      )}
                      {sync.variants_filtered > 0 && (
                        <>, <span className="text-yellow-600">{sync.variants_filtered.toLocaleString()}</span> filtered</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Error message if any */}
                {sync.error_message && (
                  <div className="mt-3 pt-3 border-t border-red-500/20">
                    <p className="text-sm text-red-600">
                      <span className="font-medium">Error:</span> {sync.error_message}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
