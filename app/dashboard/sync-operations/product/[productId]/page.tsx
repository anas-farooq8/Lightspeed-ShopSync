"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Package, ExternalLink } from 'lucide-react'
import { ProductImagesGrid } from '@/components/sync-operations/ProductImagesGrid'
import { getVisibilityOption } from '@/lib/constants/visibility'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref, cn } from '@/lib/utils'
import { clearProductImagesCache } from '@/lib/product-images-cache'

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
  sort_order?: number
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
  images_link?: string | null
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

  // Clear product images cache when leaving this page (Back to List, etc.)
  useEffect(() => {
    return () => clearProductImagesCache()
  }, [])

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
      <div className="w-full min-h-screen flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="w-full p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 mb-4 sm:mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[44px] sm:min-h-0 touch-manipulation">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </div>
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
        <div className="flex flex-row items-center flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[40px] sm:min-h-0 touch-manipulation shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Back to List</span>
            <span className="sm:hidden">Back</span>
          </Button>
          <div className="text-xs sm:text-sm text-muted-foreground min-w-0">
            Product Id: <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-mono">{details.product_id}</code>
          </div>
        </div>

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
  const defaultVariant = product.variants?.find(v => v.is_default) || product.variants?.[0]
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null

  return (
    <Card className="border-border/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Hero row: image + meta - stack on mobile */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 md:p-8 border-b border-border/50">
          <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50 self-start sm:self-auto">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.content?.[defaultLanguage]?.title || 'Product'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Package className="h-12 w-12 text-muted-foreground/40" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {shopUrl ? (
                <a
                  href={shopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base sm:text-lg font-semibold truncate hover:text-primary transition-colors flex items-center gap-1"
                >
                  {product.shop_name}
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                </a>
              ) : (
                <span className="text-base sm:text-lg font-semibold truncate">{product.shop_name}</span>
              )}
              <Badge variant="outline" className="text-xs sm:text-sm shrink-0">
                .{product.shop_tld}
              </Badge>
            </div>
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
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm">
              {(() => {
                const vis = getVisibilityOption(product.visibility)
                return (
                  <span className={`inline-flex items-center gap-1 sm:gap-1.5 ${vis.labelClassName || vis.iconClassName}`}>
                    <vis.Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${vis.iconClassName}`} />
                    {vis.label}
                  </span>
                )
              })()}
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold">€{defaultVariant?.price_excl?.toFixed(2) || '0.00'}</span>
              <span className="text-muted-foreground">·</span>
              <span>{product.variant_count} variant{product.variant_count !== 1 ? 's' : ''}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {new Date(product.ls_created_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        {/* 2-column layout: Language content | Variants - stack on mobile/tablet */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-w-0">
          {/* Language Tabs - Left column */}
          {sortedLanguages.length > 0 && (
            <div className="p-4 sm:p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-border/50">
              <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full min-w-0">
                <TabsList className="h-9 sm:h-10 mb-3 sm:mb-4 w-full flex p-0.5 sm:p-1 items-stretch flex-wrap sm:flex-nowrap gap-0.5 sm:gap-0">
                  {sortedLanguages.map(lang => (
                    <TabsTrigger 
                      key={lang.code} 
                      value={lang.code}
                      className="cursor-pointer uppercase text-xs sm:text-sm flex-1 min-w-0 items-center justify-center py-2 px-2 sm:px-3 touch-manipulation"
                    >
                      {lang.code}
                      {lang.is_default && <span className="ml-0.5">★</span>}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {sortedLanguages.map(lang => {
                  const content = product.content?.[lang.code] || {}
                  return (
                    <TabsContent key={lang.code} value={lang.code} className="space-y-4 mt-0">
                      {content.url && (
                        <div className="min-w-0 overflow-hidden">
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Slug:</label>
                          <div className="text-sm sm:text-base font-mono truncate" title={content.url}>
                            {shopUrl ? (
                              <a
                                href={`${shopUrl.replace(/\/$/, '')}${!lang.is_default ? `/${lang.code}` : ''}/${content.url}.html`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700 hover:underline truncate block"
                              >
                                {content.url}
                              </a>
                            ) : (
                              <span className="truncate block">{content.url}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {content.title && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Title:</label>
                          <div className="text-sm sm:text-base break-words">{content.title}</div>
                        </div>
                      )}
                      {content.fulltitle && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Full Title:</label>
                          <div className="text-sm sm:text-base break-words text-muted-foreground">{content.fulltitle}</div>
                        </div>
                      )}
                      {content.description && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Description:</label>
                          <div className="text-sm sm:text-base text-muted-foreground break-words whitespace-pre-wrap max-h-24 sm:max-h-32 overflow-y-auto">{content.description}</div>
                        </div>
                      )}
                      {content.content && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Content:</label>
                          <div className="text-sm sm:text-base break-words max-h-[20rem] sm:max-h-[28rem] overflow-y-auto border border-border/40 rounded-lg p-3 sm:p-4 bg-muted/30">
                            <div 
                              dangerouslySetInnerHTML={{ __html: content.content }} 
                              className="prose prose-base max-w-none [&>:first-child]:mt-0 prose-headings:text-foreground prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-2 prose-p:text-muted-foreground prose-p:my-2 prose-li:text-muted-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2"
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

          {/* Variants Section - Right column (full width when no languages) */}
          <div className={cn("p-4 sm:p-6 md:p-8", sortedLanguages.length === 0 && "lg:col-span-2")}>
            <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">
              Variants ({product.variants?.length || 0})
            </h4>
            <div className="space-y-2 sm:space-y-3">
              {[...(product.variants || [])]
                .sort((a, b) => {
                  const sa = a.sort_order ?? 999999
                  const sb = b.sort_order ?? 999999
                  if (sa !== sb) return sa - sb
                  if (a.is_default && !b.is_default) return -1
                  if (!a.is_default && b.is_default) return 1
                  return a.variant_id - b.variant_id
                })
                .map(variant => {
                  const variantTitle = variant.content?.[activeLanguage]?.title || 'No title'
                  const variantImageUrl = variant.image?.thumb || variant.image?.src
                  
                  return (
                    <div key={variant.variant_id} className="flex items-center gap-3 sm:gap-4 py-3 sm:py-3 px-3.5 sm:px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors min-w-0">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        {variantImageUrl ? (
                          <img src={variantImageUrl} alt={variant.sku || 'Variant'} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 sm:h-7 sm:w-7 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          {variant.sku ? (
                            <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 rounded font-mono truncate max-w-full">{variant.sku}</code>
                          ) : (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-amber-500/70 text-amber-700 dark:text-amber-400 shrink-0">
                              No SKU
                            </Badge>
                          )}
                          {variant.is_default && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400 shrink-0">
                              Default
                            </Badge>
                          )}
                          <span className="text-xs sm:text-sm font-semibold ml-auto shrink-0">€{variant.price_excl?.toFixed(2)}</span>
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 break-words leading-relaxed line-clamp-2 sm:line-clamp-none">{variantTitle}</div>
                      </div>
                    </div>
                  )
                })}
            </div>
            {/* Product Images - below variants in right column */}
            {product.images_link && (
              <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
                <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
                <ProductImagesGrid imagesLink={product.images_link} shopTld={product.shop_tld} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
