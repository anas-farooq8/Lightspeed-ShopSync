"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Store, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sortShopsSourceFirstThenByTld, toSafeExternalHref } from '@/lib/utils'
import type { DashboardKpi } from '@/types/database'

export function StatsCards() {
  const [kpis, setKpis] = useState<DashboardKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats')
        if (!response.ok) throw new Error('Failed to fetch stats')
        const data = await response.json()
        setKpis(sortShopsSourceFirstThenByTld(data))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return (
    <div className="mb-4 sm:mb-6">
      {/* KPI Section Heading - always visible */}
      <div className="mb-2 sm:mb-3">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
          Shop Statistics
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Product inventory and SKU metrics across all shops
        </p>
      </div>

      {loading ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-12 sm:py-16">
            <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-8 sm:py-12 text-destructive text-sm sm:text-base px-4">
            {error}
          </CardContent>
        </Card>
      ) : kpis.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-8 sm:py-12 text-muted-foreground text-sm sm:text-base px-4">
            No shop data available
          </CardContent>
        </Card>
      ) : (
      <div
        className={cn(
          'grid gap-2 sm:gap-3 w-full',
          kpis.length <= 1 && 'grid-cols-1',
          kpis.length === 2 && 'grid-cols-1 sm:grid-cols-2',
          kpis.length >= 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        )}
      >
        {kpis.map((kpi) => (
          <Card
            key={kpi.shop_id}
            className="border-border/50 hover:border-primary/50 transition-colors hover:shadow-md min-w-0"
          >
            <CardHeader className="py-2 px-3 sm:px-4">
              <div className="flex items-center gap-2 min-w-0">
                <Store className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm sm:text-base font-semibold truncate">
                    {(() => {
                      const href = toSafeExternalHref(kpi.base_url)
                      if (!href) return kpi.shop_name
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline underline-offset-2"
                          title={kpi.base_url}
                        >
                          {kpi.shop_name}
                        </a>
                      )
                    })()}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    {kpi.role} · .{kpi.tld}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1 pb-2 px-3 sm:px-4">
              <div className="mb-1.5 sm:mb-2">
                <div className="text-xl sm:text-2xl font-bold">{kpi.total_products.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Products</div>
              </div>
              <div className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Products with valid SKU:</span>
                  <span className="font-medium">{kpi.total_with_valid_sku.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unique Products:</span>
                  <span className="font-medium">{kpi.unique_products.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duplicate SKUs:</span>
                  <span
                    className={`font-medium ${kpi.duplicate_skus > 0 ? 'text-yellow-600' : ''}`}
                  >
                    {kpi.duplicate_skus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Missing (no SKU):</span>
                  <span
                    className={`font-medium ${
                      kpi.missing_no_sku > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {kpi.missing_no_sku}
                  </span>
                </div>
                {kpi.role === 'target' && kpi.missing_from_source != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Missing from source:</span>
                    <span
                      className={`font-medium ${
                        kpi.missing_from_source > 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {kpi.missing_from_source}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}
    </div>
  )
}
