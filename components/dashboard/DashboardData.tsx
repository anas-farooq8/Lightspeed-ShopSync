"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { LastSync } from '@/components/dashboard/LastSync'
import { ProductOperationLogsCard } from '@/components/dashboard/ProductOperationLogsCard'
import { Button } from '@/components/ui/button'
import { sortShopsSourceFirstThenByTld } from '@/lib/utils'
import type { DashboardKpi } from '@/types/database'

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

interface ProductOperationLog {
  id: number
  shop_id: string
  lightspeed_product_id: number
  operation_type: 'create' | 'edit'
  status: 'success' | 'error'
  error_message: string | null
  details: { changes?: string[] }
  source_shop_id: string | null
  source_lightspeed_product_id: number | null
  created_at: string
  target_shop: { id: string; name: string; base_url: string }
  source_shop: { id: string; name: string; base_url: string } | null
  target_product: { title: string; default_sku: string | null; image?: unknown } | null
  source_product: { title: string; default_sku: string | null } | null
}

interface DashboardDataState {
  stats: DashboardKpi[] | null
  lastSync: LastSyncInfo[] | null
  productLogs: ProductOperationLog[] | null
  loading: boolean
  statsError: string | null
  lastSyncError: string | null
  productLogsError: string | null
}

/**
 * Fetches stats, last-sync, and product-operation-logs in parallel.
 * Passes data to child components for explicit parallel loading.
 */
export function DashboardData() {
  const [state, setState] = useState<DashboardDataState>({
    stats: null,
    lastSync: null,
    productLogs: null,
    loading: true,
    statsError: null,
    lastSyncError: null,
    productLogsError: null,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const [statsRes, lastSyncRes, logsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/last-sync'),
        fetch('/api/product-operation-logs?limit=20'),
      ])

      if (cancelled) return

      const [statsData, lastSyncData, logsData] = await Promise.all([
        statsRes.ok ? statsRes.json() : null,
        lastSyncRes.ok ? lastSyncRes.json() : null,
        logsRes.ok ? logsRes.json() : null,
      ])

      if (cancelled) return

      setState({
        stats: sortShopsSourceFirstThenByTld(statsData ?? []) as DashboardKpi[],
        lastSync: sortShopsSourceFirstThenByTld(lastSyncData ?? []) as LastSyncInfo[],
        productLogs: Array.isArray(logsData) ? logsData : [],
        loading: false,
        statsError: !statsRes.ok ? 'Failed to fetch stats' : null,
        lastSyncError: !lastSyncRes.ok ? 'Failed to fetch last sync' : null,
        productLogsError: !logsRes.ok ? 'Failed to fetch product operation logs' : null,
      })
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  return (
    <>
      <StatsCards
        data={state.stats}
        loading={state.loading}
        error={state.statsError}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
        <div className="min-w-0 space-y-4">
          <ProductOperationLogsCard
            data={state.productLogs}
            loading={state.loading}
            error={state.productLogsError}
          />
          <Link href="/dashboard/sync-operations" className="block">
            <Button variant="outline" className="w-full justify-between">
              Create or edit products
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="min-w-0">
          <LastSync
            data={state.lastSync}
            loading={state.loading}
            error={state.lastSyncError}
          />
        </div>
      </div>
    </>
  )
}
