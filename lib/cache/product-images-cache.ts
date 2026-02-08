/**
 * Product Images Cache
 *
 * Caches fetched product images (imagesLink + shopTld) to avoid re-fetching
 * when switching between tabs (e.g. .be / .de on SKU page). Cache is cleared
 * when the user navigates away from a product detail view (Back to List).
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
 * Clears all cached product images. Call when unmounting a product detail page
 * (e.g. SKU page, product/[productId] page) so we don't retain stale data.
 */
export function clearProductImagesCache(): void {
  cache.clear()
}
