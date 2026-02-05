"use client"

import { useEffect, useState, useRef } from 'react'
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
  default_sku: string
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
  const isNullSku = operation === 'null_sku'
  
  // Products and loading states
  const [products, setProducts] = useState<SyncProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  
  // UI states
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [searchInput, setSearchInput] = useState('')
  
  // Fetch guard
  const lastFetchParamsRef = useRef<string>('')
  const isFetchingRef = useRef(false)

  // Initialize shop colors
  useEffect(() => {
    if (shops.length > 0) {
      const sourceShop = shops.find(shop => shop.role === 'source')
      const shopTlds = shops.map(shop => shop.tld)
      initializeShopColors(shopTlds, sourceShop?.tld)
    }
  }, [shops])

  // Fetch products when URL params or operation changes
  useEffect(() => {
    const fetchProducts = async () => {
      // Get current tab from URL
      const currentTab = searchParams.get('tab') || 'create'
      const expectedTab = isNullSku ? 'null_sku' : 'create'
      
      // Only fetch if this component's operation matches the active tab
      if (currentTab !== expectedTab) {
        return
      }
      
      // Build params string for deduplication check
      const paramsString = `${operation}-${searchParams.toString()}`
      
      // Prevent duplicate fetches for the same params
      if (isFetchingRef.current || lastFetchParamsRef.current === paramsString) {
        return
      }
      
      isFetchingRef.current = true
      lastFetchParamsRef.current = paramsString
      
      // Get URL parameters
      const search = searchParams.get('search') || ''
      const page = parseInt(searchParams.get('page') || '1')
      const missingIn = searchParams.get('missingIn') || 'all'
      const shopFilter = searchParams.get('shopFilter') || 'all'
      const onlyDuplicates = searchParams.get('onlyDuplicates') === 'true'
      const sortBy = searchParams.get('sortBy') || 'created'
      const sortOrder = searchParams.get('sortOrder') || 'desc'
      
      // Update search input to match URL
      setSearchInput(search)
      
      try {
        setIsRefreshing(true)
        
        // Build API params
        const apiParams = new URLSearchParams({
          operation: operation,
          page: page.toString(),
          sortBy: sortBy,
          sortOrder: sortOrder,
        })
        
        if (isNullSku) {
          if (shopFilter !== 'all') apiParams.append('shopTld', shopFilter)
        } else {
          apiParams.append('missingIn', missingIn)
          apiParams.append('onlyDuplicates', onlyDuplicates.toString())
        }
        
        if (search) apiParams.append('search', search)

        const response = await fetch(`/api/sync-operations?${apiParams}`)
        if (!response.ok) throw new Error('Failed to fetch products')
        
        const data = await response.json()
        setProducts(data.products || [])
        setTotalPages(data.pagination.totalPages)
        setTotal(data.pagination.total)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products')
      } finally {
        setLoading(false)
        setIsRefreshing(false)
        isFetchingRef.current = false
      }
    }

    fetchProducts()
  }, [searchParams, operation, isNullSku])

  // Helper to update URL with new params
  const updateURL = (newParams: Record<string, string | number | boolean | undefined>) => {
    const params = new URLSearchParams()
    
    // Get current tab from URL
    const currentTab = searchParams.get('tab') || (isNullSku ? 'null_sku' : 'create')
    params.set('tab', currentTab)
    
    // Get current values or use new ones
    const search = newParams.search !== undefined ? String(newParams.search) : searchParams.get('search') || ''
    const page = newParams.page !== undefined ? Number(newParams.page) : parseInt(searchParams.get('page') || '1')
    const missingIn = newParams.missingIn !== undefined ? String(newParams.missingIn) : searchParams.get('missingIn') || 'all'
    const shopFilter = newParams.shopFilter !== undefined ? String(newParams.shopFilter) : searchParams.get('shopFilter') || 'all'
    const onlyDuplicates = newParams.onlyDuplicates !== undefined ? Boolean(newParams.onlyDuplicates) : searchParams.get('onlyDuplicates') === 'true'
    const sortBy = newParams.sortBy !== undefined ? String(newParams.sortBy) : searchParams.get('sortBy') || 'created'
    const sortOrder = newParams.sortOrder !== undefined ? String(newParams.sortOrder) : searchParams.get('sortOrder') || 'desc'
    
    // Add non-default params to URL
    if (search) params.set('search', search)
    if (page > 1) params.set('page', page.toString())
    if (!isNullSku && missingIn !== 'all') params.set('missingIn', missingIn)
    if (isNullSku && shopFilter !== 'all') params.set('shopFilter', shopFilter)
    if (!isNullSku && onlyDuplicates) params.set('onlyDuplicates', 'true')
    if (sortBy !== 'created') params.set('sortBy', sortBy)
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder)
    
    router.push(`/dashboard/sync-operations?${params.toString()}`, { scroll: false })
  }

  const handleSort = (column: 'title' | 'sku' | 'variants' | 'price' | 'created') => {
    const currentSortBy = searchParams.get('sortBy') || 'created'
    const currentSortOrder = searchParams.get('sortOrder') || 'desc'
    
    let newSortOrder: 'asc' | 'desc'
    if (currentSortBy === column) {
      newSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc'
    } else {
      newSortOrder = column === 'created' ? 'desc' : 'asc'
    }
    
    updateURL({ sortBy: column, sortOrder: newSortOrder, page: 1 })
  }

  const handleProductClick = (product: SyncProduct) => {
    setIsRefreshing(true)
    
    // Preserve all current URL params
    const params = new URLSearchParams(searchParams.toString())
    
    // Route to appropriate detail page
    if (isNullSku) {
      router.push(`/dashboard/sync-operations/product/${product.source_product_id}?${params.toString()}`)
    } else {
      params.set('productId', product.source_product_id.toString())
      router.push(`/dashboard/sync-operations/products/${product.default_sku}?${params.toString()}`)
    }
  }

  const handleSearchSubmit = () => {
    const currentSearch = searchParams.get('search') || ''
    if (searchInput === currentSearch) return
    updateURL({ search: searchInput, page: 1 })
  }

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit()
    }
  }

  const handleFilterChange = (value: string) => {
    if (isNullSku) {
      updateURL({ shopFilter: value, page: 1 })
    } else {
      updateURL({ missingIn: value, page: 1 })
    }
  }

  const handlePageChange = (newPage: number) => {
    updateURL({ page: newPage })
    scrollToTop()
  }

  const scrollToTop = () => {
    const mainElement = document.querySelector('main')
    if (mainElement) {
      mainElement.scrollTo({ top: 0, behavior: 'smooth' })
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

  const currentPage = parseInt(searchParams.get('page') || '1')
  const currentSortBy = searchParams.get('sortBy') || 'created'
  const currentSortOrder = searchParams.get('sortOrder') || 'desc'
  const currentMissingIn = searchParams.get('missingIn') || 'all'
  const currentShopFilter = searchParams.get('shopFilter') || 'all'
  const currentOnlyDuplicates = searchParams.get('onlyDuplicates') === 'true'

  return (
    <div className="space-y-4">
      <LoadingShimmer show={isRefreshing} position="top" />
      
      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3">
            {/* Search Bar */}
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

            {/* Filters and View Toggle */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-1">
                <Select 
                  value={isNullSku ? currentShopFilter : currentMissingIn} 
                  onValueChange={handleFilterChange} 
                  disabled={isRefreshing}
                >
                  <SelectTrigger className="w-full sm:w-[280px] cursor-pointer">
                    <SelectValue placeholder={isNullSku ? "Filter by shop..." : "Missing in..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {isNullSku ? (
                      <>
                        <SelectItem value="all" className="cursor-pointer">All shops</SelectItem>
                        {shops.map((shop) => (
                          <SelectItem key={shop.shop_id} value={shop.tld} className="cursor-pointer">
                            {shop.shop_name} (.{shop.tld}) - {getShopRoleLabel(shop.role) || 'Target'}
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <>
                        <SelectItem value="all" className="cursor-pointer">Missing in all shops</SelectItem>
                        {sortShopsSourceFirstThenByTld(shops.filter(shop => shop.role === 'target')).map((shop) => (
                          <SelectItem key={shop.shop_id} value={shop.tld} className="cursor-pointer">
                            Missing in {shop.shop_name} (.{shop.tld}) - Target
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>

                {!isNullSku && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="only-duplicates"
                      checked={currentOnlyDuplicates}
                      onCheckedChange={(checked) => updateURL({ onlyDuplicates: checked === true, page: 1 })}
                      disabled={isRefreshing}
                      className="cursor-pointer"
                    />
                    <Label htmlFor="only-duplicates" className="text-sm font-medium cursor-pointer whitespace-nowrap">
                      Show only duplicates
                    </Label>
                  </div>
                )}
                
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
                  className={`cursor-pointer px-4 ${viewMode === 'table' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                >
                  <List className="h-4 w-4 mr-2" />
                  Table
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={`cursor-pointer px-4 ${viewMode === 'grid' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Grid
                </Button>
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-end">
              <div className="text-sm text-muted-foreground">
                Showing {products.length > 0 ? ((currentPage - 1) * 100) + 1 : 0} - {Math.min(currentPage * 100, total)} of {total.toLocaleString()} products
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
          sortBy={currentSortBy as 'title' | 'sku' | 'variants' | 'price' | 'created'}
          sortOrder={currentSortOrder as 'asc' | 'desc'}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="border-border/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || isRefreshing}
                className="cursor-pointer"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isRefreshing}
                className="cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1 mx-2">
                {(() => {
                  const pages: (number | string)[] = []
                  const showPages = 5
                  
                  if (totalPages <= showPages + 2) {
                    for (let i = 1; i <= totalPages; i++) {
                      pages.push(i)
                    }
                  } else {
                    pages.push(1)
                    
                    if (currentPage > 3) {
                      pages.push('...')
                    }
                    
                    const start = Math.max(2, currentPage - 1)
                    const end = Math.min(totalPages - 1, currentPage + 1)
                    
                    for (let i = start; i <= end; i++) {
                      pages.push(i)
                    }
                    
                    if (currentPage < totalPages - 2) {
                      pages.push('...')
                    }
                    
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
                    
                    const isCurrentPage = pageNum === currentPage
                    return (
                      <Button
                        key={pageNum}
                        variant={isCurrentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handlePageChange(pageNum as number)}
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

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isRefreshing}
                className="cursor-pointer"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || isRefreshing}
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
