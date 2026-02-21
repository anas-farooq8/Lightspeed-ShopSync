"use client"

import { useEffect, useState, useMemo, memo } from 'react'
import { createPortal } from 'react-dom'
import { Star, Package, X, Trash2, ArrowDownToLine } from 'lucide-react'
import { getCachedImages, fetchAndCacheImages, type ProductImage as CachedProductImage } from '@/lib/cache/product-images-cache'
import { sortImagesForDisplay } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from '@/components/ui/dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { cn } from '@/lib/utils'

/** Shared: tooltip portal for image hover title */
export function ImageTooltipPortal({ tooltip }: { tooltip: { title: string; anchor: DOMRect } | null }) {
  if (!tooltip || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed z-[200] pointer-events-none px-3.5 py-2 rounded bg-[#2d2d2d] text-white text-sm font-medium whitespace-nowrap shadow-lg"
      style={{
        left: tooltip.anchor.left + tooltip.anchor.width / 2,
        top: tooltip.anchor.top,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
    >
      {tooltip.title}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-[6px] border-solid border-transparent border-t-[#2d2d2d]" aria-hidden />
    </div>,
    document.body
  )
}

/** Shared: preview dialog when clicking an image */
export function ImagePreviewDialog({ image, onClose }: { image: { src?: string; thumb?: string; title?: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden" showCloseButton={false}>
        <VisuallyHidden.Root>
          <DialogTitle>{image?.title || 'Image preview'}</DialogTitle>
        </VisuallyHidden.Root>
        <DialogClose className="absolute top-3 right-3 z-50 rounded-md p-2 bg-black/50 text-white hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer transition-colors">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogClose>
        {image && (
          <div className="relative">
            <img src={image.src ?? image.thumb ?? ''} alt={image.title || 'Preview'} className="w-full h-auto max-h-[85vh] object-contain" />
            {image.title && (
              <p className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-sm px-4 py-2">{image.title}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export interface ProductImage {
  id: number
  sortOrder: number
  title?: string
  thumb?: string
  src?: string
}

/** Pre-fetched image metadata. Matches API response: id, sortOrder, title, thumb, src. */
export type ProductImageMeta = {
  id: number | string
  sortOrder?: number
  sort_order?: number
  title?: string
  thumb?: string
  src?: string
  addedFromSource?: boolean
}

interface ProductImagesGridProps {
  /** Product ID for cache key (productId + imagesLink + tld). Required when fetching. */
  productId: number
  imagesLink: string | null | undefined
  shopTld: string
  /** When provided, use this data and do not fetch. Used by create-preview to pass source images to all panels. */
  images?: ProductImageMeta[] | null
  /** Product image or src for ordering. When object, sortImagesForDisplay matches by URL; when multiple have sortOrder=1, URL distinguishes. */
  productOrSrc?: { product_image?: { src?: string; thumb?: string; title?: string } | null } | string | null
  className?: string
  /** Optional element to render after the last image (e.g. add button in edit mode). */
  trailingElement?: React.ReactNode
  /** When provided, show delete icon on each image (create mode). */
  onRemoveImage?: (imageSrc: string) => void
}

function normalizeImages(raw: ProductImageMeta[], productOrSrc?: ProductImagesGridProps['productOrSrc']): (ProductImage & { addedFromSource?: boolean })[] {
  const withOrder = raw.map((img, idx) => ({
    id: typeof img.id === 'number' ? img.id : idx,
    sortOrder: img.sortOrder ?? img.sort_order ?? 999,
    title: img.title,
    thumb: img.thumb,
    src: img.src,
    addedFromSource: img.addedFromSource,
  }))
  return sortImagesForDisplay(withOrder, productOrSrc)
}

function ProductImagesGridInner({ productId, imagesLink, shopTld, images: imagesProp, productOrSrc, className, trailingElement, onRemoveImage }: ProductImagesGridProps) {
  const [fetchedImages, setFetchedImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null)
  const [tooltip, setTooltip] = useState<{ title: string; anchor: DOMRect } | null>(null)

  const usePreFetched = imagesProp !== undefined && imagesProp !== null
  const rawImages = usePreFetched ? imagesProp : fetchedImages
  const images = usePreFetched
    ? normalizeImages(imagesProp, productOrSrc)
    : sortImagesForDisplay(fetchedImages, productOrSrc)

  // Clear tooltip only when the actual image set changes (add/remove), not on every render
  const imagesKey = useMemo(() => images.map(i => i.src ?? i.id ?? '').join('|'), [images])
  useEffect(() => {
    setTooltip(null)
  }, [imagesKey])

  useEffect(() => {
    if (usePreFetched) return
    if (!imagesLink || !shopTld) {
      setFetchedImages([])
      return
    }
    const cached = getCachedImages(productId, shopTld)
    if (cached) {
      setFetchedImages(cached)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    
    // Use centralized fetchAndCacheImages to prevent duplicate requests
    fetchAndCacheImages(productId, imagesLink, shopTld)
      .then((sorted) => {
        if (!cancelled) {
          setFetchedImages(sorted)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch images')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    
    return () => { cancelled = true }
  }, [productId, imagesLink, shopTld, usePreFetched])

  if (usePreFetched) {
    if (!images.length) return null
  } else if (!imagesLink) return null

  if (!usePreFetched && loading) {
    return (
      <div className={cn("grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (error || images.length === 0) {
    return null
  }

  return (
    <>
      <ImageTooltipPortal tooltip={tooltip} />
      <div className={cn("grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3", className)}>
        {images.map((img, index) => {
          const src = img.src ?? img.thumb
          const isPrimary = index === 0
          const isAddedFromSource = !!(img as { addedFromSource?: boolean }).addedFromSource
          return (
            <div
              key={img.id}
              className="group relative"
              onMouseEnter={img.title ? (e) => setTooltip({ title: img.title!, anchor: e.currentTarget.getBoundingClientRect() }) : undefined}
              onMouseLeave={img.title ? () => setTooltip(null) : undefined}
            >
              <button
                type="button"
                onClick={() => setPreviewImage(img)}
                className="w-full aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted hover:border-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer transition-colors"
              >
                {src ? (
                  <img
                    src={src}
                    alt={img.title || 'Product image'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
                {isPrimary && (
                  <div className="absolute top-0 left-0 w-6 h-6 bg-blue-600 flex items-center justify-center rounded-br" title="Default product image">
                    <Star className="h-3 w-3 fill-white text-white shrink-0" />
                  </div>
                )}
                {isAddedFromSource && !isPrimary && (
                  <div className="absolute top-0 left-0 w-6 h-6 bg-blue-600 flex items-center justify-center rounded-br" title="Added from source">
                    <ArrowDownToLine className="h-3 w-3 fill-white text-white shrink-0" />
                  </div>
                )}
              </button>
              {onRemoveImage && img.src && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemoveImage(img.src as string) }}
                  className="absolute top-1 right-1 w-7 h-7 rounded-md bg-destructive/90 hover:bg-destructive text-destructive-foreground flex items-center justify-center cursor-pointer transition-colors"
                  title="Remove image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
        {trailingElement}
      </div>

      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  )
}

// Memoize to prevent flicker/refetch when switching languages (images are same across languages)
export const ProductImagesGrid = memo(ProductImagesGridInner)
