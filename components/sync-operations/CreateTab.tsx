"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Search, LayoutGrid, List, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { ProductSyncCard } from '@/components/sync-operations/ProductSyncCard'
import { ProductSyncTable } from '@/components/sync-operations/ProductSyncTable'

export interface TargetShopInfo {
  shop_id: string
  shop_name: string
  shop_tld: string
  default_matches: number
  non_default_matches: number
  total_matches: number
  default_product_ids: number[]
  default_variant_ids: number[]
  non_default_product_ids: number[]
  non_default_variant_ids: number[]
  default_variant_counts: number[]
  non_default_variant_counts: number[]
  target_has_duplicates: boolean
  target_sku_count: number
  status: 'not_exists' | 'exists_single' | 'exists_multiple' | 'null_sku' | 'unknown'
  match_type: 'default_variant' | 'non_default_variant' | 'no_match'
}

export interface SyncProduct {
  source_shop_id: string
  source_shop_name: string
  source_shop_tld: string
  source_product_id: number
  source_variant_id: number
  default_sku: string | null
  product_title: string
  variant_title: string
  product_image: any
  price_excl: number
  source_variant_count: number
  ls_created_at: string
  ls_updated_at: string
  source_sku_count: number
  source_duplicate_count: number
  source_has_duplicates: boolean
  source_duplicate_product_ids: number[]
  is_null_sku: boolean
  targets: Record<string, TargetShopInfo>
}

interface Shop {
  shop_id: string
  shop_name: string
  tld: string
  role: string
}

export function CreateTab() {
  const [products, setProducts] = useState<SyncProduct[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [filterLoading, setFilterLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [search, setSearch] = useState('')
  const [missingIn, setMissingIn] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 50

  // Fetch shops on mount
  useEffect(() => {
    async function fetchShops() {
      try {
        const response = await fetch('/api/stats')
        if (!response.ok) throw new Error('Failed to fetch shops')
        const data = await response.json()
        
        // Sort: source first, then targets sorted by TLD
        const sorted = Array.isArray(data) ? [...data].sort((a: any, b: any) => {
          // Source shops come first
          if (a.role === 'source' && b.role !== 'source') return -1
          if (a.role !== 'source' && b.role === 'source') return 1
          
          // Both are targets, sort by TLD
          return a.tld.localeCompare(b.tld)
        }) : []
        
        setShops(sorted.map(s => ({
          shop_id: s.shop_id || '',
          shop_name: s.shop_name || '',
          tld: s.tld || '',
          role: s.role || ''
        })))
      } catch (err) {
        console.error('Failed to fetch shops:', err)
      }
    }
    
    fetchShops()
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [page, missingIn, search])

  async function fetchProducts() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        operation: 'create',
        page: page.toString(),
        pageSize: pageSize.toString(),
        missingIn: missingIn,
      })
      
      if (search) params.append('search', search)

      const response = await fetch(`/api/sync-operations?${params}`)
      if (!response.ok) throw new Error('Failed to fetch products')
      
      const data = await response.json()
      setProducts(data.products || [])
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1) // Reset to first page on search
  }

  const handleMissingInChange = async (value: string) => {
    setMissingIn(value)
    setPage(1) // Reset to first page on filter change
    setFilterLoading(true)
    
    try {
      const params = new URLSearchParams({
        operation: 'create',
        page: '1',
        pageSize: pageSize.toString(),
        missingIn: value,
      })
      
      if (search) params.append('search', search)

      const response = await fetch(`/api/sync-operations?${params}`)
      if (!response.ok) throw new Error('Failed to fetch products')
      
      const data = await response.json()
      setProducts(data.products || [])
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setFilterLoading(false)
    }
  }

  if (loading && products.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center justify-center py-12 text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters and Controls */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product title or SKU..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 cursor-text"
              />
            </div>

            {/* Missing In Filter */}
            <Select value={missingIn} onValueChange={handleMissingInChange} disabled={filterLoading}>
              <SelectTrigger 
                className="w-full sm:w-[220px] cursor-pointer"
                icon={filterLoading ? <RefreshCw className="size-4 animate-spin opacity-50" /> : undefined}
              >
                <SelectValue placeholder="Missing in..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">
                  Missing in all shops
                </SelectItem>
                {shops
                  .filter(shop => shop.role === 'target')
                  .map((shop) => (
                    <SelectItem 
                      key={shop.shop_id} 
                      value={shop.tld} 
                      className="cursor-pointer"
                    >
                      Missing in {shop.shop_name} (.{shop.tld})
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>

            {/* View Mode Toggle */}
            <div className="flex gap-1 border border-border rounded-md p-1">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="cursor-pointer"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="cursor-pointer"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-3 text-sm text-muted-foreground">
            Showing {products.length > 0 ? ((page - 1) * pageSize) + 1 : 0} - {Math.min(page * pageSize, total)} of {total.toLocaleString()} products
          </div>
        </CardContent>
      </Card>

      {/* Products Display */}
      {products.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            No products found matching your filters
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <ProductSyncTable 
          products={products} 
          onProductClick={() => {}}
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductSyncCard
              key={`${product.source_product_id}-${product.default_sku}`}
              product={product}
              onClick={() => {}}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="border-border/50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 1 || loading}
                className="cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages || loading}
                className="cursor-pointer"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
