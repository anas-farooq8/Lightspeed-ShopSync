"use client"

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Search, LayoutGrid, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { ProductCard } from '@/components/sync-operations/ProductCard'
import { ProductListTable } from '@/components/sync-operations/ProductListTable'

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

interface ProductListTabProps {
  operation?: 'create' | 'null_sku'
  shops: Shop[]
}

export function ProductListTab({ operation = 'create', shops }: ProductListTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [products, setProducts] = useState<SyncProduct[]>([])
  const [initialLoading, setInitialLoading] = useState(true) // Only true on first load
  const [isRefreshing, setIsRefreshing] = useState(false) // For filter changes, keeps products visible
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  
  // Initialize search from URL
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  
  const [missingIn, setMissingIn] = useState<string>('all')
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)
  const [sortBy, setSortBy] = useState<'title' | 'sku' | 'variants' | 'price' | 'created'>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  
  const isNullSku = operation === 'null_sku'

  // Listen to URL changes (browser back/forward button)
  useEffect(() => {
    const urlSearch = searchParams.get('search') || ''
    if (urlSearch !== search) {
      setSearch(urlSearch)
      setSearchInput(urlSearch)
    }
  }, [searchParams, search])

  // Fetch products when filters or search changes
  useEffect(() => {
    fetchProducts()
  }, [page, missingIn, shopFilter, onlyDuplicates, sortBy, sortOrder, search])

  // Scroll to top of the scrollable container (main element)
  const scrollToTop = () => {
    // The main element is the scrollable container in the dashboard layout
    const mainElement = document.querySelector('main')
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function fetchProducts() {
    try {
      // Use isRefreshing for subsequent loads to prevent flicker
      if (initialLoading) {
        setInitialLoading(true)
      } else {
        setIsRefreshing(true)
      }
      
      const params = new URLSearchParams({
        operation: operation,
        page: page.toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      })
      
      if (isNullSku) {
        if (shopFilter !== 'all') params.append('shopTld', shopFilter)
      } else {
        params.append('missingIn', missingIn)
        params.append('onlyDuplicates', onlyDuplicates.toString())
      }
      
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
      setInitialLoading(false)
      setIsRefreshing(false)
    }
  }

  const handleSort = (column: 'title' | 'sku' | 'variants' | 'price' | 'created') => {
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

  const handleSearchSubmit = () => {
    if (searchInput === search) return // No change, don't refetch
    
    setSearch(searchInput)
    setPage(1) // Reset to first page on search
    
    // Update URL with search parameter only
    if (searchInput) {
      router.push(`?search=${encodeURIComponent(searchInput)}`)
    } else {
      router.push(window.location.pathname)
    }
    
    // useEffect will trigger fetchProducts() automatically when search changes
  }

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit()
    }
  }

  const handleFilterChange = (value: string) => {
    if (isNullSku) {
      setShopFilter(value)
    } else {
      setMissingIn(value)
    }
    setPage(1)
    
    // useEffect will trigger fetchProducts() automatically when filter changes
  }

  if (initialLoading && products.length === 0) {
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
      {/* Top Loading Bar */}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-red-600 animate-pulse">
          <div className="h-full bg-red-400 animate-[shimmer_1s_ease-in-out_infinite]" 
               style={{
                 background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                 backgroundSize: '200% 100%',
                 animation: 'shimmer 1s ease-in-out infinite'
               }}
          />
        </div>
      )}
      
      {/* Filters and Controls */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3">
            {/* First Row: Search Bar with integrated Search Button */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Input
                  placeholder={isNullSku ? "Search by product title or variant title..." : "Search by SKU, product title, or variant title..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 cursor-text flex-1"
                  disabled={isRefreshing}
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSearchSubmit}
                  disabled={isRefreshing}
                  className="cursor-pointer bg-red-600 hover:bg-red-700 h-9 rounded-none border-l border-border px-4 m-0"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>

            {/* Second Row: Filters and View Toggle */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-1">
                {/* Filter - Missing In or Shop Filter based on operation */}
                <Select 
                  value={isNullSku ? shopFilter : missingIn} 
                  onValueChange={handleFilterChange} 
                  disabled={isRefreshing}
                >
                  <SelectTrigger 
                    className="w-full sm:w-[280px] cursor-pointer"
                  >
                    <SelectValue placeholder={isNullSku ? "Filter by shop..." : "Missing in..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {isNullSku ? (
                      <>
                        <SelectItem value="all" className="cursor-pointer">
                          All shops
                        </SelectItem>
                        {shops.map((shop) => (
                          <SelectItem 
                            key={shop.shop_id} 
                            value={shop.tld} 
                            className="cursor-pointer"
                          >
                            {shop.shop_name} (.{shop.tld}) - {shop.role === 'source' ? 'Source' : 'Target'}
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <>
                        <SelectItem value="all" className="cursor-pointer">
                          Missing in all shops
                        </SelectItem>
                        {shops
                          .filter(shop => shop.role === 'target')
                          .sort((a, b) => a.tld.localeCompare(b.tld))
                          .map((shop) => (
                            <SelectItem 
                              key={shop.shop_id} 
                              value={shop.tld} 
                              className="cursor-pointer"
                            >
                              Missing in {shop.shop_name} (.{shop.tld}) - Target
                            </SelectItem>
                          ))
                        }
                      </>
                    )}
                  </SelectContent>
                </Select>

                {/* Duplicate Filter Checkbox - Only for CREATE operation */}
                {!isNullSku && (
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
                )}
                
                {/* Warning Badge for NULL SKU */}
                {isNullSku && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-400 dark:border-amber-700 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Products without SKU cannot be synced
                    </span>
                  </div>
                )}
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
                Showing {products.length > 0 ? ((page - 1) * 100) + 1 : 0} - {Math.min(page * 100, total)} of {total.toLocaleString()} products
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
        <ProductListTable 
          products={products}
          sortBy={sortBy}
          sortOrder={sortOrder}
          loading={isRefreshing}
          onSort={handleSort}
          onProductClick={() => {}}
          hideSkuColumn={isNullSku}
          hideDuplicateBadges={isNullSku}
          hideShopIndicators={isNullSku}
          showShopBadge={isNullSku}
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={`${product.source_product_id}-${product.default_sku}`}
              product={product}
              onClick={() => {}}
              hideShopIndicators={isNullSku}
              showShopBadge={isNullSku}
              hideDuplicateBadges={isNullSku}
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
                onClick={() => {
                  setPage(1)
                  scrollToTop()
                }}
                disabled={page === 1 || isRefreshing}
                className="cursor-pointer"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              {/* Previous Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage(page - 1)
                  scrollToTop()
                }}
                disabled={page === 1 || isRefreshing}
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
                        onClick={() => {
                          setPage(pageNum as number)
                          scrollToTop()
                        }}
                        disabled={isRefreshing}
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
                onClick={() => {
                  setPage(page + 1)
                  scrollToTop()
                }}
                disabled={page === totalPages || isRefreshing}
                className="cursor-pointer"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>

              {/* Last Page Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage(totalPages)
                  scrollToTop()
                }}
                disabled={page === totalPages || isRefreshing}
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
