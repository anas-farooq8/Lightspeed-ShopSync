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
import { initializeShopColors } from '@/lib/constants/shop-colors'
import { sortShopsSourceFirstThenByTld, getShopRoleLabel } from '@/lib/utils'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'

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
  
  // Initialize all state from URL parameters
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [missingIn, setMissingIn] = useState<string>(searchParams.get('missingIn') || 'all')
  const [shopFilter, setShopFilter] = useState<string>(searchParams.get('shopFilter') || 'all')
  const [onlyDuplicates, setOnlyDuplicates] = useState(searchParams.get('onlyDuplicates') === 'true')
  const [sortBy, setSortBy] = useState<'title' | 'sku' | 'variants' | 'price' | 'created'>(
    (searchParams.get('sortBy') as any) || 'created'
  )
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'
  )
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  
  const isNullSku = operation === 'null_sku'

  // Initialize shop colors when shops are loaded
  useEffect(() => {
    if (shops.length > 0) {
      const sourceShop = shops.find(shop => shop.role === 'source')
      const shopTlds = shops.map(shop => shop.tld)
      initializeShopColors(shopTlds, sourceShop?.tld)
    }
  }, [shops])

  // Sync URL with state changes
  const updateURL = (newState: Partial<{
    search: string
    page: number
    missingIn: string
    shopFilter: string
    onlyDuplicates: boolean
    sortBy: string
    sortOrder: string
  }>) => {
    const params = new URLSearchParams()
    
    // Always preserve the tab parameter
    const currentTab = searchParams.get('tab') || (isNullSku ? 'null_sku' : 'create')
    params.set('tab', currentTab)
    
    const currentSearch = newState.search !== undefined ? newState.search : search
    const currentPage = newState.page !== undefined ? newState.page : page
    const currentMissingIn = newState.missingIn !== undefined ? newState.missingIn : missingIn
    const currentShopFilter = newState.shopFilter !== undefined ? newState.shopFilter : shopFilter
    const currentOnlyDuplicates = newState.onlyDuplicates !== undefined ? newState.onlyDuplicates : onlyDuplicates
    const currentSortBy = newState.sortBy !== undefined ? newState.sortBy : sortBy
    const currentSortOrder = newState.sortOrder !== undefined ? newState.sortOrder : sortOrder
    
    if (currentSearch) params.set('search', currentSearch)
    if (currentPage > 1) params.set('page', currentPage.toString())
    if (!isNullSku && currentMissingIn !== 'all') params.set('missingIn', currentMissingIn)
    if (isNullSku && currentShopFilter !== 'all') params.set('shopFilter', currentShopFilter)
    if (!isNullSku && currentOnlyDuplicates) params.set('onlyDuplicates', 'true')
    if (currentSortBy !== 'created') params.set('sortBy', currentSortBy)
    if (currentSortOrder !== 'desc') params.set('sortOrder', currentSortOrder)
    
    const queryString = params.toString()
    router.push(`/dashboard/sync-operations${queryString ? `?${queryString}` : ''}`, { scroll: false })
  }

  // Listen to URL changes and refetch when navigating back
  useEffect(() => {
    const urlSearch = searchParams.get('search') || ''
    const urlPage = parseInt(searchParams.get('page') || '1')
    const urlMissingIn = searchParams.get('missingIn') || 'all'
    const urlShopFilter = searchParams.get('shopFilter') || 'all'
    const urlOnlyDuplicates = searchParams.get('onlyDuplicates') === 'true'
    const urlSortBy = (searchParams.get('sortBy') as any) || 'created'
    const urlSortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc'
    
    // Update state from URL if different (for back navigation)
    if (urlSearch !== search) setSearch(urlSearch)
    if (urlSearch !== searchInput) setSearchInput(urlSearch)
    if (urlPage !== page) setPage(urlPage)
    if (urlMissingIn !== missingIn) setMissingIn(urlMissingIn)
    if (urlShopFilter !== shopFilter) setShopFilter(urlShopFilter)
    if (urlOnlyDuplicates !== onlyDuplicates) setOnlyDuplicates(urlOnlyDuplicates)
    if (urlSortBy !== sortBy) setSortBy(urlSortBy)
    if (urlSortOrder !== sortOrder) setSortOrder(urlSortOrder)
  }, [searchParams])

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
      // Always show shimmer when fetching
      setIsRefreshing(true)
      
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
    let newSortOrder: 'asc' | 'desc'
    if (sortBy === column) {
      // Toggle sort order
      newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      setSortOrder(newSortOrder)
    } else {
      // New column, default to descending for created, ascending for others
      newSortOrder = column === 'created' ? 'desc' : 'asc'
      setSortBy(column)
      setSortOrder(newSortOrder)
    }
    setPage(1)
    updateURL({ sortBy: column, sortOrder: newSortOrder, page: 1 })
  }

  const handleProductClick = (product: SyncProduct) => {
    // Show loading shimmer during navigation
    setIsRefreshing(true)
    
    // Navigate to product detail page, preserving current state
    const params = new URLSearchParams()
    
    // For null SKU products, use a special identifier
    const identifier = product.default_sku || `product-${product.source_product_id}`
    
    // Always preserve the tab
    const currentTab = searchParams.get('tab') || (isNullSku ? 'null_sku' : 'create')
    params.set('tab', currentTab)
    
    params.set('productId', product.source_product_id.toString())
    if (search) params.set('search', search)
    if (page > 1) params.set('page', page.toString())
    if (!isNullSku && missingIn !== 'all') params.set('missingIn', missingIn)
    if (isNullSku && shopFilter !== 'all') params.set('shopFilter', shopFilter)
    if (!isNullSku && onlyDuplicates) params.set('onlyDuplicates', 'true')
    if (sortBy !== 'created') params.set('sortBy', sortBy)
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder)
    
    router.push(`/dashboard/sync-operations/${identifier}?${params.toString()}`)
  }

  const handleSearchSubmit = () => {
    if (searchInput === search) return // No change, don't refetch
    
    setSearch(searchInput)
    setPage(1) // Reset to first page on search
    updateURL({ search: searchInput, page: 1 })
  }

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit()
    }
  }

  const handleFilterChange = (value: string) => {
    if (isNullSku) {
      setShopFilter(value)
      updateURL({ shopFilter: value, page: 1 })
    } else {
      setMissingIn(value)
      updateURL({ missingIn: value, page: 1 })
    }
    setPage(1)
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
      {/* Global Loading Shimmer */}
      <LoadingShimmer show={isRefreshing} position="top" />
      
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
                            {shop.shop_name} (.{shop.tld}) - {getShopRoleLabel(shop.role) || 'Target'}
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <>
                        <SelectItem value="all" className="cursor-pointer">
                          Missing in all shops
                        </SelectItem>
                        {sortShopsSourceFirstThenByTld(shops.filter(shop => shop.role === 'target'))
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
                        const newValue = checked === true
                        setOnlyDuplicates(newValue)
                        setPage(1)
                        updateURL({ onlyDuplicates: newValue, page: 1 })
                      }}
                      disabled={isRefreshing}
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
          onProductClick={handleProductClick}
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
              onClick={() => handleProductClick(product)}
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
                  updateURL({ page: 1 })
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
                  const newPage = page - 1
                  setPage(newPage)
                  updateURL({ page: newPage })
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
                          const newPage = pageNum as number
                          setPage(newPage)
                          updateURL({ page: newPage })
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
                  const newPage = page + 1
                  setPage(newPage)
                  updateURL({ page: newPage })
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
                  updateURL({ page: totalPages })
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
