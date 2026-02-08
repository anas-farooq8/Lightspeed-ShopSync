import { Badge } from '@/components/ui/badge'
import { Package, ExternalLink } from 'lucide-react'
import { getVisibilityOption } from '@/lib/constants/visibility'
import { toSafeExternalHref } from '@/lib/utils'
import type { ProductData } from '@/types/product'

interface ProductMetadataProps {
  product: ProductData
  defaultLanguage: string
  isSource?: boolean
  compactLayout?: boolean
}

export function ProductMetadata({ 
  product, 
  defaultLanguage, 
  isSource = false,
  compactLayout = false 
}: ProductMetadataProps) {
  const imageUrl = product.product_image?.src || product.product_image?.thumb
  const defaultVariant = product.variants.find(v => v.is_default) || product.variants[0]
  const shopUrl = toSafeExternalHref(product.base_url)
  const productAdminUrl = shopUrl ? `${shopUrl}/admin/products/${product.product_id}` : null
  const visibilityInfo = getVisibilityOption(product.visibility)

  const content = product.content_by_language?.[defaultLanguage] || product.content?.[defaultLanguage]

  if (compactLayout) {
    return (
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 md:p-8 border-b border-border/50">
        <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50 self-start sm:self-auto">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={content?.title || 'Product'}
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
              <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="text-base sm:text-lg font-semibold truncate hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
                {product.shop_name}
                <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              </a>
            ) : (
              <span className="text-base sm:text-lg font-semibold truncate">{product.shop_name}</span>
            )}
            <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{product.shop_tld}</Badge>
            {isSource && (
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 shrink-0 text-xs sm:text-sm">Source</Badge>
            )}
          </div>
          {productAdminUrl && (
            <a href={productAdminUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium w-fit cursor-pointer">
              <ExternalLink className="h-3 w-3" />
              Product #{product.product_id}
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm">
            <span className={`inline-flex items-center gap-1 sm:gap-1.5 ${visibilityInfo.labelClassName || visibilityInfo.iconClassName}`}>
              <visibilityInfo.Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${visibilityInfo.iconClassName}`} />
              {visibilityInfo.label}
            </span>
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
    )
  }

  // Multi-panel layout
  return (
    <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
      <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={content?.title || 'Product'} className="w-full h-full object-cover" loading="lazy" />
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
            {new Date(product.ls_created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  )
}
