import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, ExternalLink, RotateCcw, X, GripVertical, Star } from 'lucide-react'
import { getVisibilityOption, VISIBILITY_OPTIONS } from '@/lib/constants/visibility'
import { EditableLanguageContentTabs } from '@/components/sync-operations/product-display/EditableLanguageContentTabs'
import { EditableVariantsList } from '@/components/sync-operations/product-display/EditableVariantsList'
import { toSafeExternalHref, cn } from '@/lib/utils'
import type { Language, ProductImage, ImageInfo, EditableTargetData, ProductContent } from '@/types/product'
import { useState, useRef, useMemo } from 'react'

interface TargetPanelProps {
  shopTld: string
  shopName: string
  baseUrl: string
  languages: Language[]
  data: EditableTargetData | undefined
  productImages: ProductImage[]
  activeLanguage: string
  onLanguageChange: (lang: string) => void
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
  onResetShop: () => void
  onUpdateVariant: (idx: number, field: 'sku' | 'price_excl', value: string | number) => void
  onUpdateVariantTitle: (idx: number, lang: string, title: string) => void
  onAddVariant: () => void
  onRemoveVariant: (idx: number) => void
  onMoveVariant: (from: number, to: number) => void
  onResetVariant: (idx: number) => void
  onResetAllVariants: () => void
  onSelectVariantImage: (idx: number) => void
  onSelectProductImage: () => void
  onRemoveImage: (imgId: string) => void
  onRestoreImage: (imgId: string) => void
  onUpdateVisibility: (visibility: string) => void
  onResetVisibility: () => void
  onResetProductImage: () => void
  onMoveImage: (fromIdx: number, toIdx: number) => void
  onResetImageOrder: () => void
}

function isSameImageInfo(a: ImageInfo | null, b: ImageInfo | null): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (a.src || '') === (b.src || '')
}

