/**
 * Product Images Cache
 *
 * Caches fetched product image lists by (productId, shopTld).
 * - productId is unique within a shop; adding shopTld ensures no collision across shops.
 * - imagesLink is derived from productId and therefore redundant in the key.
 *
 * Two helpers:
 *   getCachedImages / setCachedImages  — low-level read/write used by ProductImagesGrid
 *   fetchAndCacheImages                — async fetch-then-cache used by the preview-create page
 *                                        so both code paths share the same in-memory store.
 *
 * Cache lifetime:
 *   - Page refresh  → in-memory Map resets naturally
 *   - Navigate away → clearProductImagesCache() called via useEffect cleanup
 */

export interface ProductImage {
  id: number
  sortOrder: number
  title?: string
  thumb?: string
  src?: string
}

/** Key by productId + shopTld. Unique per product per shop. */
function cacheKey(productId: number, shopTld: string): string {
  return `${productId}|${shopTld}`
}

const cache = new Map<string, ProductImage[]>()

export function getCachedImages(
  productId: number,
  shopTld: string
): ProductImage[] | undefined {
  if (!shopTld) return undefined
  return cache.get(cacheKey(productId, shopTld))
}

export function setCachedImages(
  productId: number,
  shopTld: string,
  images: ProductImage[]
): void {
  cache.set(cacheKey(productId, shopTld), images)
}

/**
 * Fetch a product's image list from the API (with automatic caching).
 * Returns cached data immediately if available; otherwise calls the API, caches, and returns.
 *
 * Used by:
 * - preview-create/[sku]/page.tsx  (replaces its own ad-hoc fetch logic)
 *
 * ProductImagesGrid uses getCachedImages / setCachedImages directly with its own fetch loop.
 */
export async function fetchAndCacheImages(
  productId: number,
  imagesLink: string,
  shopTld: string
): Promise<ProductImage[]> {
  const cached = getCachedImages(productId, shopTld)
  if (cached) return cached

  try {
    const res = await fetch(
      `/api/product-images?link=${encodeURIComponent(imagesLink)}&shopTld=${encodeURIComponent(shopTld)}`
    )
    if (!res.ok) return []

    const raw: ProductImage[] = await res.json()
    const sorted = [...(Array.isArray(raw) ? raw : [])].sort(
      (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
    )
    setCachedImages(productId, shopTld, sorted)
    return sorted
  } catch {
    return []
  }
}

/**
 * Clears all cached product images.
 * Called via useEffect cleanup when unmounting product detail pages.
 *
 * Used in:
 * - products/[sku]/page.tsx
 * - product/[productId]/page.tsx
 * - preview-create/[sku]/page.tsx
 */
export function clearProductImagesCache(): void {
  cache.clear()
}
