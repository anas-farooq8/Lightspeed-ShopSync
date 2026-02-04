"use client"

import React, { useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Package, CheckCircle2, XCircle, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { SyncProduct } from './ProductListTab'

interface ProductListTableProps {
  products: SyncProduct[]
  sortBy?: 'title' | 'sku' | 'variants' | 'price' | 'created'
  sortOrder?: 'asc' | 'desc'
  loading?: boolean
  onSort?: (column: 'title' | 'sku' | 'variants' | 'price' | 'created') => void
  onProductClick: (product: SyncProduct) => void
  hideSkuColumn?: boolean
  hideDuplicateBadges?: boolean
  hideShopIndicators?: boolean
  showShopBadge?: boolean
}

interface TargetShop {
  tld: string
  name: string
}

interface ProductGroup {
  sku: string
  products: SyncProduct[]
  isDuplicate: boolean
}

export function ProductListTable({ 
  products, 
  sortBy = 'created', 
  sortOrder = 'desc',
  loading = false,
  onSort,
  onProductClick,
  hideSkuColumn = false,
  hideDuplicateBadges = false,
  hideShopIndicators = false,
  showShopBadge = false
}: ProductListTableProps) {
  const [targetShops, setTargetShops] = useState<TargetShop[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Auto-expand duplicate groups on initial load
  useEffect(() => {
    const duplicateSkus = products
      .filter(p => p.source_has_duplicates)
      .map(p => p.default_sku)
    const uniqueDuplicateSkus = Array.from(new Set(duplicateSkus))
    setExpandedGroups(new Set(uniqueDuplicateSkus))
  }, [products])

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

  // Group products by SKU
  const groupedProducts: ProductGroup[] = products.reduce((groups, product) => {
    const existingGroup = groups.find(g => g.sku === product.default_sku)
    
    if (existingGroup) {
      existingGroup.products.push(product)
      existingGroup.isDuplicate = true
    } else {
      groups.push({
        sku: product.default_sku,
        products: [product],
        isDuplicate: product.source_has_duplicates
      })
    }
    
    return groups
  }, [] as ProductGroup[])

  const toggleGroup = (sku: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(sku)) {
      newExpanded.delete(sku)
    } else {
      newExpanded.add(sku)
    }
    setExpandedGroups(newExpanded)
  }

  const SortableHeader = ({ 
    column, 
    children, 
    className = '' 
  }: { 
    column: 'title' | 'sku' | 'variants' | 'price' | 'created'
    children: React.ReactNode
    className?: string
  }) => {
    const isSorted = sortBy === column
    const Icon = loading && isSorted ? Loader2 : (isSorted ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown)

    return (
      <TableHead className={className}>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 cursor-pointer hover:bg-muted/50 font-semibold disabled:opacity-100"
          onClick={() => onSort?.(column)}
          disabled={loading}
        >
          {children}
          <Icon className={`ml-2 h-4 w-4 ${
            loading && isSorted 
              ? 'animate-spin text-red-600' 
              : isSorted 
                ? 'text-red-600' 
                : 'text-muted-foreground'
          }`} />
        </Button>
      </TableHead>
    )
  }

  const ProductRow = ({ product, isGrouped = false, isLast = false }: { product: SyncProduct, isGrouped?: boolean, isLast?: boolean }) => {
    const imageUrl = product.product_image?.thumb || product.product_image?.src || null
    
    return (
      <TableRow
        className={`cursor-pointer hover:bg-muted/50 ${isGrouped ? 'bg-muted/20' : ''} ${isLast ? '' : 'border-b-0'}`}
        onClick={() => onProductClick(product)}
      >
        {/* SKU - Hidden for NULL SKU mode */}
        {!hideSkuColumn && (
          <TableCell className={isGrouped ? 'pl-12' : ''}>
            {!isGrouped && (
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  {product.default_sku}
                </code>
                {!hideDuplicateBadges && product.source_has_duplicates && (
                  <Badge variant="outline" className="text-xs border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    x{product.source_duplicate_count}
                  </Badge>
                )}
              </div>
            )}
          </TableCell>
        )}

        {/* Product (Image + Title + Variant Title) */}
        <TableCell>
          <div className="flex items-start gap-3">
            {/* Thumbnail */}
            <div className="w-14 h-14 shrink-0 bg-muted rounded-md overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={product.product_title || 'Product'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-5 w-5 text-muted-foreground/50" />
              )}
            </div>
            
            {/* Titles + Shop Badge */}
            <div className="flex-1 min-w-0">
              {showShopBadge && (
                <Badge variant="secondary" className="text-xs mb-1">
                  {product.source_shop_name} (.{product.source_shop_tld})
                </Badge>
              )}
              <div className="font-medium line-clamp-2 text-sm leading-snug mb-1">
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

        {/* Created At */}
        <TableCell>
          <span className="text-sm text-muted-foreground">
            {new Date(product.ls_created_at).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </span>
        </TableCell>

        {/* Dynamic Target Shop Columns - Hidden for NULL SKU mode */}
        {!hideShopIndicators && targetShops.map(shop => {
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
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!hideSkuColumn && (
                  <SortableHeader column="sku" className="w-[200px]">
                    SKU
                  </SortableHeader>
                )}
                <SortableHeader column="title" className="w-[300px]">
                  Product
                </SortableHeader>
                <SortableHeader column="variants" className="text-center w-[100px]">
                  Variants
                </SortableHeader>
                <SortableHeader column="price" className="w-[100px]">
                  Price
                </SortableHeader>
                <SortableHeader column="created" className="w-[130px]">
                  Created
                </SortableHeader>
                {!hideShopIndicators && targetShops.map(shop => (
                  <TableHead key={shop.tld} className="text-center w-[80px]">
                    .{shop.tld}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedProducts.map((group, groupIdx) => {
                const isExpanded = expandedGroups.has(group.sku)
                const firstProduct = group.products[0]
                
                if (!group.isDuplicate) {
                  // Single product, render normally
                  return (
                    <ProductRow 
                      key={`single-${group.sku}-${firstProduct.source_product_id}`}
                      product={firstProduct}
                    />
                  )
                }
                
                // Duplicate group handling
                // If hiding duplicate badges (NULL SKU mode), render all products individually
                if (hideDuplicateBadges) {
                  return (
                    <React.Fragment key={`group-fragment-${group.sku}-${groupIdx}`}>
                      {group.products.map((product, idx) => (
                        <ProductRow
                          key={`ungrouped-${product.source_product_id}-${product.source_variant_id}`}
                          product={product}
                        />
                      ))}
                    </React.Fragment>
                  )
                }
                
                // Duplicate group - render with expand/collapse (CREATE mode)
                return (
                  <React.Fragment key={`group-fragment-${group.sku}-${groupIdx}`}>
                    {/* Group Header Row */}
                    <TableRow
                      className="bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-l-amber-500 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30"
                      onClick={() => toggleGroup(group.sku)}
                    >
                      <TableCell className="font-semibold" colSpan={hideSkuColumn ? 1 : 1}>
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-amber-700" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-amber-700" />
                          )}
                          {!hideSkuColumn && (
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                              {group.sku}
                            </code>
                          )}
                          <Badge variant="outline" className="text-xs border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            x{group.products.length}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell colSpan={(hideSkuColumn ? 4 : 4) + (hideShopIndicators ? 0 : targetShops.length)} className="text-sm text-muted-foreground">
                        {isExpanded 
                          ? `Click to collapse (showing ${group.products.length} ${group.products.length === 1 ? 'product' : 'products'})`
                          : `Click to expand and view ${group.products.length} ${group.products.length === 1 ? 'product' : 'products'} with this SKU`
                        }
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Products */}
                    {isExpanded && group.products.map((product, idx) => (
                      <ProductRow
                        key={`grouped-${product.source_product_id}-${product.default_sku}-${idx}`}
                        product={product}
                        isGrouped={true}
                        isLast={idx === group.products.length - 1}
                      />
                    ))}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
