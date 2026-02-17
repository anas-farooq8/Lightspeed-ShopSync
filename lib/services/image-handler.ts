/**
 * Image handling service for downloading and encoding images
 * Downloads images from Lightspeed CDN and converts to base64
 */

interface ImageData {
  base64: string
  filename: string
  extension: string
}

/**
 * Download image from URL and convert to base64
 */
export async function downloadAndEncodeImage(imageUrl: string): Promise<ImageData> {
  try {
    // Fetch image from CDN
    const response = await fetch(imageUrl)
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }

    // Get image buffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Convert to base64
    const base64 = buffer.toString('base64')

    // Extract filename from URL
    const url = new URL(imageUrl)
    const pathname = url.pathname
    const filename = pathname.split('/').pop() || 'image.jpg'
    
    // Get extension
    const extensionMatch = filename.match(/\.([^.]+)$/)
    const extension = extensionMatch ? extensionMatch[1] : 'jpg'

    return {
      base64,
      filename,
      extension,
    }
  } catch (error) {
    console.error('Failed to download and encode image:', imageUrl, error)
    throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Cache for downloaded images (in-memory, per request)
 * Avoids downloading the same image multiple times
 */
class ImageCache {
  private cache = new Map<string, Promise<ImageData>>()

  async get(url: string): Promise<ImageData> {
    if (!this.cache.has(url)) {
      this.cache.set(url, downloadAndEncodeImage(url))
    }
    return this.cache.get(url)!
  }

  clear() {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

/**
 * Global image cache instance (per API request lifecycle)
 */
let globalCache: ImageCache | null = null

/**
 * Get or create image cache
 */
export function getImageCache(): ImageCache {
  if (!globalCache) {
    globalCache = new ImageCache()
  }
  return globalCache
}

/**
 * Clear image cache (call after request is complete)
 */
export function clearImageCache() {
  if (globalCache) {
    globalCache.clear()
    globalCache = null
  }
}

/**
 * Download and encode image with caching
 */
export async function downloadImage(url: string): Promise<ImageData> {
  const cache = getImageCache()
  return cache.get(url)
}
