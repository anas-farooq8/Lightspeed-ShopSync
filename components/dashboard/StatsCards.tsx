"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import type { SyncStats } from '@/types/variant'

export function StatsCards() {
  const [stats, setStats] = useState<SyncStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats')
        if (!response.ok) throw new Error('Failed to fetch stats')
        const data = await response.json()
        setStats(data)
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
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-12 text-destructive">
            {error || 'Failed to load statistics'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-3 mb-6">
      {/* .nl Card */}
      <Card className="border-border/50 hover:border-primary/50 transition-colors hover:shadow-md">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🇳🇱</span>
            <div className="flex-1">
              <CardTitle className="text-sm font-medium">VerpakkingenXL (.nl)</CardTitle>
              <p className="text-xs text-muted-foreground">SOURCE</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <div className="mb-3">
            <div className="text-2xl font-bold">{stats.total_nl_products.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Products</div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unique SKUs:</span>
              <span className="font-medium">{stats.unique_nl_skus.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duplicates:</span>
              <span className={`font-medium ${stats.nl_duplicate_skus > 0 ? 'text-yellow-600' : ''}`}>
                {stats.nl_duplicate_skus}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* .de Card */}
      <Card className="border-border/50 hover:border-primary/50 transition-colors hover:shadow-md">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🇩🇪</span>
            <div className="flex-1">
              <CardTitle className="text-sm font-medium">VerpackungenXL (.de)</CardTitle>
              <p className="text-xs text-muted-foreground">TARGET</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <div className="mb-3">
            <div className="text-2xl font-bold">{stats.total_de_products.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Products</div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unique SKUs:</span>
              <span className="font-medium">{stats.unique_de_skus.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duplicates:</span>
              <span className={`font-medium ${stats.de_duplicate_skus > 0 ? 'text-yellow-600' : ''}`}>
                {stats.de_duplicate_skus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Missing:</span>
              <span className={`font-medium ${stats.missing_in_de > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.missing_in_de}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* .be Card */}
      <Card className="border-border/50 hover:border-primary/50 transition-colors hover:shadow-md">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🇧🇪</span>
            <div className="flex-1">
              <CardTitle className="text-sm font-medium">VerpakkingenXL (.be)</CardTitle>
              <p className="text-xs text-muted-foreground">TARGET</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3 px-4">
          <div className="mb-3">
            <div className="text-2xl font-bold">{stats.total_be_products.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Products</div>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unique SKUs:</span>
              <span className="font-medium">{stats.unique_be_skus.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duplicates:</span>
              <span className={`font-medium ${stats.be_duplicate_skus > 0 ? 'text-yellow-600' : ''}`}>
                {stats.be_duplicate_skus}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Missing:</span>
              <span className={`font-medium ${stats.missing_in_be > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.missing_in_be}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
