"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Package, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { getShopColorClasses } from '@/lib/constants/shop-colors'
import { initializeShopColors } from '@/lib/constants/shop-colors'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref } from '@/lib/utils'

interface Language {
  code: string
  is_default: boolean
}

interface ProductContent {
  url?: string
  title?: string
  fulltitle?: string
  description?: string
  content?: string
}

interface VariantContent {
  title?: string
}

interface Variant {
  variant_id: number
  sku: string | null
  is_default: boolean
  price_excl: number
  image: {
    src?: string
    thumb?: string
    title?: string
  } | null
  content: Record<string, VariantContent>
}

interface ProductData {
  product_id: number
  shop_id: string
  shop_name: string
  shop_tld: string
  base_url: string
  visibility: string
  product_image: {
    src?: string
    thumb?: string
    title?: string
  } | null
  ls_created_at: string
  default_variant_id: number
  variant_count: number
  languages: Language[]
  content: Record<string, ProductContent>
  variants: Variant[]
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = params.productId as string

  const [details, setDetails] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize shop colors when data loads
  useEffect(() => {
    if (details?.shop_tld) {
      initializeShopColors([details.shop_tld], details.shop_tld)
    }
  }, [details])

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

  const handleBack = () => {
    setNavigating(true)
    // Preserve navigation state from URL
    const params = new URLSearchParams()
    const tab = searchParams.get('tab') || 'null_sku'
    const search = searchParams.get('search')
    const page = searchParams.get('page')
    const shopFilter = searchParams.get('shopFilter')
    const sortBy = searchParams.get('sortBy')
    const sortOrder = searchParams.get('sortOrder')
    
    // Always preserve tab
    params.set('tab', tab)
    if (search) params.set('search', search)
    if (page) params.set('page', page)
    if (shopFilter) params.set('shopFilter', shopFilter)
    if (sortBy) params.set('sortBy', sortBy)
    if (sortOrder) params.set('sortOrder', sortOrder)
    
    const queryString = params.toString()
    router.push(`/dashboard/sync-operations${queryString ? `?${queryString}` : ''}`, { scroll: false })
  }

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="w-full h-full p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          <Card className="border-destructive/50">
            <CardContent className="flex items-center justify-center py-12 text-destructive">
              {error || 'Product not found'}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <LoadingShimmer show={navigating} position="top" />
      
      <div className="w-full p-6">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          
          <div className="text-sm text-muted-foreground">
            Product ID: <code className="text-sm bg-muted px-2 py-1 rounded font-mono">{details.product_id}</code>
          </div>
        </div>

        {/* Single Product Panel - Full Width */}
        <ProductPanel product={details} />
      </div>
    </div>
  )
}

interface ProductPanelProps {
  product: ProductData
}

