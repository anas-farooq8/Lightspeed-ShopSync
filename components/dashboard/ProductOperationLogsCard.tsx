"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeftRight, ExternalLink, CheckCircle2, XCircle, Package } from 'lucide-react'
import { formatDateTime, toSafeExternalHref, getImageUrl } from '@/lib/utils'

interface ShopInfo {
  id: string
  name: string
  base_url: string
  tld?: string
}

interface ProductInfo {
  title: string
  default_sku: string | null
  image?: { src?: string; thumb?: string; title?: string } | null
}

interface ProductOperationLog {
  id: number
  shop_id: string
  lightspeed_product_id: number
  operation_type: 'create' | 'edit'
  status: 'success' | 'error'
  error_message: string | null
  details: { changes?: string[] }
  source_shop_id: string | null
  source_lightspeed_product_id: number | null
  created_at: string
  target_shop: ShopInfo
  source_shop: ShopInfo | null
  target_product: ProductInfo | null
  source_product: ProductInfo | null
}

function ProductLink({
  shop,
  productId,
  label,
}: {
  shop: ShopInfo
  productId: number
  label: string
}) {
  const href = toSafeExternalHref(shop.base_url)
  if (!href) return <span className="text-muted-foreground">{label}</span>
  const url = `${href}/admin/products/${productId}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1 font-medium"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  )
}

function ShopLink({ shop }: { shop: ShopInfo }) {
  const href = toSafeExternalHref(shop.base_url)
  if (!href) return <span className="truncate">{shop.name}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="truncate hover:text-primary transition-colors inline-flex items-center gap-1 cursor-pointer"
    >
      {shop.name}
      <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
    </a>
  )
}

interface ProductOperationLogsCardProps {
  /** When provided, skip fetch and use this data (enables parallel fetch from parent) */
  data?: ProductOperationLog[] | null
  loading?: boolean
  error?: string | null
}

export function ProductOperationLogsCard({ data: dataProp, loading: loadingProp, error: errorProp }: ProductOperationLogsCardProps = {}) {
  const [logs, setLogs] = useState<ProductOperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isControlled = dataProp !== undefined
  const logsDisplay = isControlled ? (dataProp ?? []) : logs
  const loadingDisplay = isControlled ? (loadingProp ?? false) : loading
  const errorDisplay = isControlled ? errorProp : error

  useEffect(() => {
    if (isControlled) return

    async function fetchLogs() {
      try {
        const response = await fetch('/api/product-operation-logs?limit=20')
        if (!response.ok) throw new Error('Failed to fetch product operation logs')
        const data = await response.json()
        setLogs(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product operation logs')
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [isControlled])

  return (
    <div className="min-w-0">
      <div className="mb-2 sm:mb-3">
        <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
          Product Sync Operations
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Create and edit history across shops
        </p>
      </div>

      {loadingDisplay ? (
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3 sm:p-4 animate-pulse min-w-0">
                  <div className="flex gap-3">
                    <div className="h-12 w-12 rounded bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : errorDisplay ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center justify-center py-6 sm:py-8 text-destructive text-sm sm:text-base px-4">
            {errorDisplay}
          </CardContent>
        </Card>
      ) : logsDisplay.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 text-muted-foreground text-sm sm:text-base px-4">
            <Package className="h-10 w-10 mb-2 opacity-50" />
            <p>No product sync operations yet</p>
            <p className="text-xs mt-1">Create or edit products to see history here</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-[660px] overflow-y-auto overflow-x-hidden divide-y divide-border">
              {logsDisplay.map((log) => (
                <div
                  key={log.id}
                  className="p-3 sm:p-4 hover:bg-muted/30 transition-colors min-w-0"
                >
                  {/* Header: datetime + status */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs sm:text-sm text-muted-foreground shrink-0">
                      {formatDateTime(log.created_at)}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={log.operation_type === 'create' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {log.operation_type === 'create' ? 'Create' : 'Edit'}
                      </Badge>
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  </div>

                  {/* Create: product ID + SKU (source) → source → product ID + SKU (target) → target */}
                  {log.operation_type === 'create' && (
                    <div className="space-y-2 text-xs sm:text-sm">
                      {/* Source product ID + SKU (after date, clickable) */}
                      {log.source_shop && log.source_lightspeed_product_id != null && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <ProductLink
                            shop={log.source_shop}
                            productId={log.source_lightspeed_product_id}
                            label={`#${log.source_lightspeed_product_id}`}
                          />
                          {log.source_product?.default_sku && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                SKU: {log.source_product.default_sku}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Source: shop, title (no product link after title) */}
                      {log.source_shop && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 shrink-0">
                            .{log.source_shop.tld?.toLowerCase() ?? '?'} Source
                          </Badge>
                          <ShopLink shop={log.source_shop} />
                          {log.source_product ? (
                            <>
                              <span className="text-muted-foreground shrink-0">·</span>
                              <span className="break-words min-w-0" title={log.source_product.title}>
                                {log.source_product.title}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              Product #{log.source_lightspeed_product_id}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Target product ID + SKU (clickable) */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ProductLink
                          shop={log.target_shop}
                          productId={log.lightspeed_product_id}
                          label={`#${log.lightspeed_product_id}`}
                        />
                        {log.target_product?.default_sku && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">
                              SKU: {log.target_product.default_sku}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Target: shop, title (no product link after title) */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 shrink-0">
                          .{log.target_shop.tld?.toLowerCase() ?? '?'} Target
                        </Badge>
                        <ShopLink shop={log.target_shop} />
                        {log.target_product ? (
                          <>
                            <span className="text-muted-foreground shrink-0">·</span>
                            <span className="break-words min-w-0" title={log.target_product.title}>
                              {log.target_product.title}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Product #{log.lightspeed_product_id}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Edit: product ID + SKU → target */}
                  {log.operation_type === 'edit' && (
                    <div className="space-y-2 text-xs sm:text-sm">
                      {/* Target product ID + SKU (after date, clickable) */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ProductLink
                          shop={log.target_shop}
                          productId={log.lightspeed_product_id}
                          label={`#${log.lightspeed_product_id}`}
                        />
                        {log.target_product?.default_sku && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground">
                              SKU: {log.target_product.default_sku}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Target: shop, title (no product link after title) */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 shrink-0">
                          .{log.target_shop.tld?.toLowerCase() ?? '?'} Target
                        </Badge>
                        <ShopLink shop={log.target_shop} />
                        {log.target_product ? (
                          <>
                            <span className="text-muted-foreground shrink-0">·</span>
                            <span className="break-words min-w-0" title={log.target_product.title}>
                              {log.target_product.title}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Product #{log.lightspeed_product_id}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Product image thumbnail (target only, when available) */}
                  {log.target_product?.image && (
                    <div className="mt-2">
                      <img
                        src={getImageUrl(log.target_product.image) ?? undefined}
                        alt=""
                        className="h-10 w-10 object-cover rounded border border-border"
                      />
                    </div>
                  )}

                  {/* Changes / details */}
                  {log.details?.changes && log.details.changes.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {log.details.changes.join(' · ')}
                    </div>
                  )}

                  {/* Error message */}
                  {log.error_message && (
                    <div className="mt-2 text-xs text-red-600">{log.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
