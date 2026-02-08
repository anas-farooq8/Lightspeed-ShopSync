import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'
import type { Variant } from '@/types/product'

interface VariantsListProps {
  variants: Variant[]
  activeLanguage: string
  showSku?: boolean
}

export function VariantsList({ variants, activeLanguage, showSku = true }: VariantsListProps) {
  const sortedVariants = [...variants].sort((a, b) => {
    const sa = a.sort_order ?? 999999
    const sb = b.sort_order ?? 999999
    if (sa !== sb) return sa - sb
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.variant_id - b.variant_id
  })

  return (
    <div className="space-y-2 sm:space-y-3">
      {sortedVariants.map(variant => {
        const variantContent = variant.content_by_language?.[activeLanguage] || variant.content?.[activeLanguage]
        const variantTitle = variantContent?.title || 'No title'
        const variantImageUrl = variant.image?.thumb || variant.image?.src
        
        return (
          <div 
            key={variant.variant_id} 
            className="flex items-center gap-3 sm:gap-4 py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors min-w-0"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
              {variantImageUrl ? (
                <img src={variantImageUrl} alt={variant.sku || 'Variant'} className="w-full h-full object-cover" />
              ) : (
                <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {showSku && variant.sku ? (
                  <code className="text-xs sm:text-sm bg-muted px-1.5 sm:px-2 py-0.5 rounded font-mono truncate max-w-full">
                    {variant.sku}
                  </code>
                ) : !variant.sku && showSku ? (
                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-amber-500/70 text-amber-700 dark:text-amber-400 shrink-0">
                    No SKU
                  </Badge>
                ) : null}
                {variant.is_default && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0 border-blue-500/70 text-blue-700 dark:text-blue-400 shrink-0">
                    Default
                  </Badge>
                )}
                <span className="text-xs sm:text-sm font-semibold ml-auto shrink-0">
                  €{variant.price_excl?.toFixed(2)}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-none break-words leading-relaxed">
                {variantTitle}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
