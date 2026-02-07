"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Package, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { ProductImagesGrid } from '@/components/sync-operations/ProductImagesGrid'
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
  sku: string
  is_default: boolean
  sort_order?: number
  price_excl: number
  image: {
    src?: string
    thumb?: string
    title?: string
  } | null
  content_by_language: Record<string, VariantContent>
}

interface ProductData {
  shop_id: string
  shop_name: string
  shop_tld: string
  shop_role: string
  base_url: string
  product_id: number
  default_variant_id: number
  sku: string
  matched_by_default_variant?: boolean
  visibility: string
  product_image: {
    src?: string
    thumb?: string
    title?: string
  } | null
  ls_created_at: string
  images_link?: string | null
  content_by_language: Record<string, ProductContent>
  variants: Variant[]
  variant_count: number
}

interface ProductDetails {
  source: ProductData[]  // Array because we might have duplicates
  targets: Record<string, ProductData[]>  // Grouped by TLD, each can have duplicates
  shop_languages: Record<string, Language[]>
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sku = params.sku as string

  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Selected product IDs for duplicates
  const [selectedSourceProductId, setSelectedSourceProductId] = useState<number | null>(null)
  const [selectedTargetProductIds, setSelectedTargetProductIds] = useState<Record<string, number>>({})

  useEffect(() => {
    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        const productId = searchParams.get('productId')
        
        // Regular product with SKU
        const url = `/api/product-details?sku=${encodeURIComponent(sku)}${productId ? `&productId=${productId}` : ''}`
        
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch product details')
        }
        
        const data = await response.json()
        setDetails(data)
        
        // Set initial selections
        if (data.source.length > 0) {
          // If productId provided, use it; otherwise use first
          const initialSourceId = productId ? parseInt(productId) : data.source[0].product_id
          setSelectedSourceProductId(initialSourceId)
        }
        
        // Set first target product for each shop
        const initialTargets: Record<string, number> = {}
        Object.entries(data.targets).forEach(([tld, products]) => {
          if ((products as ProductData[]).length > 0) {
            initialTargets[tld] = (products as ProductData[])[0].product_id
          }
        })
        setSelectedTargetProductIds(initialTargets)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product details')
      } finally {
        setLoading(false)
      }
    }

    fetchProductDetails()
  }, [sku, searchParams])

  const handleBack = () => {
    setNavigating(true)
    // Preserve navigation state from URL
    const params = new URLSearchParams()
    const tab = searchParams.get('tab') || 'create'
    const search = searchParams.get('search')
    const page = searchParams.get('page')
    const missingIn = searchParams.get('missingIn')
    const onlyDuplicates = searchParams.get('onlyDuplicates')
    const sortBy = searchParams.get('sortBy')
    const sortOrder = searchParams.get('sortOrder')
    
    // Always preserve tab
    params.set('tab', tab)
    if (search) params.set('search', search)
    if (page) params.set('page', page)
    
    // Add tab-specific parameters
    if (missingIn) params.set('missingIn', missingIn)
    if (onlyDuplicates) params.set('onlyDuplicates', onlyDuplicates)
    
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
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[44px] sm:min-h-0 touch-manipulation">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
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
  const targetCount = Object.keys(details.targets).filter(tld => details.targets[tld].length > 0).length
  const totalPanels = 1 + targetCount // source + targets
  const hasTargets = targetCount > 0
  
  // Safety check for shop_languages
  if (!details.shop_languages || !sourceProduct?.shop_tld) {
    return (
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[44px] sm:min-h-0 touch-manipulation">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
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
      
      <div className="w-full p-4 sm:p-6">
        {/* Header with Back Button and SKU */}
        <div className="flex flex-row items-center flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer min-h-[40px] sm:min-h-0 touch-manipulation shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1.5 sm:mr-2" />
            <span className="hidden sm:inline">Back to List</span>
            <span className="sm:hidden">Back</span>
          </Button>
          <div className="text-xs sm:text-sm text-muted-foreground min-w-0">
            SKU: <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 sm:py-1 rounded font-mono">{sku}</code>
          </div>
        </div>

        {/* Panel Layout - Equal width distribution */}
        <div className={`grid gap-4 sm:gap-6 min-w-0 ${
          !hasTargets 
            ? 'grid-cols-1' 
            : totalPanels === 2 
              ? 'grid-cols-1 lg:grid-cols-2' 
              : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
        }`}>
          {/* SOURCE PANEL */}
          <div className={hasTargets ? '' : 'w-full'}>
            <ProductPanel
              product={sourceProduct}
              isSource={true}
              languages={(details.shop_languages && sourceProduct?.shop_tld) ? (details.shop_languages[sourceProduct.shop_tld] || []) : []}
              hasDuplicates={hasSourceDuplicates}
              allProducts={details.source}
              selectedProductId={selectedSourceProductId}
              onProductSelect={(productId) => setSelectedSourceProductId(productId)}
              compactLayout={!hasTargets}
            />
          </div>

          {/* TARGET PANELS */}
          {Object.entries(details.targets)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([tld, products]) => {
              if (products.length === 0) return null
              
              const selectedProductId = selectedTargetProductIds[tld] || products[0].product_id
              const product = products.find(p => p.product_id === selectedProductId) || products[0]
              const hasDuplicates = products.length > 1
              
              return (
                <ProductPanel
                  key={`target-${tld}`}
                  product={product}
                  isSource={false}
                  languages={details.shop_languages[tld] || []}
                  hasDuplicates={hasDuplicates}
                  allProducts={products}
                  selectedProductId={selectedProductId}
                  onProductSelect={(productId) => setSelectedTargetProductIds(prev => ({ ...prev, [tld]: productId }))}
                />
              )
            })}
        </div>
      </div>
    </div>
  )
}

