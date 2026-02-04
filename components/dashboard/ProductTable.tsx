"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './StatusBadge'
import type { ProductSyncStatus } from '@/types/database'
import { formatDistance } from 'date-fns'
import { ImageOff } from 'lucide-react'

type ProductTableProps = {
  products: ProductSyncStatus[]
  onProductClick: (product: ProductSyncStatus) => void
}

export function ProductTable({ products, onProductClick }: ProductTableProps) {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px] shrink-0">SKU</TableHead>
            <TableHead className="min-w-[280px]">Product</TableHead>
            <TableHead className="w-[90px] text-center shrink-0">Variants</TableHead>
            <TableHead className="w-[100px] text-right shrink-0">Price</TableHead>
            <TableHead className="w-[140px] shrink-0">.de Status</TableHead>
            <TableHead className="w-[140px] shrink-0">.be Status</TableHead>
            <TableHead className="w-[120px] text-right shrink-0">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                No products found
              </TableCell>
            </TableRow>
          ) : (
            products.map((product) => (
              <TableRow
                key={`${product.nl_product_id}-${product.nl_default_variant_id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onProductClick(product)}
              >
                <TableCell className="font-mono text-sm">
                  {product.default_sku}
                  {product.has_nl_duplicates && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      ×{product.nl_duplicate_count}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {product.product_image?.thumb ? (
                      <img
                        src={product.product_image.thumb}
                        alt={product.product_title ?? product.default_sku ?? 'Product'}
                        className="w-12 h-12 object-cover rounded border shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted/80 rounded border flex flex-col items-center justify-center shrink-0 text-muted-foreground">
                        <ImageOff className="h-5 w-5" strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {product.product_title ?? product.default_sku ?? '—'}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {product.default_variant_title ?? '—'}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{product.nl_variant_count}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  €{(product.price_excl ?? 0).toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge
                      status={product.de_status}
                      count={product.de_match_count}
                      variant="de"
                    />
                    {product.de_variant_counts && product.de_variant_counts[0] && (
                      <span className="text-xs text-muted-foreground">
                        {product.de_variant_counts[0]} variant{product.de_variant_counts[0] !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge
                      status={product.be_status}
                      count={product.be_match_count}
                      variant="be"
                    />
                    {product.be_variant_counts && product.be_variant_counts[0] && (
                      <span className="text-xs text-muted-foreground">
                        {product.be_variant_counts[0]} variant{product.be_variant_counts[0] !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatDistance(new Date(product.ls_updated_at), new Date(), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
