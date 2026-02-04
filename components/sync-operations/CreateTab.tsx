"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Search, LayoutGrid, List, ChevronLeft, ChevronRight, RefreshCw, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { ProductSyncCard } from '@/components/sync-operations/ProductSyncCard'
import { ProductSyncTableGrouped } from '@/components/sync-operations/ProductSyncTableGrouped'

export interface TargetShopInfo {
  shop_id: string
  shop_name: string
  shop_tld: string
  status: 'not_exists' | 'exists_single' | 'exists_multiple' | 'unknown'
  match_type: 'default_variant' | 'non_default_variant' | 'no_match'
  default_matches: number
  non_default_matches: number
  total_matches: number
}

export interface SyncProduct {
  source_shop_id: string
  source_shop_name: string
  source_shop_tld: string
  source_product_id: number
  source_variant_id: number
  default_sku: string  // Always valid (never null)
  product_title: string
  variant_title: string
  product_image: any
  price_excl: number
  source_variant_count: number
  ls_created_at: string
  ls_updated_at: string
  source_duplicate_count: number
  source_has_duplicates: boolean
  source_duplicate_product_ids: number[]
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
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('') // Separate state for input
  const [missingIn, setMissingIn] = useState<string>('all')
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [sortBy, setSortBy] = useState<'title' | 'sku' | 'variants' | 'price' | 'created'>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 100

  // Extract shops from products (no need for separate API call)
  useEffect(() => {
    if (products.length > 0) {
      const shopsSet = new Map<string, Shop>()
      
      products.forEach(product => {
        Object.entries(product.targets || {}).forEach(([tld, targetInfo]) => {
          if (!shopsSet.has(tld)) {
            shopsSet.set(tld, {
              shop_id: tld,
              shop_name: targetInfo.shop_name,
              tld: tld,
              role: 'target'
            })
          }
        })
      })
      
      const sorted = Array.from(shopsSet.values()).sort((a, b) => 
        a.tld.localeCompare(b.tld)
      )
      
      setShops(sorted)
    }
  }, [products])

  useEffect(() => {
    fetchProducts()
  }, [page, missingIn, onlyDuplicates, sortBy, sortOrder])

  // Separate useEffect for search (only triggers when search state changes, not searchInput)
  useEffect(() => {
    if (search !== '') {
      fetchProducts()
    }
  }, [search])

  async function fetchProducts() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        operation: 'create',
        page: page.toString(),
        pageSize: pageSize.toString(),
        missingIn: missingIn,
        onlyDuplicates: onlyDuplicates.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
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

  const handleSort = (column: 'title' | 'sku' | 'variants' | 'price' | 'created') => {
    // Show loading state
    setLoading(true)
    
    if (sortBy === column) {
      // Toggle sort order
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to descending for created, ascending for others
      setSortBy(column)
      setSortOrder(column === 'created' ? 'desc' : 'asc')
    }
    setPage(1) // Reset to first page on sort change
  }

  const handleSearchSubmit = async () => {
    if (searchInput === search) return // No change, don't refetch
    
    setSearchLoading(true)
    setSearch(searchInput)
    setPage(1) // Reset to first page on search
    
    try {
      const params = new URLSearchParams({
        operation: 'create',
        page: '1',
        pageSize: pageSize.toString(),
        missingIn: missingIn,
        onlyDuplicates: onlyDuplicates.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      })
      
      if (searchInput) params.append('search', searchInput)

      const response = await fetch(`/api/sync-operations?${params}`)
      if (!response.ok) throw new Error('Failed to fetch products')
      
      const data = await response.json()
      setProducts(data.products || [])
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit()
    }
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
        onlyDuplicates: onlyDuplicates.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
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
          <div className="flex flex-col gap-3">
            {/* First Row: Search Bar with integrated Search Button */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Input
                  placeholder="Search by SKU, product title, or variant title..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-text flex-1"
                  disabled={searchLoading}
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSearchSubmit}
                  disabled={searchLoading}
                  className="cursor-pointer bg-red-600 hover:bg-red-700 h-9 rounded-none border-l border-border px-4 m-0"
                >
                  {searchLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Second Row: Filters and View Toggle */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-1">
                {/* Missing In Filter */}
                <Select value={missingIn} onValueChange={handleMissingInChange} disabled={filterLoading}>
                  <SelectTrigger 
                    className="w-full sm:w-[280px] cursor-pointer"
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

                {/* Duplicate Filter Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="only-duplicates"
                    checked={onlyDuplicates}
                    onCheckedChange={(checked: boolean) => {
                      setOnlyDuplicates(checked === true)
                      setPage(1)
                    }}
                    className="cursor-pointer"
                  />
                  <Label
                    htmlFor="only-duplicates"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer whitespace-nowrap"
                  >
                    Show only duplicates
                  </Label>
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex gap-1 border border-border rounded-md p-1">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className={`cursor-pointer px-4 ${
                    viewMode === 'table' 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : ''
                  }`}
                >
                  <List className="h-4 w-4 mr-2" />
                  Table
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={`cursor-pointer px-4 ${
                    viewMode === 'grid' 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : ''
                  }`}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Grid
                </Button>
              </div>
            </div>

            {/* Third Row: Results Count */}
            <div className="flex items-center justify-end">
              <div className="text-sm text-muted-foreground">
                Showing {products.length > 0 ? ((page - 1) * pageSize) + 1 : 0} - {Math.min(page * pageSize, total)} of {total.toLocaleString()} products
              </div>
            </div>
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
        <ProductSyncTableGrouped 
          products={products}
          sortBy={sortBy}
          sortOrder={sortOrder}
          loading={loading}
          onSort={handleSort}
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

      {/* Beautiful Pagination */}
      {totalPages > 1 && (
        <Card className="border-border/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-1">
              {/* First Page Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={page === 1 || loading}
                className="cursor-pointer"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              {/* Previous Button */}
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

              {/* Page Numbers */}
              <div className="flex items-center gap-1 mx-2">
                {(() => {
                  const pages: (number | string)[] = []
                  const showPages = 5 // Number of page buttons to show
                  
                  if (totalPages <= showPages + 2) {
                    // Show all pages if total is small
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(i)
                    }
                  } else {
                    // Always show first page
                    pages.push(1)
                    
                    if (page > 3) {
                      pages.push('...')
                    }
                    
                    // Show pages around current page
                    const start = Math.max(2, page - 1)
                    const end = Math.min(totalPages - 1, page + 1)
                    
                    for (let i = start; i <= end; i++) {
                      pages.push(i)
                    }
                    
                    if (page < totalPages - 2) {
                      pages.push('...')
                    }
                    
                    // Always show last page
                    pages.push(totalPages)
                  }
                  
                  return pages.map((pageNum, idx) => {
                    if (pageNum === '...') {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      )
                    }
                    
                    const isCurrentPage = pageNum === page
                    return (
                      <Button
                        key={pageNum}
                        variant={isCurrentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPage(pageNum as number)}
                        disabled={loading}
                        className={`cursor-pointer min-w-[40px] ${
                          isCurrentPage 
                            ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' 
                            : 'hover:bg-red-50 hover:border-red-300'
                        }`}
                      >
                        {pageNum}
                      </Button>
                    )
                  })
                })()}
              </div>

              {/* Next Button */}
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

              {/* Last Page Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages || loading}
                className="cursor-pointer"
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
