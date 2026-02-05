"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Package, ExternalLink } from 'lucide-react'
import { getVisibilityOption } from '@/lib/constants/visibility'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref, cn } from '@/lib/utils'

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
      <div className="w-full min-h-[200px] flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="w-full p-6 sm:p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-8 text-destructive text-sm">
            {error || 'Product not found'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-auto">
      <LoadingShimmer show={navigating} position="top" />
      
      <div className="w-full max-w-7xl mx-auto p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          <div className="text-sm text-muted-foreground">
            Product Id: <code className="text-sm bg-muted px-2 py-1 rounded font-mono">{details.product_id}</code>
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
        {/* Hero row: larger image + meta */}
        <div className="flex gap-6 p-6 sm:p-8 border-b border-border/50">
          <div className="w-32 h-32 sm:w-40 sm:h-40 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50">
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

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {shopUrl ? (
                <a
                  href={shopUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-semibold truncate hover:text-primary transition-colors flex items-center gap-1"
                >
                  {product.shop_name}
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
              ) : (
                <span className="text-lg font-semibold truncate">{product.shop_name}</span>
              )}
              <Badge variant="outline" className="text-sm shrink-0">
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
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {(() => {
                const vis = getVisibilityOption(product.visibility)
                return (
                  <span className={`inline-flex items-center gap-1.5 text-sm ${vis.labelClassName || vis.iconClassName}`}>
                    <vis.Icon className={`h-4 w-4 ${vis.iconClassName}`} />
                    {vis.label}
                  </span>
                )
              })()}
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-base font-semibold">€{defaultVariant?.price_excl?.toFixed(2) || '0.00'}</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm">{product.variant_count} variant{product.variant_count !== 1 ? 's' : ''}</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">
                {new Date(product.ls_created_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        {/* 2-column layout: Language content | Variants */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Language Tabs - Left column */}
          {sortedLanguages.length > 0 && (
            <div className="p-6 sm:p-8 border-b lg:border-b-0 lg:border-r border-border/50">
              <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full">
                <TabsList className="h-10 mb-4 w-full flex p-1 items-stretch">
                  {sortedLanguages.map(lang => (
                    <TabsTrigger 
                      key={lang.code} 
                      value={lang.code}
                      className="cursor-pointer uppercase text-sm flex-1 min-w-0 items-center justify-center"
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
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Slug:</label>
                          <div className="text-base break-all font-mono">
                            {shopUrl ? (
                              <a
                                href={`${shopUrl.replace(/\/$/, '')}/${content.url}.html`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                {content.url}
                              </a>
                            ) : (
                              content.url
                            )}
                          </div>
                        </div>
                      )}
                      {content.title && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Title:</label>
                          <div className="text-base break-words">{content.title}</div>
                        </div>
                      )}
                      {content.fulltitle && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Full Title:</label>
                          <div className="text-base break-words text-muted-foreground">{content.fulltitle}</div>
                        </div>
                      )}
                      {content.description && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Description:</label>
                          <div className="text-base text-muted-foreground break-words whitespace-pre-wrap max-h-32 overflow-y-auto">{content.description}</div>
                        </div>
                      )}
                      {content.content && (
                        <div>
                          <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Content:</label>
                          <div className="text-base break-words max-h-[28rem] overflow-y-auto border border-border/40 rounded-lg p-4 bg-muted/30">
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
          <div className={cn("p-6 sm:p-8", sortedLanguages.length === 0 && "lg:col-span-2")}>
            <h4 className="text-sm font-bold uppercase mb-3">
              Variants ({product.variants?.length || 0})
            </h4>
            <div className="space-y-3">
              {[...(product.variants || [])]
                .sort((a, b) => {
                  if (a.is_default && !b.is_default) return -1
                  if (!a.is_default && b.is_default) return 1
                  return a.variant_id - b.variant_id
                })
                .map(variant => {
                  const variantTitle = variant.content?.[activeLanguage]?.title || 'No title'
                  const variantImageUrl = variant.image?.thumb || variant.image?.src
                  
                  return (
                    <div key={variant.variant_id} className="flex items-center gap-4 py-3 px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors">
                      <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        {variantImageUrl ? (
                          <img src={variantImageUrl} alt={variant.sku || 'Variant'} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {variant.sku ? (
                            <code className="text-sm bg-muted px-2 py-0.5 rounded font-mono">{variant.sku}</code>
                          ) : (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-500/70 text-amber-700 dark:text-amber-400">
                              No SKU
                            </Badge>
                          )}
                          {variant.is_default && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400">
                              Default
                            </Badge>
                          )}
                          <span className="text-sm font-semibold ml-auto">€{variant.price_excl?.toFixed(2)}</span>
                        </div>
                        <div className="text-sm text-muted-foreground truncate mt-1">{variantTitle}</div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
