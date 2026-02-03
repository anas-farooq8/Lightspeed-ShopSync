"use client"

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './StatusBadge'
import type { ProductSyncStatus } from '@/types/variant'
import { formatDistance } from 'date-fns'

type ProductCardProps = {
  product: ProductSyncStatus
  onProductClick: (product: ProductSyncStatus) => void
}

export function ProductCard({ product, onProductClick }: ProductCardProps) {
  return (
    <Card
      className="cursor-pointer hover:border-primary transition-colors hover:shadow-md"
      onClick={() => onProductClick(product)}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Product Image */}
          <div className="flex-shrink-0">
            {product.product_image?.thumb ? (
              <img
                src={product.product_image.thumb}
                alt={product.product_title ?? product.default_sku ?? 'Product'}
                className="w-24 h-24 object-cover rounded border"
              />
            ) : (
              <div className="w-24 h-24 bg-muted rounded border flex items-center justify-center text-muted-foreground text-xs">
                No image
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex-1 min-w-0">
            {/* SKU & Variants */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-sm font-medium">{product.default_sku}</span>
              {product.has_nl_duplicates && (
                <Badge variant="secondary" className="text-xs">
                  ×{product.nl_duplicate_count}
                </Badge>
              )}
              <Badge variant="outline" className="ml-auto">
                {product.nl_variant_count} variant{product.nl_variant_count !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Product Title */}
            <h3 className="font-semibold truncate mb-1">
              {product.product_title ?? product.default_sku ?? '—'}
            </h3>
            
            {/* Variant Title */}
            <p className="text-sm text-muted-foreground truncate mb-3">
              {product.default_variant_title ?? '—'}
            </p>

            {/* Price */}
            <div className="text-lg font-bold mb-3">
              €{(product.price_excl ?? 0).toFixed(2)}
            </div>

            {/* Status Badges */}
            <div className="flex flex-wrap gap-2 mb-2">
              <StatusBadge
                status={product.de_status}
                count={product.de_match_count}
                variant="de"
              />
              <StatusBadge
                status={product.be_status}
                count={product.be_match_count}
                variant="be"
              />
            </div>

            {/* Variant Counts */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              {product.de_variant_counts && product.de_variant_counts[0] && (
                <span>.de: {product.de_variant_counts[0]} variants</span>
              )}
              {product.be_variant_counts && product.be_variant_counts[0] && (
                <span>.be: {product.be_variant_counts[0]} variants</span>
              )}
            </div>

            {/* Updated Time */}
            <div className="text-xs text-muted-foreground mt-2">
              Updated {formatDistance(new Date(product.updated_at), new Date(), { addSuffix: true })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
