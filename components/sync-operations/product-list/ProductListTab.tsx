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
import { ProductCard } from '@/components/sync-operations/product-list/ProductCard'
import { ProductListTable } from '@/components/sync-operations/product-list/ProductListTable'
import { TargetShopSelectionDialog } from '@/components/sync-operations/dialogs'
import { sortShopsSourceFirstThenByTld, getShopRoleLabel, cn } from '@/lib/utils'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import type { SyncProduct } from '@/types/product'

export type { SyncProduct, TargetShopInfo } from '@/types/product'

interface Shop {
  shop_id: string
  shop_name: string
  tld: string
  role: string
}

interface ProductListTabProps {
  operation?: 'create' | 'edit' | 'null_sku'
  shops: Shop[]
}

export function ProductListTab({ operation = 'create', shops }: ProductListTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // `useSearchParams()` can change identity across renders; depend on the string value instead.
  const searchParamsString = searchParams.toString()
  const isNullSku = operation === 'null_sku'
  const isEdit = operation === 'edit'
  const isCreate = operation === 'create'
  
  // Products and loading states
  const [products, setProducts] = useState<SyncProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(100)
  
  // UI states - default to grid on mobile (better UX), table on desktop
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [searchInput, setSearchInput] = useState('')
  
  // Target shop selection dialog state
  const [showSelectionDialog, setShowSelectionDialog] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<SyncProduct | null>(null)
  
  // Set grid as default on mobile viewport (runs once on mount)
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
    if (isMobile) setViewMode('grid')
  }, [])
  
  // Fetch guard
  const lastFetchParamsRef = useRef<string>('')
  const isFetchingRef = useRef(false)

  // Keep the input in sync with the URL only when the URL search changes
  // (prevents re-sync/re-fetch side-effects while the user is typing).
  useEffect(() => {
    const urlSearch = new URLSearchParams(searchParamsString).get('search') || ''
    setSearchInput(urlSearch)
  }, [searchParamsString])

  // Fetch products when URL params or operation changes
  useEffect(() => {
    const fetchProducts = async () => {
      const sp = new URLSearchParams(searchParamsString)
      // Get current tab from URL
      const currentTab = sp.get('tab') || 'create'
      const expectedTab = isNullSku ? 'null_sku' : isEdit ? 'edit' : 'create'
      
      // Only fetch if this component's operation matches the active tab
      if (currentTab !== expectedTab) {
        return
      }
      
      // Page size: 50 on mobile, 100 on desktop
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
      const fetchPageSize = isMobile ? 50 : 100

      // Build params string for deduplication check
      const paramsString = `${operation}-${searchParamsString}-${fetchPageSize}`
      
      // Prevent duplicate fetches for the same params
      if (isFetchingRef.current || lastFetchParamsRef.current === paramsString) {
        return
      }
      
      isFetchingRef.current = true
      lastFetchParamsRef.current = paramsString
      
      // Get URL parameters
      const search = sp.get('search') || ''
      const page = parseInt(sp.get('page') || '1')
      const missingIn = sp.get('missingIn') || 'all'
      const existsIn = sp.get('existsIn') || 'all'
      const shopFilter = sp.get('shopFilter') || 'all'
      const onlyDuplicates = sp.get('onlyDuplicates') === 'true'
      const sortBy = sp.get('sortBy') || 'created'
      const sortOrder = sp.get('sortOrder') || 'desc'
      
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
        } else if (isEdit) {
          apiParams.append('missingIn', existsIn)
          apiParams.append('onlyDuplicates', onlyDuplicates.toString())
        } else {
          apiParams.append('missingIn', missingIn)
          apiParams.append('onlyDuplicates', onlyDuplicates.toString())
        }
        
        if (search) apiParams.append('search', search)
        apiParams.append('pageSize', fetchPageSize.toString())

        const response = await fetch(`/api/sync-operations?${apiParams}`)
        if (!response.ok) throw new Error('Failed to fetch products')
        
        const data = await response.json()
        setProducts(data.products || [])
        setTotalPages(data.pagination.totalPages)
        setTotal(data.pagination.total)
        setPageSize(data.pagination.pageSize ?? fetchPageSize)
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
  }, [searchParamsString, operation, isNullSku])

  // Helper to update URL with new params
  const updateURL = (newParams: Record<string, string | number | boolean | undefined>) => {
    const params = new URLSearchParams()
    
    // Get current tab from URL
    const currentTab = searchParams.get('tab') || (isNullSku ? 'null_sku' : isEdit ? 'edit' : 'create')
    params.set('tab', currentTab)
    
    // Get current values or use new ones
    const search = newParams.search !== undefined ? String(newParams.search) : searchParams.get('search') || ''
    const page = newParams.page !== undefined ? Number(newParams.page) : parseInt(searchParams.get('page') || '1')
    const missingIn = newParams.missingIn !== undefined ? String(newParams.missingIn) : searchParams.get('missingIn') || 'all'
    const existsIn = newParams.existsIn !== undefined ? String(newParams.existsIn) : searchParams.get('existsIn') || 'all'
    const shopFilter = newParams.shopFilter !== undefined ? String(newParams.shopFilter) : searchParams.get('shopFilter') || 'all'
    const onlyDuplicates = newParams.onlyDuplicates !== undefined ? Boolean(newParams.onlyDuplicates) : searchParams.get('onlyDuplicates') === 'true'
    const sortBy = newParams.sortBy !== undefined ? String(newParams.sortBy) : searchParams.get('sortBy') || 'created'
    const sortOrder = newParams.sortOrder !== undefined ? String(newParams.sortOrder) : searchParams.get('sortOrder') || 'desc'
    
    // Add non-default params to URL
    if (search) params.set('search', search)
    if (page > 1) params.set('page', page.toString())
    if (isCreate && missingIn !== 'all') params.set('missingIn', missingIn)
    if (isEdit && existsIn !== 'all') params.set('existsIn', existsIn)
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
      router.push(`/dashboard/sync-operations/products/${encodeURIComponent(product.default_sku)}?${params.toString()}`)
    }
  }

  const handleCreateClick = (product: SyncProduct, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedProduct(product)
    setShowSelectionDialog(true)
  }

  const handleTargetShopConfirm = (selectedShopTlds: string[]) => {
    if (!selectedProduct) return
    
    // Close dialog
    setShowSelectionDialog(false)
    
    // Preserve all current URL params
    const params = new URLSearchParams(searchParams.toString())
    
    // Add selected shops as comma-separated list
    params.set('targetShops', selectedShopTlds.join(','))
    
    // Pass the clicked product ID so the correct source is pre-selected when there are duplicates
    params.set('productId', selectedProduct.source_product_id.toString())
    
    // Navigate to preview-create page
    router.push(`/dashboard/sync-operations/preview-create/${encodeURIComponent(selectedProduct.default_sku)}?${params.toString()}`)
  }

  const handleSearchSubmit = () => {
    const currentSearch = searchParams.get('search') || ''
    if (searchInput === currentSearch) return
    updateURL({ search: searchInput, page: 1 })
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearchSubmit()
  }

  const handleFilterChange = (value: string) => {
    if (isNullSku) {
      updateURL({ shopFilter: value, page: 1 })
    } else if (isEdit) {
      updateURL({ existsIn: value, page: 1 })
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
        <CardContent className="flex items-center justify-center py-12 sm:py-16">
          <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center justify-center py-8 sm:py-12 text-destructive text-sm sm:text-base px-4">
          {error}
        </CardContent>
      </Card>
    )
  }

  const currentPage = parseInt(searchParams.get('page') || '1')
  const currentSortBy = searchParams.get('sortBy') || 'created'
  const currentSortOrder = searchParams.get('sortOrder') || 'desc'
  const currentMissingIn = searchParams.get('missingIn') || 'all'
  const currentExistsIn = searchParams.get('existsIn') || 'all'
  const currentShopFilter = searchParams.get('shopFilter') || 'all'
  const currentOnlyDuplicates = searchParams.get('onlyDuplicates') === 'true'

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      <LoadingShimmer show={isRefreshing} position="top" />
      
      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-2 sm:pt-3 px-3 sm:px-6 pb-2 sm:pb-4">
          <div className="flex flex-col gap-2 sm:gap-3">
            {/* Search Bar */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0 flex items-center border border-input rounded-md overflow-hidden transition-[color,box-shadow] focus-within:ring-1 focus-within:ring-red-400 focus-within:border-red-300">
                <Input
                  placeholder={isNullSku ? "Search by product title, variant title..." : "Search by SKU, product title, variant title..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-0 cursor-text flex-1 min-w-[80px] text-sm"
                  disabled={isRefreshing}
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSearchSubmit}
                  disabled={isRefreshing}
                  className="cursor-pointer bg-red-600 hover:bg-red-700 h-9 sm:h-9 rounded-none border-l border-border px-3 sm:px-4 m-0 min-h-[44px] sm:min-h-0 touch-manipulation shrink-0"
                  title="Search"
                >
                  <Search className="h-4 w-4 sm:mr-1 shrink-0" />
                  <span className="hidden sm:inline">Search</span>
                </Button>
              </div>
            </div>

            {/* Filters and View Toggle - filter + toggle in same row */}
            <div className="flex flex-row flex-wrap gap-2 sm:gap-3 items-center min-w-0">
              {/* Filter - takes remaining space */}
              <div className="flex-1 min-w-0 sm:flex-initial sm:min-w-0">
                <Select 
                  value={isNullSku ? currentShopFilter : isEdit ? currentExistsIn : currentMissingIn} 
                  onValueChange={handleFilterChange} 
                  disabled={isRefreshing}
                >
                  <SelectTrigger className="w-full sm:w-[280px] h-9 sm:h-10 cursor-pointer min-w-0">
                  <SelectValue placeholder={isNullSku ? "Filter by shop..." : isEdit ? "Exists in..." : "Missing in..."} />
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
                  ) : isEdit ? (
                    <>
                      <SelectItem value="all" className="cursor-pointer">Exists in all shops</SelectItem>
                      {sortShopsSourceFirstThenByTld(shops.filter(shop => shop.role === 'target')).map((shop) => (
                        <SelectItem key={shop.shop_id} value={shop.tld} className="cursor-pointer">
                          Exists in {shop.shop_name} (.{shop.tld}) - Target
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
              </div>

              {/* Checkbox - desktop only, between filter and toggle */}
              {!isNullSku && (
                <div className="hidden sm:flex items-center space-x-2 shrink-0">
                  <Checkbox
                    id="only-duplicates"
                    checked={currentOnlyDuplicates}
                    onCheckedChange={(checked) => updateURL({ onlyDuplicates: checked === true, page: 1 })}
                    disabled={isRefreshing}
                    className="cursor-pointer"
                  />
                  <Label htmlFor="only-duplicates" className="text-xs sm:text-sm font-medium cursor-pointer whitespace-nowrap">
                    Show only duplicates
                  </Label>
                </div>
              )}

              {/* View Mode Toggle - right after filter on mobile; pushed right on web (above product count) */}
              <div className="flex gap-0.5 border border-border rounded-md p-0.5 sm:p-1 shrink-0 sm:ml-auto">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className={cn('cursor-pointer px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm min-h-0 touch-manipulation justify-center h-8 sm:h-9', viewMode === 'table' && 'bg-red-600 hover:bg-red-700 text-white')}
                >
                  <List className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="ml-1 sm:ml-1.5">Table</span>
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={cn('cursor-pointer px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm min-h-0 touch-manipulation justify-center h-8 sm:h-9', viewMode === 'grid' && 'bg-red-600 hover:bg-red-700 text-white')}
                >
                  <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="ml-1 sm:ml-1.5">Grid</span>
                </Button>
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-end min-w-0">
              <div className="text-xs sm:text-sm text-muted-foreground truncate">
                Showing {products.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0} - {Math.min(currentPage * pageSize, total)} of {total.toLocaleString()} products
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Display */}
      {products.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex items-center justify-center py-8 sm:py-12 text-muted-foreground text-sm sm:text-base px-4">
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
          showCreateButton={isCreate}
          onCreateClick={handleCreateClick}
        />
      ) : (
        <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-w-0">
          {products.map((product) => (
            <ProductCard
              key={`${product.source_product_id}-${product.default_sku}`}
              product={product}
              onClick={() => handleProductClick(product)}
              hideShopIndicators={isNullSku}
              showShopBadge={isNullSku}
              hideDuplicateBadges={isNullSku}
              showCreateButton={isCreate}
              onCreateClick={handleCreateClick}
            />
          ))}
        </div>
      )}

      {/* Target Shop Selection Dialog */}
      {selectedProduct && (
        <TargetShopSelectionDialog
          open={showSelectionDialog}
          onOpenChange={setShowSelectionDialog}
          targetShops={Object.entries(selectedProduct.targets || {}).map(([tld, info]) => ({
            tld,
            name: info.shop_name,
            status: info.status,
          }))}
          onConfirm={handleTargetShopConfirm}
          productSku={selectedProduct.default_sku}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="border-border/50">
          <CardContent className="py-2 sm:py-4 px-2 sm:px-6">
            <div className="flex flex-nowrap items-center justify-center gap-1 overflow-x-auto overflow-y-hidden min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1 || isRefreshing}
                className="cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-9 sm:min-w-9 touch-manipulation shrink-0"
                title="First page"
              >
                <ChevronsLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isRefreshing}
                className="cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-9 sm:min-w-0 touch-manipulation text-xs sm:text-sm shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1 shrink-0" />
                <span className="hidden sm:inline">Previous</span>
              </Button>

              {/* Page Numbers */}
              <div className="flex flex-nowrap items-center justify-center gap-1 mx-1 sm:mx-2 shrink-0">
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
                        className={`cursor-pointer min-w-[36px] sm:min-w-[40px] min-h-[40px] sm:min-h-9 touch-manipulation text-xs sm:text-sm shrink-0 ${
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
                className="cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-9 sm:min-w-0 touch-manipulation text-xs sm:text-sm shrink-0"
              >
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1 shrink-0" />
                <span className="hidden sm:inline">Next</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || isRefreshing}
                className="cursor-pointer min-h-[40px] min-w-[40px] sm:min-h-9 sm:min-w-9 touch-manipulation shrink-0"
                title="Last page"
              >
                <ChevronsRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
