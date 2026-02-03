"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Store } from 'lucide-react'
import type { DashboardKpi } from '@/types/variant'

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
        setKpis(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load statistics')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 mb-8">
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid gap-4 mb-8">
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-12 text-destructive">
            {error}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (kpis.length === 0) {
    return (
      <div className="grid gap-4 mb-8">
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            No shop data available
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div
      className="grid gap-3 mb-6 w-full"
      style={{
        gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
      }}
    >
      {kpis.map((kpi) => (
        <Card
          key={`${kpi.shop_name}-${kpi.tld}`}
          className="border-border/50 hover:border-primary/50 transition-colors hover:shadow-md"
        >
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-medium truncate">
                  {kpi.shop_name}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {kpi.role} · {kpi.tld}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <div className="mb-3">
              <div className="text-2xl font-bold">{kpi.total_products.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Products</div>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Unique SKUs:</span>
                <span className="font-medium">{kpi.unique_skus.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duplicates:</span>
                <span
                  className={`font-medium ${kpi.duplicate_skus > 0 ? 'text-yellow-600' : ''}`}
                >
                  {kpi.duplicate_skus}
                </span>
              </div>
              {kpi.role === 'target' && kpi.missing != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Missing:</span>
                  <span
                    className={`font-medium ${
                      kpi.missing > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {kpi.missing}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
