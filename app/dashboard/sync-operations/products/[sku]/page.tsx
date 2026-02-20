"use client"

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { clearProductImagesCache, fetchAndCacheImages, getCachedImages } from '@/lib/cache/product-images-cache'
import { ProductPanel } from '@/components/sync-operations/product-display/ProductPanel'
import { ProductHeader } from '@/components/sync-operations/product-display/ProductHeader'
import { useProductNavigation } from '@/hooks/useProductNavigation'
import type { ProductDetails } from '@/types/product'

export default function ProductDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sku = decodeURIComponent((params.sku as string) || '')
  const { navigating, navigateBack } = useProductNavigation()

  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [selectedSourceProductId, setSelectedSourceProductId] = useState<number | null>(null)
  const [selectedTargetProductIds, setSelectedTargetProductIds] = useState<Record<string, number>>({})
  const [selectedTargetTab, setSelectedTargetTab] = useState<string | null>(null)

  useEffect(() => {
    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        const productId = searchParams.get('productId')
        
        const url = `/api/product-details?sku=${encodeURIComponent(sku)}${productId ? `&productId=${productId}` : ''}`
        
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch product details')
        }
        
        const data = await response.json()
        setDetails(data)
        
        if (data.source.length > 0) {
          const initialSourceId = productId ? parseInt(productId) : data.source[0].product_id
          setSelectedSourceProductId(initialSourceId)
        }
        
        const initialTargets: Record<string, number> = {}
        Object.entries(data.targets ?? {}).forEach(([tld, products]) => {
          if ((products as any[]).length > 0) {
            initialTargets[tld] = (products as any[])[0].product_id
          }
        })
        setSelectedTargetProductIds(initialTargets)

        const targetTlds = Object.keys(data.targets ?? {})
          .filter(tld => (data.targets[tld] as any[]).length > 0)
          .sort((a, b) => a.localeCompare(b))
        
        let selectedTab = null
        if (targetTlds.length > 1) {
          const defaultTab = targetTlds.find(tld => (data.targets[tld] as any[]).length === 0) ?? targetTlds[0]
          setSelectedTargetTab(defaultTab)
          selectedTab = defaultTab
        } else if (targetTlds.length === 1) {
          selectedTab = targetTlds[0]
          setSelectedTargetTab(null)
        }

        // Fetch images in parallel for source and selected target
        const imageFetchPromises: Promise<any>[] = []
        
        // Fetch source images
        const sourceProduct = data.source[0]
        if (sourceProduct?.images_link) {
          const sourceImagePromise = fetchAndCacheImages(
            sourceProduct.product_id,
            sourceProduct.images_link,
            sourceProduct.shop_tld
          ).catch(err => console.error('Failed to fetch source images:', err))
          imageFetchPromises.push(sourceImagePromise)
        }
        
        // Fetch selected target images
        if (selectedTab && data.targets[selectedTab]?.[0]?.images_link) {
          const targetProduct = data.targets[selectedTab][0]
          const targetImagePromise = fetchAndCacheImages(
            targetProduct.product_id,
            targetProduct.images_link,
            targetProduct.shop_tld
          ).catch(err => console.error(`Failed to fetch ${selectedTab} images:`, err))
          imageFetchPromises.push(targetImagePromise)
        }
        
        // Execute both fetches in parallel
        if (imageFetchPromises.length > 0) {
          await Promise.all(imageFetchPromises)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product details')
      } finally {
        setLoading(false)
      }
    }

    fetchProductDetails()
  }, [sku, searchParams])

  useEffect(() => {
    return () => clearProductImagesCache()
  }, [])

  // Fetch target images when switching tabs
  useEffect(() => {
    if (!details || !selectedTargetTab) return
    
    const targetProduct = details.targets[selectedTargetTab]?.[0]
    if (!targetProduct?.images_link) return
    
    // Check if images are already cached
    const cached = getCachedImages(targetProduct.product_id, targetProduct.shop_tld)
    if (cached) return
    
    // Fetch images for this target (cache module prevents duplicates)
    fetchAndCacheImages(
      targetProduct.product_id,
      targetProduct.images_link,
      targetProduct.shop_tld
    ).catch(err => console.error(`Failed to fetch ${selectedTargetTab} images:`, err))
  }, [selectedTargetTab, details])

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
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <ProductHeader
            onBack={navigateBack}
            identifier={{ label: 'SKU', value: sku }}
          />
          <Card className="border-destructive/50">
            <CardContent className="flex items-center justify-center py-8 sm:py-12 px-4 text-destructive text-sm sm:text-base">
              {error || 'Product not found'}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId) || details.source[0]
  const hasSourceDuplicates = details.source.length > 1
  const targetTlds = Object.keys(details.targets)
    .filter(tld => details.targets[tld].length > 0)
    .sort((a, b) => a.localeCompare(b))
  const targetCount = targetTlds.length
  const hasTargets = targetCount > 0
  const hasMultipleTargets = targetCount > 1
  const defaultTargetTab = hasMultipleTargets
    ? (targetTlds.find(tld => details.targets[tld].length === 0) ?? targetTlds[0])
    : null
  const activeTargetTab = selectedTargetTab ?? defaultTargetTab ?? targetTlds[0]
  
  if (!details.shops || !sourceProduct?.shop_tld) {
    return (
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <ProductHeader
            onBack={navigateBack}
            identifier={{ label: 'SKU', value: sku }}
          />
          <Card className="border-destructive/50">
            <CardContent className="flex items-center justify-center py-8 sm:py-12 px-4 text-destructive text-sm sm:text-base">
              Invalid product data structure
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-w-0">
      <LoadingShimmer show={navigating} position="top" />
      {hasMultipleTargets ? (
        <Tabs value={activeTargetTab} onValueChange={setSelectedTargetTab} className="w-full min-w-0">
          <div className="w-full p-4 sm:p-6">
            <ProductHeader
              onBack={navigateBack}
              identifier={{ label: 'SKU', value: sku }}
              targetTabs={{ tlds: targetTlds, activeTab: activeTargetTab }}
            />

            <div className={`grid gap-4 sm:gap-6 min-w-0 ${!hasTargets ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
              <div className={hasTargets ? '' : 'w-full'}>
                <ProductPanel
                  product={sourceProduct}
                  isSource={true}
                  languages={details.shops?.[sourceProduct.shop_tld]?.languages ?? []}
                  hasDuplicates={hasSourceDuplicates}
                  allProducts={details.source}
                  selectedProductId={selectedSourceProductId}
                  onProductSelect={(productId) => setSelectedSourceProductId(productId)}
                  compactLayout={!hasTargets}
                />
              </div>

              {hasTargets && (
                <div className="min-w-0">
                  {targetTlds.map(tld => {
                    const products = details.targets[tld]
                    if (products.length === 0) return null
                    const selectedProductId = selectedTargetProductIds[tld] || products[0].product_id
                    const product = products.find(p => p.product_id === selectedProductId) || products[0]
                    const hasDuplicates = products.length > 1
                    return (
                      <TabsContent key={tld} value={tld} className="mt-0">
                        <ProductPanel
                          product={product}
                          isSource={false}
                          languages={details.shops?.[tld]?.languages ?? []}
                          hasDuplicates={hasDuplicates}
                          allProducts={products}
                          selectedProductId={selectedProductId}
                          onProductSelect={(productId) => setSelectedTargetProductIds(prev => ({ ...prev, [tld]: productId }))}
                        />
                      </TabsContent>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </Tabs>
      ) : (
        <div className="w-full p-4 sm:p-6">
          <ProductHeader
            onBack={navigateBack}
            identifier={{ label: 'SKU', value: sku }}
          />
          <div className={`grid gap-4 sm:gap-6 min-w-0 ${!hasTargets ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
            <div className={hasTargets ? '' : 'w-full'}>
              <ProductPanel
                product={sourceProduct}
                isSource={true}
                languages={details.shops?.[sourceProduct.shop_tld]?.languages ?? []}
                hasDuplicates={hasSourceDuplicates}
                allProducts={details.source}
                selectedProductId={selectedSourceProductId}
                onProductSelect={(productId) => setSelectedSourceProductId(productId)}
                compactLayout={!hasTargets}
              />
            </div>
            {hasTargets && (() => {
              const tld = targetTlds[0]
              const products = details.targets[tld]
              const selectedProductId = selectedTargetProductIds[tld] || products[0].product_id
              const product = products.find(p => p.product_id === selectedProductId) || products[0]
              const hasDuplicates = products.length > 1
              return (
                <ProductPanel
                  product={product}
                  isSource={false}
                  languages={details.shops?.[tld]?.languages ?? []}
                  hasDuplicates={hasDuplicates}
                  allProducts={products}
                  selectedProductId={selectedProductId}
                  onProductSelect={(productId) => setSelectedTargetProductIds(prev => ({ ...prev, [tld]: productId }))}
                />
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