function ProductPanel({ product }: ProductPanelProps) {
  // Sort languages: default first, then alphabetically
  const sortedLanguages = [...(product.languages || [])].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })

  const defaultLanguage = sortedLanguages.find(l => l.is_default)?.code || sortedLanguages[0]?.code || 'nl'
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)

  const imageUrl = product.product_image?.src || product.product_image?.thumb
  const shopColorClass = getShopColorClasses(product.shop_tld)
  const defaultVariant = product.variants?.find(v => v.is_default) || product.variants?.[0]
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null

  return (
    <Card className="border-border/50 flex flex-col h-fit">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg flex items-center gap-2 flex-wrap mb-2">
              {shopUrl ? (
                <a
                  href={shopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:text-primary transition-colors flex items-center gap-1"
                >
                  {product.shop_name}
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <span className="truncate">{product.shop_name}</span>
              )}
              <Badge variant="outline" className={`text-sm ${shopColorClass} shrink-0`}>
                .{product.shop_tld}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {productAdminUrl && (
                <a
                  href={productAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium"
                >
                  <ExternalLink className="h-3 w-3" />
                  Product #{product.product_id}
                </a>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Product Image - Long */}
        <div className="w-full h-96 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.content?.[defaultLanguage]?.title || 'Product'}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <Package className="h-12 w-12 text-muted-foreground/30" />
          )}
        </div>

        {/* Product Metadata */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground block mb-1">Visibility</span>
            <div className="flex items-center gap-1.5">
              {product.visibility === 'visible' ? (
                <>
                  <Eye className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-700">Visible</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Hidden</span>
                </>
              )}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground block mb-1">Price</span>
            <div className="font-semibold text-base">
              €{defaultVariant?.price_excl?.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground block mb-1 text-base">Variants</span>
            <div className="font-medium text-lg">{product.variant_count}</div>
          </div>
          <div>
            <span className="text-muted-foreground block mb-1 text-base">Created</span>
            <div className="font-medium text-base">
              {new Date(product.ls_created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </div>
          </div>
        </div>

        {/* Language Tabs */}
        {sortedLanguages.length > 0 && (
          <div className="border-t border-border/50 pt-4">
            <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full">
              <TabsList className="grid w-full mb-3" style={{ gridTemplateColumns: `repeat(${sortedLanguages.length}, minmax(0, 1fr))` }}>
                {sortedLanguages.map(lang => (
                  <TabsTrigger 
                    key={lang.code} 
                    value={lang.code}
                    className="cursor-pointer uppercase font-medium text-xs"
                  >
                    {lang.code}
                    {lang.is_default && <span className="ml-1">★</span>}
                  </TabsTrigger>
                ))}
              </TabsList>

              {sortedLanguages.map(lang => {
                const content = product.content?.[lang.code] || {}
                return (
                  <TabsContent key={lang.code} value={lang.code} className="space-y-3">
                    {/* Slug (URL) */}
                    {content.url && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Slug
                        </label>
                        <div className="text-sm font-semibold break-all">
                          {content.url}
                        </div>
                      </div>
                    )}

                    {/* Title */}
                    {content.title && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Title
                        </label>
                        <div className="text-sm leading-snug break-words">
                          {content.title}
                        </div>
                      </div>
                    )}

                    {/* Fulltitle - Always show if exists */}
                    {content.fulltitle && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Fulltitle
                        </label>
                        <div className="text-sm break-words">
                          {content.fulltitle}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {content.description && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Description
                        </label>
                        <div className="text-sm text-muted-foreground break-words whitespace-pre-wrap">
                          {content.description}
                        </div>
                      </div>
                    )}

                    {/* Content - HTML rendered */}
                    {content.content && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Content
                        </label>
                        <div className="text-sm break-words max-h-96 overflow-y-auto border border-border/30 rounded-md p-3">
                          <div 
                            dangerouslySetInnerHTML={{ __html: content.content }} 
                            className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground"
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>
                )
              })}
            </Tabs>
          </div>
        )}

        {/* Variants Section - All Visible, Default on Top */}
        <div className="border-t border-border/50 pt-4">
          <h4 className="text-sm font-bold uppercase mb-3">Variants ({product.variants?.length || 0})</h4>
          <div className="space-y-3">
            {/* Sort: Default first, then by variant_id */}
            {[...(product.variants || [])]
              .sort((a, b) => {
                if (a.is_default && !b.is_default) return -1
                if (!a.is_default && b.is_default) return 1
                return a.variant_id - b.variant_id
              })
              .map(variant => {
                // Get title for current active language
                const variantTitle = variant.content?.[activeLanguage]?.title || 'No title'
                const variantImageUrl = variant.image?.thumb || variant.image?.src
                
                return (
                  <div key={variant.variant_id} className="border border-border/50 rounded-lg p-4">
                    {/* Variant Info */}
                    <div className="flex items-start gap-3">
                      {/* Variant Image or Fallback Icon */}
                      <div className="w-16 h-16 shrink-0 bg-muted rounded-md overflow-hidden flex items-center justify-center">
                        {variantImageUrl ? (
                          <img 
                            src={variantImageUrl} 
                            alt={variant.sku || 'Variant'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {variant.sku ? (
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                              {variant.sku}
                            </code>
                          ) : (
                            <Badge variant="outline" className="text-xs border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              No SKU
                            </Badge>
                          )}
                          {variant.is_default && (
                            <Badge variant="outline" className="text-xs border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              Default
                            </Badge>
                          )}
                          <span className="font-semibold text-base ml-auto">
                            €{variant.price_excl?.toFixed(2)}
                          </span>
                        </div>
                        
                        {/* Variant Title (current language only) */}
                        <div className="text-sm break-words leading-relaxed">
                          {variantTitle}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
