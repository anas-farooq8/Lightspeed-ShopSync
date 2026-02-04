"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Tag, Layers } from 'lucide-react'
import type { SyncProduct } from './CreateTab'

interface ProductSyncCardProps {
  product: SyncProduct
  onClick: () => void
}

export function ProductSyncCard({ product, onClick }: ProductSyncCardProps) {
  // Use src image for better quality in card view
  const imageUrl = product.product_image?.src || product.product_image?.thumb || null
  
  // Get missing shops
  const missingShops = Object.entries(product.targets || {})
    .filter(([_, target]) => target.status === 'not_exists')
    .map(([tld]) => tld)
  
  // If no targets at all, missing in all shops
  const allMissing = !product.targets || Object.keys(product.targets).length === 0

  return (
    <Card
      className="border-border/50 hover:border-primary/50 transition-all cursor-pointer hover:shadow-lg"
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Image - Reduced size */}
        <div className="w-full aspect-square mb-2 bg-muted rounded-md overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.product_title || 'Product'}
              className="w-full h-full object-contain"
            />
          ) : (
            <Package className="h-10 w-10 text-muted-foreground/50" />
          )}
        </div>

        {/* SKU */}
        <div className="mb-2">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
            {product.default_sku}
          </code>
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
        <div className="flex items-center justify-between mb-2 text-xs">
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

        {/* Missing In Badges */}
        <div className="flex flex-wrap gap-1">
          {allMissing ? (
            <Badge 
              variant="outline" 
              className="text-xs border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            >
              All shops
            </Badge>
          ) : (
            missingShops.map(tld => (
              <Badge 
                key={tld} 
                variant="outline" 
                className="text-xs border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
              >
                .{tld}
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
