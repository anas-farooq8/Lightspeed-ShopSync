'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VariantSyncStatus } from '@/types/variant'
import { StatsCards } from '@/components/StatsCards'
import { FiltersPanel, FilterValues } from '@/components/FiltersPanel'
import { VariantsTable } from '@/components/VariantsTable'
import { subDays } from 'date-fns'

export default function DashboardPage() {
  const [variants, setVariants] = useState<VariantSyncStatus[]>([])
  const [filteredVariants, setFilteredVariants] = useState<VariantSyncStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterValues>({
    search: '',
    status: 'all',
    dateRange: 'all',
  })
  const supabase = createClient()

  // Fetch variants from the view
  useEffect(() => {
    const fetchVariants = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('variant_sync_status')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(50)

        if (error) {
          console.error('[v0] Error fetching variants:', error)
          return
        }

        setVariants(data || [])
      } catch (err) {
        console.error('[v0] Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchVariants()
  }, [])

  // Apply filters
  useEffect(() => {
    let filtered = [...variants]

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (v) =>
          v.sku.toLowerCase().includes(searchLower) ||
          v.product_title.toLowerCase().includes(searchLower) ||
          v.variant_title.toLowerCase().includes(searchLower)
      )
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter((v) => {
        if (filters.status === 'missing_de') return v.de_status === 'not_exists'
        if (filters.status === 'missing_be') return v.be_status === 'not_exists'
        if (filters.status === 'missing_both')
          return v.de_status === 'not_exists' && v.be_status === 'not_exists'
        if (filters.status === 'exists_both')
          return v.de_status !== 'not_exists' && v.be_status !== 'not_exists'
        return true
      })
    }

    // Date filter
    if (filters.dateRange !== 'all') {
      const now = new Date()
      let cutoffDate = now

      if (filters.dateRange === 'last_7') cutoffDate = subDays(now, 7)
      if (filters.dateRange === 'last_30') cutoffDate = subDays(now, 30)
      if (filters.dateRange === 'last_90') cutoffDate = subDays(now, 90)

      filtered = filtered.filter((v) => new Date(v.updated_at) >= cutoffDate)
    }

    setFilteredVariants(filtered)
  }, [variants, filters])

  // Calculate stats
  const stats = {
    total: variants.length,
    missingDe: variants.filter((v) => v.de_status === 'not_exists').length,
    missingBe: variants.filter((v) => v.be_status === 'not_exists').length,
    existsBoth: variants.filter((v) => v.de_status !== 'not_exists' && v.be_status !== 'not_exists')
      .length,
  }

  return (
    <div className="p-6 space-y-6">
      <StatsCards
        total={stats.total}
        missingDe={stats.missingDe}
        missingBe={stats.missingBe}
        existsBoth={stats.existsBoth}
      />

      <FiltersPanel filters={filters} onFiltersChange={setFilters} />

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Variants ({filteredVariants.length})
        </h2>
        <VariantsTable variants={filteredVariants} isLoading={loading} />
      </div>
    </div>
  )
}
