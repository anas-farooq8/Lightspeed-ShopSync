"use client"

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Package, ExternalLink, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
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
  sku: string
  is_default: boolean
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

  // Initialize shop colors when data loads
  useEffect(() => {
    if (details && details.source.length > 0) {
      const targetTlds = Object.keys(details.targets)
      const allTlds = [details.source[0].shop_tld, ...targetTlds]
      initializeShopColors(allTlds, details.source[0].shop_tld)
    }
  }, [details])

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

  const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId) || details.source[0]
  const hasSourceDuplicates = details.source.length > 1
  const targetCount = Object.keys(details.targets).filter(tld => details.targets[tld].length > 0).length
  const totalPanels = 1 + targetCount // source + targets
  const hasTargets = targetCount > 0
  
  // Safety check for shop_languages
  if (!details.shop_languages || !sourceProduct?.shop_tld) {
    return (
      <div className="w-full h-full p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          <Card className="border-destructive/50">
            <CardContent className="flex items-center justify-center py-12 text-destructive">
              Invalid product data structure
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
        {/* Header with Back Button and SKU */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          <div className="text-sm text-muted-foreground">
            SKU: <code className="text-sm bg-muted px-2 py-1 rounded font-mono">{sku}</code>
          </div>
        </div>

        {/* Panel Layout - Equal width distribution */}
        <div className={`grid gap-6 ${
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
}

function ProductPanel({ 
  product, 
  isSource, 
  languages,
  hasDuplicates,
  allProducts,
  selectedProductId,
  onProductSelect
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
  const shopColorClass = getShopColorClasses(product.shop_tld)
  const defaultVariant = product.variants.find(v => v.is_default) || product.variants[0]
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
              <Badge variant={isSource ? 'default' : 'secondary'} className={isSource ? 'bg-blue-600 hover:bg-blue-700' : ''}>
                {isSource ? 'Source' : 'Target'}
              </Badge>
              
              {!isSource && product.matched_by_default_variant !== undefined && (
                <Badge 
                  variant="outline" 
                  className={product.matched_by_default_variant 
                    ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300' 
                    : 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300'
                  }
                >
                  {product.matched_by_default_variant ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Default Match
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Non-default Match
                    </>
                  )}
                </Badge>
              )}
              
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

        {/* Duplicate Product Selector */}
        {hasDuplicates && (
          <div className="mt-3">
            <Select 
              value={selectedProductId?.toString() || ''} 
              onValueChange={(val) => onProductSelect(parseInt(val))}
            >
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {allProducts.map((p) => {
                  const content = p.content_by_language[defaultLanguage]
                  const isDefault = p.variants.find(v => v.is_default) !== undefined
                  return (
                    <SelectItem key={p.product_id} value={p.product_id.toString()} className="cursor-pointer">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs shrink-0">
                          {p.product_id}
                        </span>
                        <span className="text-xs shrink-0">-</span>
                        <span className={`text-xs shrink-0 ${isDefault ? 'text-green-600 font-medium' : 'text-orange-600'}`}>
                          {isDefault ? 'default' : 'non-default'}
                        </span>
                        <span className="text-xs shrink-0">-</span>
                        <span className="truncate">{content?.title || 'Untitled'}</span>
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
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Product Image - Long */}
        <div className="w-full h-96 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.content_by_language[defaultLanguage]?.title || 'Product'}
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
                const content = product.content_by_language[lang.code] || {}
                return (
                  <TabsContent key={lang.code} value={lang.code} className="space-y-3">
                    {/* Slug (URL) */}
                    {content.url && (
                      <div>
                        <label className="text-sm font-bold text-foreground uppercase mb-1.5 block">
                          Slug:
                        </label>
                        <div className="text-sm font-semibold break-all">
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

        {/* Variants Section - All Visible, Default on Top */}
        <div className="border-t border-border/50 pt-4">
          <h4 className="text-sm font-bold uppercase mb-3">Variants ({product.variants.length})</h4>
          <div className="space-y-3">
            {/* Sort: Default first, then by variant_id */}
            {[...product.variants]
              .sort((a, b) => {
                if (a.is_default && !b.is_default) return -1
                if (!a.is_default && b.is_default) return 1
                return a.variant_id - b.variant_id
              })
              .map(variant => {
                // Get title for current active language
                const variantTitle = variant.content_by_language[activeLanguage]?.title || 'No title'
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
                            alt={variant.sku}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {variant.sku}
                          </code>
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
