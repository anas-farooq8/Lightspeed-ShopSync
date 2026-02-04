"use client"

import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, CheckCircle2, XCircle } from 'lucide-react'
import type { SyncProduct } from './CreateTab'

interface ProductSyncTableProps {
  products: SyncProduct[]
  onProductClick: (product: SyncProduct) => void
}

interface TargetShop {
  tld: string
  name: string
}

export function ProductSyncTable({ products, onProductClick }: ProductSyncTableProps) {
  const [targetShops, setTargetShops] = useState<TargetShop[]>([])

  // Extract unique target shops from products
  useEffect(() => {
    if (products.length > 0) {
      const shopsSet = new Set<string>()
      const shopsMap = new Map<string, string>()
      
      products.forEach(product => {
        Object.entries(product.targets || {}).forEach(([tld, targetInfo]) => {
          shopsSet.add(tld)
          shopsMap.set(tld, targetInfo.shop_name)
        })
      })
      
      setTargetShops(
        Array.from(shopsSet)
          .map(tld => ({ tld, name: shopsMap.get(tld) || tld }))
          .sort((a, b) => a.tld.localeCompare(b.tld))
      )
    }
  }, [products])

  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">SKU</TableHead>
                <TableHead className="w-[220px]">Product</TableHead>
                <TableHead className="text-center w-[60px]">Variants</TableHead>
                <TableHead className="w-[80px]">Price</TableHead>
                {targetShops.map(shop => (
                  <TableHead key={shop.tld} className="text-center w-[80px]">
                    .{shop.tld}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const imageUrl = product.product_image?.thumb || product.product_image?.src || null
                
                return (
                  <TableRow
                    key={`${product.source_product_id}-${product.default_sku}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => onProductClick(product)}
                  >
                    {/* SKU */}
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {product.default_sku}
                      </code>
                    </TableCell>

                    {/* Product (Image + Title + Variant Title) */}
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        {/* Thumbnail */}
                        <div className="w-12 h-12 shrink-0 bg-muted rounded-md overflow-hidden flex items-center justify-center">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={product.product_title || 'Product'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                        
                        {/* Titles */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium line-clamp-2 text-sm mb-0.5">
                            {product.product_title || 'Untitled Product'}
                          </div>
                          {product.variant_title && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {product.variant_title}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Variant Count */}
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">
                        {product.source_variant_count}
                      </Badge>
                    </TableCell>

                    {/* Price */}
                    <TableCell>
                      {product.price_excl ? (
                        <span className="font-medium text-sm">€{product.price_excl.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>

                    {/* Dynamic Target Shop Columns */}
                    {targetShops.map(shop => {
                      const targetInfo = product.targets?.[shop.tld]
                      const status = targetInfo?.status || 'not_exists'
                      const exists = status === 'exists_single' || status === 'exists_multiple'
                      
                      return (
                        <TableCell key={shop.tld} className="text-center">
                          {exists ? (
                            <CheckCircle2 className="h-5 w-5 mx-auto text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 mx-auto text-red-600" />
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
