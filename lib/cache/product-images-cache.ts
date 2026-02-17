/**
 * Product Images Cache
 *
 * Caches fetched product images (imagesLink + shopTld) to avoid re-fetching
 * when switching between tabs (e.g. .be / .de on SKU comparison page).
 * 
 * Cache is automatically cleared on:
 * - Page refresh (in-memory Map clears naturally)
 * - Navigation away from product detail pages (useEffect cleanup)
 * - Component unmount (useEffect cleanup)
 */

export interface ProductImage {
  id: number
  sortOrder: number
  title?: string
  thumb?: string
  src?: string
}

function cacheKey(imagesLink: string, shopTld: string): string {
  return `${imagesLink}|${shopTld}`
}

const cache = new Map<string, ProductImage[]>()

export function getCachedImages(
  imagesLink: string | null | undefined,
  shopTld: string
): ProductImage[] | undefined {
  if (!imagesLink || !shopTld) return undefined
  return cache.get(cacheKey(imagesLink, shopTld))
}

export function setCachedImages(
  imagesLink: string,
  shopTld: string,
  images: ProductImage[]
): void {
  cache.set(cacheKey(imagesLink, shopTld), images)
}

/**
 * Clears all cached product images. Called automatically via useEffect cleanup
 * when unmounting product detail pages to prevent stale data retention.
 * 
 * Used in:
 * - products/[sku]/page.tsx
 * - product/[productId]/page.tsx
 * - preview-create/[sku]/page.tsx
 */
export function clearProductImagesCache(): void {
  cache.clear()
}
