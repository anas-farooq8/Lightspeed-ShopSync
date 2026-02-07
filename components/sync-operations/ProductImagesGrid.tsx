"use client"

import { useEffect, useState, memo } from 'react'
import { Star, Package, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from '@/components/ui/dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { cn } from '@/lib/utils'

export interface ProductImage {
  id: number
  sortOrder: number
  title?: string
  thumb?: string
  src?: string
}

interface ProductImagesGridProps {
  imagesLink: string | null | undefined
  shopTld: string
  className?: string
}

function ProductImagesGridInner({ imagesLink, shopTld, className }: ProductImagesGridProps) {
  const [images, setImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null)

  useEffect(() => {
    if (!imagesLink || !shopTld) {
      setImages([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/product-images?link=${encodeURIComponent(imagesLink)}&shopTld=${encodeURIComponent(shopTld)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch images')
        return res.json()
      })
      .then((data: ProductImage[]) => {
        if (!cancelled) {
          const sorted = [...(Array.isArray(data) ? data : [])].sort(
            (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
          )
          setImages(sorted)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [imagesLink, shopTld])

  if (!imagesLink) return null

  if (loading) {
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
      <div className={cn("grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3", className)}>
        {images.map((img) => {
          const src = img.src ?? img.thumb
          const isPrimary = img.sortOrder === 1
          return (
            <div
              key={img.id}
              className="group relative"
            >
              {/* Title on hover - tooltip above image with caret */}
              {img.title && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex flex-col items-center">
                  <div className="relative px-3 py-2 rounded-lg bg-gray-800 text-white text-xs sm:text-sm font-medium shadow-lg whitespace-nowrap max-w-[calc(100vw-2rem)] overflow-hidden text-ellipsis after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:w-0 after:h-0 after:border-[6px] after:border-solid after:border-transparent after:border-t-gray-800">
                    {img.title}
                  </div>
                </div>
              )}
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
                  <div className="absolute top-0 right-0 w-6 h-8 bg-blue-600 flex items-center justify-center [clip-path:polygon(0_0,100%_0,100%_100%,50%_85%,0_100%)]">
                    <Star className="h-3 w-3 fill-white text-white shrink-0" />
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden" showCloseButton={false}>
          <VisuallyHidden.Root>
            <DialogTitle>{previewImage?.title || 'Image preview'}</DialogTitle>
          </VisuallyHidden.Root>
          <DialogClose className="absolute top-3 right-3 z-50 rounded-md p-2 bg-black/50 text-white hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer transition-colors">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
          {previewImage && (
            <div className="relative">
              <img
                src={previewImage.src ?? previewImage.thumb ?? ''}
                alt={previewImage.title || 'Preview'}
                className="w-full h-auto max-h-[85vh] object-contain"
              />
              {previewImage.title && (
                <p className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-sm px-4 py-2">
                  {previewImage.title}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Memoize to prevent flicker/refetch when switching languages (images are same across languages)
export const ProductImagesGrid = memo(ProductImagesGridInner)
