import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { ProductImagesGrid } from '@/components/sync-operations/product-display/ProductImagesGrid'
import { ProductMetadata } from '@/components/sync-operations/product-display/ProductMetadata'
import { LanguageContentTabs } from '@/components/sync-operations/product-display/LanguageContentTabs'
import { VariantsList } from '@/components/sync-operations/product-display/VariantsList'
import { DuplicateProductSelector } from '@/components/sync-operations/product-display/DuplicateProductSelector'
import { toSafeExternalHref, cn, sortLanguages, getDefaultLanguageCode } from '@/lib/utils'
import type { ProductData, Language } from '@/types/product'

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

export function ProductPanel({ 
  product, 
  isSource, 
  languages,
  hasDuplicates,
  allProducts,
  selectedProductId,
  onProductSelect,
  compactLayout = false
}: ProductPanelProps) {
  const sortedLanguages = sortLanguages(languages)
  const defaultLanguage = getDefaultLanguageCode(languages)
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null

  const content = product.content_by_language || product.content || {}

  if (compactLayout) {
    return (
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="p-0">
          <ProductMetadata 
            product={product} 
            defaultLanguage={defaultLanguage}
            isSource={isSource}
            compactLayout={true}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 min-w-0">
            {sortedLanguages.length > 0 && (
              <div className="p-4 sm:p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-border/50">
                <LanguageContentTabs
                  languages={sortedLanguages}
                  content={content}
                  baseUrl={product.base_url}
                  onLanguageChange={setActiveLanguage}
                />
              </div>
            )}
            <div className={cn("p-4 sm:p-6 md:p-8", sortedLanguages.length === 0 && "lg:col-span-2")}>
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">
                Variants ({product.variants.length})
              </h4>
              <VariantsList 
                variants={product.variants} 
                activeLanguage={activeLanguage}
              />
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

  // Multi-panel layout
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
              <Badge variant={isSource ? 'default' : 'secondary'} className={isSource ? 'bg-blue-600 hover:bg-blue-700' : ''}>
                {isSource ? 'Source' : 'Target'}
              </Badge>
              {!isSource && product.matched_by_default_variant !== undefined && (
                <Badge variant="outline" className={product.matched_by_default_variant ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300' : 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300'}>
                  {product.matched_by_default_variant ? <><CheckCircle2 className="h-3 w-3 mr-1" />Default Match</> : <><AlertCircle className="h-3 w-3 mr-1" />Non-default Match</>}
                </Badge>
              )}
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
          isSource={isSource}
        />
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        <ProductMetadata 
          product={product}
          defaultLanguage={defaultLanguage}
          isSource={isSource}
          compactLayout={false}
        />

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
          <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">
            Variants ({product.variants.length})
          </h4>
          <VariantsList 
            variants={product.variants}
            activeLanguage={activeLanguage}
          />
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
