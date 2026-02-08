import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, ExternalLink } from 'lucide-react'
import { ProductImagesGrid } from '@/components/sync-operations/product-display/ProductImagesGrid'
import { LanguageContentTabs } from '@/components/sync-operations/product-display/LanguageContentTabs'
import { VariantsList } from '@/components/sync-operations/product-display/VariantsList'
import { DuplicateProductSelector } from '@/components/sync-operations/product-display/DuplicateProductSelector'
import { toSafeExternalHref } from '@/lib/utils'
import type { ProductData, Language, ProductImage } from '@/types/product'

interface SourcePanelProps {
  product: ProductData
  languages: Language[]
  hasDuplicates: boolean
  allProducts: ProductData[]
  selectedProductId: number | null
  onProductSelect: (id: number) => void
  productImages: ProductImage[]
}

export function SourcePanel({ 
  product, 
  languages,
  hasDuplicates,
  allProducts,
  selectedProductId,
  onProductSelect,
  productImages
}: SourcePanelProps) {
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

  const content = product.content_by_language || {}

  return (
    <Card className="border-border/50 flex flex-col h-fit overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
              {shopUrl ? (
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
                  {product.shop_name}
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{product.shop_name}</span>
              )}
              <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{product.shop_tld}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">Source</Badge>
              {productAdminUrl && (
                <a href={productAdminUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium cursor-pointer">
                  <ExternalLink className="h-3 w-3" />
                  Product #{product.product_id}
                </a>
              )}
            </div>
          </div>
        </div>
        <DuplicateProductSelector
          products={allProducts}
          selectedProductId={selectedProductId}
          onProductSelect={onProductSelect}
          defaultLanguage={defaultLanguage}
          isSource={true}
        />
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
          <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
            {imageUrl ? (
              <img src={imageUrl} alt={content[defaultLanguage]?.title || 'Product'} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-2 sm:gap-y-4 text-[13px] sm:text-sm md:text-base">
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Price</span>
              <div className="font-medium">€{defaultVariant?.price_excl?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Variants</span>
              <div className="font-medium">{product.variant_count}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center col-span-2">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Created</span>
              <div className="font-medium">
                {new Date(product.ls_created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {sortedLanguages.length > 0 && (
          <div className="border-t border-border/50 pt-3 sm:pt-4">
            <LanguageContentTabs
              languages={sortedLanguages}
              content={content}
              baseUrl={product.base_url}
              onLanguageChange={setActiveLanguage}
            />
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Variants ({product.variants.length})</h4>
          <VariantsList 
            variants={product.variants}
            activeLanguage={activeLanguage}
          />
          {productImages.length > 0 && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {productImages.map(img => (
                  <div key={img.id} className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                    {img.title && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="relative px-3.5 py-2 rounded bg-[#2d2d2d] text-white text-sm font-medium whitespace-nowrap shadow-lg">
                          {img.title}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-[6px] border-solid border-transparent border-t-[#2d2d2d]" />
                        </div>
                      </div>
                    )}
                    <img src={img.src || img.thumb} alt={img.title || ''} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