export function TargetPanel({
  shopTld,
  shopName,
  baseUrl,
  languages,
  data,
  productImages,
  activeLanguage,
  onLanguageChange,
  onUpdateField,
  onResetField,
  onResetLanguage,
  onResetShop,
  onUpdateVariant,
  onUpdateVariantTitle,
  onAddVariant,
  onRemoveVariant,
  onMoveVariant,
  onResetVariant,
  onResetAllVariants,
  onSelectVariantImage,
  onSelectProductImage,
  onRemoveImage,
  onRestoreImage,
  onUpdateVisibility,
  onResetVisibility,
  onResetProductImage,
  onMoveImage,
  onResetImageOrder
}: TargetPanelProps) {
  if (!data) return null

  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null)
  const lastImageDropTargetRef = useRef<number | null>(null)
  const shopUrl = toSafeExternalHref(baseUrl)
  const visibilityChanged = data.visibility !== data.originalVisibility
  const targetProductImageUrl = data.productImage?.src || data.productImage?.thumb
  const productImageChanged = !isSameImageInfo(data.productImage, data.originalProductImage)
  const availableImages = productImages.filter(img => !data.removedImageIds.has(img.id))
  const sortedImages = useMemo(
    () => [...availableImages].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
    [availableImages]
  )

  // Check if image order has changed
  const imageOrderChanged = availableImages.some((img, idx) => img.sort_order !== idx)

  const handleImageDragStart = (e: React.DragEvent, sortedIndex: number) => {
    setDraggedImageIndex(sortedIndex)
    lastImageDropTargetRef.current = null
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(sortedIndex))
    e.dataTransfer.dropEffect = 'move'
  }

  const handleImageDragOver = (e: React.DragEvent, sortedIndex: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedImageIndex === null || draggedImageIndex === sortedIndex) return
    if (lastImageDropTargetRef.current === sortedIndex) return
    lastImageDropTargetRef.current = sortedIndex
    const fromOriginal = availableImages.indexOf(sortedImages[draggedImageIndex])
    const toOriginal = availableImages.indexOf(sortedImages[sortedIndex])
    if (fromOriginal !== -1 && toOriginal !== -1) onMoveImage(fromOriginal, toOriginal)
    setDraggedImageIndex(sortedIndex)
  }

  const handleImageDragEnd = () => {
    setDraggedImageIndex(null)
    lastImageDropTargetRef.current = null
  }

  return (
    <Card className="border-border/50 flex flex-col h-fit overflow-hidden">
      <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
              {shopUrl ? (
                <a href={shopUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
                  <span className="truncate">{shopName || 'Shop'}</span>
                  <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{shopName || 'Shop'}</span>
              )}
              <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{shopTld}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Target</Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
          <div className="shrink-0 flex flex-col items-start">
            <div className="relative group">
              <button
                type="button"
                onClick={onSelectProductImage}
                className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-lg overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50 hover:ring-primary/50 transition-colors cursor-pointer"
              >
                {targetProductImageUrl ? (
                  <img src={targetProductImageUrl} alt="Product" className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
                )}
              </button>
              {productImageChanged && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); onResetProductImage() }}
                  className="absolute top-1 right-1 h-7 w-7 rounded-full bg-background/90 hover:bg-background shadow-md cursor-pointer"
                  title="Reset product image"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-2 sm:gap-y-4 text-[13px] sm:text-sm md:text-base">
            {/* Row 1: Visibility | Price */}
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Visibility</span>
              <div className="flex items-center gap-1.5 justify-center w-full">
                <div className="relative">
                  <Select value={data.visibility} onValueChange={onUpdateVisibility}>
                    <SelectTrigger className="w-[200px] h-9 cursor-pointer">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const vis = getVisibilityOption(data.visibility)
                            return <><vis.Icon className={`h-3.5 w-3.5 ${vis.iconClassName}`} /><span className={vis.labelClassName}>{vis.label}</span></>
                          })()}
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                          <div className="flex items-center gap-2">
                            <option.Icon className={`h-3.5 w-3.5 ${option.iconClassName}`} />
                            <span className={option.labelClassName}>{option.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {visibilityChanged && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onResetVisibility}
                      className="absolute -right-8 top-1/2 -translate-y-1/2 h-7 w-7 cursor-pointer"
                      title="Reset visibility"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Price</span>
              <div className="font-medium">
                {data.variants.length > 0 && data.variants[0]
                  ? `€${data.variants[0].price_excl?.toFixed(2) || '0.00'}`
                  : '€0.00'}
              </div>
            </div>
            {/* Row 2: Variants | Reset Shop */}
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Variants</span>
              <div className="font-medium">{data.variants.length}</div>
            </div>
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs invisible">Actions</span>
              <Button
                variant="outline"
                size="sm"
                onClick={onResetShop}
                className="h-9 px-3 text-xs cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset Shop
              </Button>
            </div>
          </div>
        </div>

        {languages.length > 0 && (
          <div className="border-t border-border/50 pt-3 sm:pt-4">
            <EditableLanguageContentTabs
              languages={languages}
              content={data.content_by_language}
              dirtyFields={data.dirtyFields}
              onUpdateField={onUpdateField}
              onResetField={onResetField}
              onResetLanguage={onResetLanguage}
            />
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <EditableVariantsList
            variants={data.variants}
            activeLanguage={activeLanguage}
            dirtyVariants={data.dirtyVariants}
            orderChanged={data.orderChanged}
            onUpdateVariant={onUpdateVariant}
            onUpdateVariantTitle={onUpdateVariantTitle}
            onAddVariant={onAddVariant}
            onRemoveVariant={onRemoveVariant}
            onMoveVariant={onMoveVariant}
            onResetVariant={onResetVariant}
            onResetAllVariants={onResetAllVariants}
            onSelectVariantImage={onSelectVariantImage}
          />
          {availableImages.length > 0 && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h4 className="text-xs sm:text-sm font-bold uppercase">Product images ({availableImages.length})</h4>
                {imageOrderChanged && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onResetImageOrder}
                    className="text-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset Order
                  </Button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {sortedImages.map((img, idx) => {
                    const isDefault = idx === 0
                  return (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={(e) => handleImageDragStart(e, idx)}
                      onDragOver={(e) => handleImageDragOver(e, idx)}
                      onDragEnd={handleImageDragEnd}
                      className={cn(
                        "relative w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border border-border bg-muted group shrink-0 transition-all duration-150 cursor-move select-none",
                        draggedImageIndex === idx && "scale-[0.98] border-dashed border-primary",
                        draggedImageIndex !== null && draggedImageIndex !== idx && "border-primary/50"
                      )}
                    >
                      <GripVertical className="absolute top-1 left-1 h-4 w-4 text-white/80 z-20 drop-shadow-md pointer-events-none" />
                      {img.title && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="relative px-3.5 py-2 rounded bg-[#2d2d2d] text-white text-sm font-medium whitespace-nowrap shadow-lg">
                            {img.title}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-[6px] border-solid border-transparent border-t-[#2d2d2d]" />
                          </div>
                        </div>
                      )}
                      <img src={img.src || img.thumb} alt={img.title || ''} className="w-full h-full object-cover" />
                      {isDefault && (
                        <div className="absolute top-0 right-0 w-6 h-8 bg-blue-600 flex items-center justify-center [clip-path:polygon(0_0,100%_0,100%_100%,50%_85%,0_100%)] z-10">
                          <Star className="h-3 w-3 fill-white text-white shrink-0" />
                        </div>
                      )}
                      <button
                        onClick={() => onRemoveImage(img.id)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  )
                })}
              </div>
              {data.removedImageIds.size > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">{data.removedImageIds.size} image(s) removed</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      data.removedImageIds.forEach(imgId => onRestoreImage(imgId))
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Restore All
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>

    </Card>
  )
}
