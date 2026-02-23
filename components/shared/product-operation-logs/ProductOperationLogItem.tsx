'use client'

import { Badge } from '@/components/ui/badge'
import { ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
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

export interface ProductOperationLog {
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

interface ProductOperationLogItemProps {
  log: ProductOperationLog
}

export function ProductOperationLogItem({ log }: ProductOperationLogItemProps) {
  return (
    <div className="px-3 py-4 sm:px-4 sm:py-5 hover:bg-muted/30 transition-colors min-w-0">
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

      {log.target_product?.image && (
        <div className="mt-2">
          <img
            src={getImageUrl(log.target_product.image) ?? undefined}
            alt=""
            className="h-10 w-10 object-cover rounded border border-border"
          />
        </div>
      )}

      {log.details?.changes && log.details.changes.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          {log.details.changes.join(' · ')}
        </div>
      )}

      {log.error_message && (
        <div className="mt-2 text-xs text-red-600">{log.error_message}</div>
      )}
    </div>
  )
}

/** Skeleton matching ProductOperationLogItem layout: header (datetime + badges) + content lines */
export function ProductOperationLogItemSkeleton() {
  return (
    <div className="px-3 py-4 sm:px-4 sm:py-5 animate-pulse min-w-0">
      {/* Header: datetime + badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="h-3.5 sm:h-4 bg-muted rounded w-32" />
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-5 bg-muted rounded w-14" />
          <div className="h-4 w-4 rounded bg-muted" />
        </div>
      </div>
      {/* Content lines */}
      <div className="space-y-2">
        <div className="h-3 bg-muted rounded w-full" />
        <div className="h-3 bg-muted rounded w-5/6" />
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-10 w-10 rounded bg-muted" />
      </div>
    </div>
  )
}
