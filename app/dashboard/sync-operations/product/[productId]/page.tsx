"use client"

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { clearProductImagesCache } from '@/lib/cache/product-images-cache'
import { ProductPanel } from '@/components/sync-operations/product-display/ProductPanel'
import { ProductHeader } from '@/components/sync-operations/product-display/ProductHeader'
import { useProductNavigation } from '@/hooks/useProductNavigation'
import type { ProductData } from '@/types/product'

export default function ProductDetailPage() {
  const params = useParams()
  const productId = params.productId as string
  const { navigating, navigateBack } = useProductNavigation()

  const [details, setDetails] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        
        const url = `/api/product-details?productId=${productId}`
        
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch product details')
        }
        
        const data = await response.json()
        setDetails(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product details')
      } finally {
        setLoading(false)
      }
    }

    fetchProductDetails()
  }, [productId])

  useEffect(() => {
    return () => clearProductImagesCache()
  }, [])

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="w-full p-4 sm:p-6">
        <ProductHeader
          onBack={() => navigateBack('null_sku')}
          identifier={{ label: 'Product Id', value: productId }}
        />
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-8 px-4 text-destructive text-sm">
            {error || 'Product not found'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-w-0">
      <LoadingShimmer show={navigating} position="top" />
      
      <div className="w-full p-4 sm:p-6">
        <ProductHeader
          onBack={() => navigateBack('null_sku')}
          identifier={{ label: 'Product Id', value: details.product_id }}
        />
        <ProductPanel
          product={details}
          isSource={false}
          languages={details.languages || []}
          hasDuplicates={false}
          allProducts={[details]}
          selectedProductId={details.product_id}
          onProductSelect={() => {}}
          compactLayout={true}
        />
      </div>
    </div>
  )
}
