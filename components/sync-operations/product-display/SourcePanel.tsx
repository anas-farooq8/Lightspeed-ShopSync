import { useState, useMemo, memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, ExternalLink } from 'lucide-react'
import { LanguageContentTabs } from '@/components/sync-operations/product-display/LanguageContentTabs'
import { VariantsList } from '@/components/sync-operations/product-display/VariantsList'
import { DuplicateProductSelector } from '@/components/sync-operations/product-display/DuplicateProductSelector'
import { ProductImagesGrid, type ProductImageMeta } from '@/components/sync-operations/product-display/ProductImagesGrid'
import { getVisibilityOption } from '@/lib/constants/product-ui'
import { toSafeExternalHref, formatDateShort, sortLanguages, getDefaultLanguageCode, getImageUrl, getDisplayProductImage } from '@/lib/utils'
import type { ProductData, Language } from '@/types/product'

interface SourcePanelProps {
  product: ProductData
  languages: Language[]
  hasDuplicates: boolean
  allProducts: ProductData[]
  selectedProductId: number | null
  onProductSelect: (id: number) => void
  /** Pre-fetched source images (create-preview: pass from page so grid does not fetch). */
  sourceImages?: ProductImageMeta[] | null
  /** When true (preview-create source switching), shows loading on the duplicate selector. */
  sourceSwitching?: boolean
}

function SourcePanelInner({ 
  product, 
  languages,
  hasDuplicates,
  allProducts,
  selectedProductId,
  onProductSelect,
  sourceImages,
  sourceSwitching = false
}: SourcePanelProps) {
  const defaultLanguage = getDefaultLanguageCode(languages)
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage)
  const sortedLanguages = sortLanguages(languages)
  const displayImage = useMemo(
    () => getDisplayProductImage(product, sourceImages ?? undefined) ?? product.product_image ?? null,
    [product, sourceImages]
  )
  const imageUrl = useMemo(() => getImageUrl(displayImage), [displayImage])
  const defaultVariant = useMemo(
    () => product.variants.find(v => v.is_default) || product.variants[0],
    [product.variants]
  )
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null

  const content = product.content_by_language || {}
  const visibilityInfo = getVisibilityOption(product.visibility)

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
          loading={sourceSwitching}
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
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Visibility</span>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <visibilityInfo.Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${visibilityInfo.iconClassName}`} />
                <span className={`font-medium ${visibilityInfo.labelClassName || visibilityInfo.iconClassName}`}>
                  {visibilityInfo.label}
                </span>
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
                {formatDateShort(product.ls_created_at)}
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
              showSlug={false}
            />
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Variants ({product.variants.length})</h4>
          <VariantsList 
            variants={product.variants}
            activeLanguage={activeLanguage}
          />
          {(product.images_link || (sourceImages != null && sourceImages.length > 0)) && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
              <ProductImagesGrid
                productId={product.product_id}
                imagesLink={product.images_link}
                shopTld={product.shop_tld}
                images={sourceImages ?? undefined}
                productOrSrc={product.product_image ? { product_image: product.product_image } : null}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export const SourcePanel = memo(SourcePanelInner)
