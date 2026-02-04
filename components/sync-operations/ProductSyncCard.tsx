"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Layers, CheckCircle2, XCircle } from 'lucide-react'
import type { SyncProduct } from './CreateTab'

interface ProductSyncCardProps {
  product: SyncProduct
  onClick: () => void
}

export function ProductSyncCard({ product, onClick }: ProductSyncCardProps) {
  // Use src image for better quality in card view (as requested)
  const imageUrl = product.product_image?.src || product.product_image?.thumb || null
  
  // Get missing shops
  const missingShops = Object.entries(product.targets || {})
    .filter(([_, target]) => target.status === 'not_exists')
    .map(([tld]) => tld)
  
  // Missing in all shops when ALL targets have status 'not_exists'
  const allTargetShops = Object.keys(product.targets || {})
  const allMissing = missingShops.length === allTargetShops.length && missingShops.length > 0

  return (
    <Card
      className="border-border/50 hover:border-primary/50 transition-all cursor-pointer hover:shadow-lg"
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Image - Fixed aspect ratio */}
        <div className="w-full aspect-[4/3] mb-3 bg-muted rounded-md overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.product_title || 'Product'}
              className="w-full h-full object-contain"
              loading="lazy"
              onError={(e) => {
                // Fallback if image fails to load
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentElement!.innerHTML = '<div class="text-muted-foreground/50"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3"/></svg></div>'
              }}
            />
          ) : (
            <Package className="h-8 w-8 text-muted-foreground/50" />
          )}
        </div>

        {/* SKU with Duplicate Badge */}
        <div className="mb-2 flex items-center gap-2">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {product.default_sku}
          </code>
          {product.source_has_duplicates && (
            <Badge variant="outline" className="text-xs border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
              x{product.source_duplicate_count}
            </Badge>
          )}
        </div>

        {/* Product Title */}
        <h3 className="font-semibold text-sm line-clamp-2 mb-1 min-h-[36px]">
          {product.product_title || 'Untitled Product'}
        </h3>

        {/* Variant Title (subtitle) */}
        {product.variant_title && (
          <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
            {product.variant_title}
          </p>
        )}

        {/* Variant Count & Price */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">
              {product.source_variant_count} variant{product.source_variant_count !== 1 ? 's' : ''}
            </span>
          </div>
          {product.price_excl && (
            <span className="font-semibold text-sm">
              €{product.price_excl.toFixed(2)}
            </span>
          )}
        </div>

        {/* Shop Status Indicators (like table view) */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          {Object.entries(product.targets || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([tld, targetInfo]) => {
              const exists = targetInfo.status === 'exists_single' || targetInfo.status === 'exists_multiple'
              return (
                <div key={tld} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground font-medium">.{tld}</span>
                  {exists ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
              )
            })}
        </div>
      </CardContent>
    </Card>
  )
}
