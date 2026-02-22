"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, CheckCircle2, XCircle, Store, ExternalLink } from 'lucide-react'
import { sortShopsSourceFirstThenByTld, formatDateTime, toSafeExternalHref } from '@/lib/utils'

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

interface LastSyncProps {
  /** When provided, skip fetch and use this data (enables parallel fetch from parent) */
  data?: LastSyncInfo[] | null
  loading?: boolean
  error?: string | null
}

export function LastSync({ data: dataProp, loading: loadingProp, error: errorProp }: LastSyncProps = {}) {
  const [syncInfo, setSyncInfo] = useState<LastSyncInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isControlled = dataProp !== undefined
  const syncInfoDisplay = isControlled ? (dataProp ?? []) : syncInfo
  const loadingDisplay = isControlled ? (loadingProp ?? false) : loading
  const errorDisplay = isControlled ? errorProp : error

  useEffect(() => {
    if (isControlled) return

    async function fetchLastSync() {
      try {
        const response = await fetch('/api/last-sync')
        if (!response.ok) throw new Error('Failed to fetch last sync info')
        const data = await response.json()
        setSyncInfo(sortShopsSourceFirstThenByTld(data))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load last sync information')
      } finally {
        setLoading(false)
      }
    }

    fetchLastSync()
  }, [isControlled])

  return (
    <div className="min-w-0">
      {/* Heading - always visible */}
      <div className="mb-2 sm:mb-3">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
          Last Sync Status
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Most recent synchronization from Lightspeed API
        </p>
      </div>

      {loadingDisplay ? (
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 sm:p-4 animate-pulse min-w-0 overflow-hidden">
                  {/* Shop Header - matches flex flex-col sm:flex-row sm:items-center sm:justify-between */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2 sm:mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="h-4 w-4 sm:h-5 sm:w-5 rounded bg-muted shrink-0" />
                      <div className="flex-1 min-w-0 space-y-1 overflow-hidden">
                        {/* Shop name (e.g. VerpakkingenXL) */}
                        <div className="h-4 sm:h-[1.0625rem] bg-muted rounded w-3/4 sm:w-2/3 max-w-full" />
                        {/* Source (e.g. source · .nl) */}
                        <div className="h-3 bg-muted rounded w-24" />
                      </div>
                    </div>
                    <div className="h-4 bg-muted rounded w-16 shrink-0 self-start sm:self-center" />
                  </div>
                  {/* Sync Details - matches space-y-2 sm:space-y-3 with 3 sections */}
                  <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm min-w-0">
                    {/* Started & Completed */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 min-w-0">
                      <div>
                        <div className="h-3 bg-muted rounded w-14 mb-0.5" />
                        <div className="h-4 bg-muted rounded w-full" />
                      </div>
                      <div>
                        <div className="h-3 bg-muted rounded w-20 mb-0.5" />
                        <div className="h-4 bg-muted rounded w-full" />
                      </div>
                    </div>
                    {/* Products & Variants */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 min-w-0">
                      <div>
                        <div className="h-3 bg-muted rounded w-16 mb-0.5" />
                        <div className="h-4 bg-muted rounded w-full" />
                      </div>
                      <div>
                        <div className="h-3 bg-muted rounded w-14 mb-0.5" />
                        <div className="h-4 bg-muted rounded w-full" />
                      </div>
                    </div>
                    {/* Duration */}
                    <div>
                      <div className="h-3 bg-muted rounded w-14 mb-0.5" />
                      <div className="h-4 bg-muted rounded w-12" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : errorDisplay ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-6 sm:py-8 text-destructive text-sm sm:text-base px-4">
            {errorDisplay}
          </CardContent>
        </Card>
      ) : syncInfoDisplay.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-6 sm:py-8 text-muted-foreground text-sm sm:text-base px-4">
            No sync history available
          </CardContent>
        </Card>
      ) : (
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {syncInfoDisplay.map((sync) => (
              <div key={sync.shop_id} className="p-3 sm:p-4 hover:bg-muted/30 transition-colors">
                {/* Shop Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2 sm:mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Store className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base truncate">
                        {(() => {
                          const href = toSafeExternalHref(sync.base_url)
                          if (!href) return sync.shop_name
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate hover:text-primary transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title={sync.base_url}
                            >
                              {sync.shop_name}
                              <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                            </a>
                          )
                        })()}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {sync.role} · .{sync.tld}
                      </p>
                    </div>
                  </div>
                  {sync.status === 'success' ? (
                    <div className="flex items-center gap-1.5 text-green-600 shrink-0">
                      <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="text-xs sm:text-sm font-medium">Success</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-red-600 shrink-0">
                      <XCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="text-xs sm:text-sm font-medium">Failed</span>
                    </div>
                  )}
                </div>

                {/* Sync Details */}
                <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                  {/* Started & Completed */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <span className="text-muted-foreground">Started:</span>
                      <p className="font-medium mt-0.5">{formatDateTime(sync.started_at)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Completed:</span>
                      <p className="font-medium mt-0.5">{formatDateTime(sync.completed_at)}</p>
                    </div>
                  </div>

                  {/* Products & Variants side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div>
                      <span className="text-muted-foreground">Products:</span>
                      <p className="font-medium mt-0.5 break-words">
                        <span className="text-blue-600">{sync.products_fetched.toLocaleString()}</span> fetched, 
                        <span className="text-green-600"> {sync.products_synced.toLocaleString()}</span> synced
                        {sync.products_deleted > 0 && (
                          <>, <span className="text-red-600">{sync.products_deleted.toLocaleString()}</span> deleted</>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Variants:</span>
                      <p className="font-medium mt-0.5 break-words">
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

                  {/* Duration below */}
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <p className="font-medium mt-0.5">{sync.duration_seconds.toFixed(2)}s</p>
                  </div>
                </div>

                {/* Error message if any */}
                {sync.error_message && (
                  <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-red-500/20">
                    <p className="text-xs sm:text-sm text-red-600 break-words">
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