interface ProductPanelProps {
  product: ProductData
  isSource: boolean
  languages: Language[]
  hasDuplicates: boolean
  allProducts: ProductData[]
  selectedProductId: number | null
  onProductSelect: (productId: number) => void
  compactLayout?: boolean
}

function ProductPanel({ 
  product, 
  isSource, 
  languages,
  hasDuplicates,
  allProducts,
  selectedProductId,
  onProductSelect,
  compactLayout = false
}: ProductPanelProps) {
  // Sort languages: default first, then alphabetically
  const sortedLanguages = [...languages].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })

  const defaultLanguage = sortedLanguages.find(l => l.is_default)?.code || sortedLanguages[0]?.code || 'nl'
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)

  const imageUrl = product.product_image?.src || product.product_image?.thumb
  const defaultVariant = product.variants.find(v => v.is_default) || product.variants[0]
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null

  /* Shared: Duplicate Product Selector */
  const duplicateSelector = hasDuplicates && (
    <div className="mt-2 sm:mt-3 min-w-0 overflow-hidden">
      <Select 
        value={selectedProductId?.toString() || ''} 
        onValueChange={(val) => onProductSelect(parseInt(val))}
      >
        <SelectTrigger className="w-full max-w-full cursor-pointer h-9 sm:h-10 min-h-[40px] sm:min-h-0 touch-manipulation min-w-0">
          <SelectValue placeholder="Select product..." />
        </SelectTrigger>
        <SelectContent align="start" className="max-w-[calc(100vw-2rem)]" sideOffset={4} collisionPadding={16}>
          {allProducts.map((p) => {
            const content = p.content_by_language[defaultLanguage]
            const isDefault = p.variants.find(v => v.is_default) !== undefined
            return (
              <SelectItem key={p.product_id} value={p.product_id.toString()} className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm min-w-0 overflow-hidden">
                  <span className="font-mono text-xs shrink-0">{p.product_id}</span>
                  <span className="text-xs shrink-0">-</span>
                  <span className={`text-xs shrink-0 ${isDefault ? 'text-green-600 font-medium' : 'text-orange-600'}`}>
                    {isDefault ? 'default' : 'non-default'}
                  </span>
                  <span className="text-xs shrink-0">-</span>
                  <span className="truncate min-w-0">{content?.title || 'Untitled'}</span>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        {allProducts.length} duplicate {isSource ? 'source' : 'target'} products with this SKU
      </p>
    </div>
  )

  /* Compact layout (product-page style) - when only source */
  if (compactLayout) {
    return (
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="p-0">
          {/* Hero row: image + meta - stack on mobile */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 md:p-8 border-b border-border/50">
            <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50 self-start sm:self-auto">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={product.content_by_language[defaultLanguage]?.title || 'Product'}
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
                  <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-base sm:text-lg font-semibold truncate hover:text-primary transition-colors flex items-center gap-1">
                    {product.shop_name}
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  </a>
                ) : (
                  <span className="text-base sm:text-lg font-semibold truncate">{product.shop_name}</span>
                )}
                <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{product.shop_tld}</Badge>
                <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 shrink-0 text-xs sm:text-sm">Source</Badge>
              </div>
              {productAdminUrl && (
                <a href={productAdminUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium w-fit">
                  <ExternalLink className="h-3 w-3" />
                  Product #{product.product_id}
                </a>
              )}
              {duplicateSelector}
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
                  {new Date(product.ls_created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* 2-column layout: Language content | Variants - stack on mobile/tablet */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-w-0">
            {sortedLanguages.length > 0 && (
              <div className="p-4 sm:p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-border/50">
                <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full min-w-0">
                  <TabsList className="h-9 sm:h-10 mb-3 sm:mb-4 w-full flex p-0.5 sm:p-1 items-stretch flex-wrap sm:flex-nowrap gap-0.5 sm:gap-0">
                    {sortedLanguages.map(lang => (
                      <TabsTrigger key={lang.code} value={lang.code} className="cursor-pointer uppercase font-medium text-xs sm:text-sm flex-1 min-w-0 flex items-center justify-center gap-1 py-2 px-2 sm:px-3 touch-manipulation">
                        <span className="inline-flex items-center gap-1">
                          {lang.code}
                          {lang.is_default && <span className="leading-none">★</span>}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {sortedLanguages.map(lang => {
                    const content = product.content_by_language[lang.code] || {}
                    return (
                      <TabsContent key={lang.code} value={lang.code} className="space-y-4 mt-0">
                        {content.url && (
                          <div className="min-w-0 overflow-hidden">
                            <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">Slug:</label>
                            <div className="text-sm sm:text-base font-mono truncate" title={content.url}>
                              {shopUrl ? (
                                <a href={`${shopUrl.replace(/\/$/, '')}${!lang.is_default ? `/${lang.code}` : ''}/${content.url}.html`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 hover:underline truncate block">
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
                              <div dangerouslySetInnerHTML={{ __html: content.content }} className="prose prose-base max-w-none [&>:first-child]:mt-0 prose-headings:text-foreground prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-2 prose-p:text-muted-foreground prose-p:my-2 prose-li:text-muted-foreground prose-strong:text-foreground prose-ul:my-2 prose-ol:my-2" />
                            </div>
                          </div>
                        )}
                      </TabsContent>
                    )
                  })}
                </Tabs>
              </div>
            )}
            <div className={cn("p-4 sm:p-6 md:p-8", sortedLanguages.length === 0 && "lg:col-span-2")}>
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Variants ({product.variants.length})</h4>
              <div className="space-y-2 sm:space-y-3">
                {[...product.variants].sort((a, b) => (a.is_default ? -1 : b.is_default ? 1 : 0)).map(variant => {
                  const variantTitle = variant.content_by_language[activeLanguage]?.title || 'No title'
                  const variantImageUrl = variant.image?.thumb || variant.image?.src
                  return (
                    <div key={variant.variant_id} className="flex items-center gap-3 sm:gap-4 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors min-w-0">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                        {variantImageUrl ? <img src={variantImageUrl} alt={variant.sku} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 sm:h-7 sm:w-7 text-muted-foreground/50" />}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 rounded font-mono truncate max-w-full">{variant.sku}</code>
                          {variant.is_default && <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400 shrink-0">Default</Badge>}
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

  /* Default layout (multi-panel style) - when source + targets */
  return (
    <Card className="border-border/50 flex flex-col h-fit overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
              {shopUrl ? (
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors flex items-center gap-1">
                  {product.shop_name}
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{product.shop_name}</span>
              )}
              <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{product.shop_tld}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isSource ? 'default' : 'secondary'} className={isSource ? 'bg-blue-600 hover:bg-blue-700' : ''}>
                {isSource ? 'Source' : 'Target'}
              </Badge>
              {!isSource && product.matched_by_default_variant !== undefined && (
                <Badge variant="outline" className={product.matched_by_default_variant ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300' : 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300'}>
                  {product.matched_by_default_variant ? <><CheckCircle2 className="h-3 w-3 mr-1" />Default Match</> : <><AlertCircle className="h-3 w-3 mr-1" />Non-default Match</>}
                </Badge>
              )}
              {productAdminUrl && (
                <a href={productAdminUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium">
                  <ExternalLink className="h-3 w-3" />
                  Product #{product.product_id}
                </a>
              )}
            </div>
          </div>
        </div>
        {duplicateSelector}
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        {/* Photo + metadata - side by side on all screens */}
        <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
          <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt={product.content_by_language[defaultLanguage]?.title || 'Product'} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-2 sm:gap-y-4 text-[13px] sm:text-sm md:text-base">
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Visibility</span>
              <div className="flex items-center gap-1 sm:gap-1.5">
                {(() => {
                  const vis = getVisibilityOption(product.visibility)
                  return <><vis.Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${vis.iconClassName}`} /><span className={`font-medium ${vis.labelClassName || vis.iconClassName}`}>{vis.label}</span></>
                })()}
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Price</span>
              <div className="font-medium">€{defaultVariant?.price_excl?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Variants</span>
              <div className="font-medium">{product.variant_count}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Created</span>
              <div className="font-medium">
                {new Date(product.ls_created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {sortedLanguages.length > 0 && (
          <div className="border-t border-border/50 pt-3 sm:pt-4">
            <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="w-full min-w-0">
              <TabsList className="flex w-full mb-2 sm:mb-3 h-9 sm:h-10 p-0.5 sm:p-1 items-stretch gap-0">
                {sortedLanguages.map(lang => (
                  <TabsTrigger 
                    key={lang.code} 
                    value={lang.code}
                    className="cursor-pointer uppercase font-medium text-xs sm:text-sm flex-1 min-w-0 py-2 px-2 sm:px-3 touch-manipulation flex items-center justify-center gap-1 h-full"
                  >
                    <span className="inline-flex items-center gap-1">
                      {lang.code}
                      {lang.is_default && <span className="leading-none">★</span>}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {sortedLanguages.map(lang => {
                const content = product.content_by_language[lang.code] || {}
                return (
                  <TabsContent key={lang.code} value={lang.code} className="space-y-3">
                    {/* Slug (URL) */}
                    {content.url && (
                      <div className="min-w-0 overflow-hidden">
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Slug:
                        </label>
                        <div className="text-sm font-semibold font-mono truncate" title={content.url}>
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

                    {/* Title */}
                    {content.title && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Title:
                        </label>
                        <div className="text-sm leading-snug break-words">
                          {content.title}
                        </div>
                      </div>
                    )}

                    {/* Full Title - Always show if exists */}
                    {content.fulltitle && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Full Title:
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
                          Description:
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
                          Content:
                        </label>
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

        {/* Variants Section - All Visible, Default on Top (right column in multi-panel) */}
        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Variants ({product.variants.length})</h4>
          <div className="space-y-2 sm:space-y-3">
            {/* Sort by sort_order from Lightspeed (default first as fallback) */}
            {[...product.variants]
              .sort((a, b) => {
                const sa = a.sort_order ?? 999999
                const sb = b.sort_order ?? 999999
                if (sa !== sb) return sa - sb
                if (a.is_default && !b.is_default) return -1
                if (!a.is_default && b.is_default) return 1
                return a.variant_id - b.variant_id
              })
              .map(variant => {
                const variantTitle = variant.content_by_language[activeLanguage]?.title || 'No title'
                const variantImageUrl = variant.image?.thumb || variant.image?.src
                
                return (
                  <div key={variant.variant_id} className="flex items-center gap-3 sm:gap-4 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors min-w-0">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      {variantImageUrl ? (
                        <img src={variantImageUrl} alt={variant.sku} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 rounded font-mono truncate max-w-full">{variant.sku}</code>
                        {variant.is_default && (
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400 shrink-0">
                            Default
                          </Badge>
                        )}
                        <span className="text-xs sm:text-sm font-semibold ml-auto shrink-0">€{variant.price_excl?.toFixed(2)}</span>
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-none">
                        {variantTitle}
                      </div>
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
      </CardContent>
    </Card>
  )
}
