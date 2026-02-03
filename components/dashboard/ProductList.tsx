"use client"

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LayoutGrid, LayoutList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ProductFilters } from './ProductFilters'
import { ProductTable } from './ProductTable'
import { ProductCard } from './ProductCard'
import { Pagination } from './Pagination'
import type { ProductSyncStatus } from '@/types/variant'

type ViewMode = 'table' | 'cards'

export function ProductList() {
  const router = useRouter()
  
  // State
  const [products, setProducts] = useState<ProductSyncStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  
  // Filter state
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('created_at_desc')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        search,
        filter,
        sort,
        page: currentPage.toString(),
        limit: '100'
      })

      const response = await fetch(`/api/products?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch products')
      }

      const data = await response.json()
      
      setProducts(data.products || [])
      setTotalPages(data.pagination.totalPages)
      setTotalCount(data.pagination.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [search, filter, sort, currentPage])

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, filter, sort])

  // Handle product click
  const handleProductClick = (product: ProductSyncStatus) => {
    router.push(`/dashboard/products/${encodeURIComponent(product.default_sku)}`)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Products</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading...' : `${totalCount.toLocaleString()} products found`}
          </p>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('table')}
            className="cursor-pointer"
          >
            <LayoutList className="h-4 w-4 mr-2" />
            Table
          </Button>
          <Button
            variant={viewMode === 'cards' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('cards')}
            className="cursor-pointer"
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Cards
          </Button>
        </div>
      </div>

      {/* Filters */}
      <ProductFilters
        search={search}
        filter={filter}
        sort={sort}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
        onSortChange={setSort}
      />

      {/* Error State */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Products Display */}
      {!loading && !error && (
        <>
          {viewMode === 'table' ? (
            <ProductTable
              products={products}
              onProductClick={handleProductClick}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {products.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  No products found
                </div>
              ) : (
                products.map((product) => (
                  <ProductCard
                    key={`${product.nl_product_id}-${product.nl_default_variant_id}`}
                    product={product}
                    onProductClick={handleProductClick}
                  />
                ))
              )}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}
    </div>
  )
}
