import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, ExternalLink, RotateCcw, Loader2, ArrowDownToLine, CheckCircle2, AlertCircle, SquarePlus, Trash2, Star, Undo2 } from 'lucide-react'
import { getVisibilityOption, VISIBILITY_OPTIONS } from '@/lib/constants/product-ui'
import { EditableLanguageContentTabs } from '@/components/sync-operations/product-display/EditableLanguageContentTabs'
import { EditableVariantsList } from '@/components/sync-operations/product-display/EditableVariantsList'
import { ProductImagesGrid, ImageTooltipPortal, ImagePreviewDialog, type ProductImageMeta } from '@/components/sync-operations/product-display/ProductImagesGrid'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref, isSameImageInfo, getImageUrl, getDisplayProductImage, sortImagesForDisplay, cn } from '@/lib/utils'
import type { Language, EditableTargetData, ProductContent, ProductData } from '@/types/product'

interface TargetPanelProps {
  mode?: 'create' | 'edit'
  sourceProduct?: ProductData
  shopTld: string
  shopName: string
  baseUrl: string
  languages: Language[]
  data: EditableTargetData | undefined
  activeLanguage: string
  imagesLink: string | null | undefined
  sourceProductId: number
  sourceShopTld: string
  sourceDefaultLang?: string
  resettingField?: string | null
  retranslatingField?: string | null
  translating?: boolean
  error?: string | null
  sourceImages?: ProductImageMeta[] | null
  /** When true (edit mode), show skeleton in images grid while target images are loading. */
  targetImagesLoading?: boolean
  onLanguageChange: (lang: string) => void
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
  onRetranslateField?: (lang: string, field: keyof ProductContent) => void
  onRetranslateLanguage?: (lang: string) => void
  onContentFocus?: (lang: string) => void
  onResetShop: () => void
  onUpdateVariant: (idx: number, field: 'sku' | 'price_excl', value: string | number) => void
  onUpdateVariantTitle: (idx: number, lang: string, title: string) => void
  onRemoveVariant: (idx: number) => void
  onRestoreVariant: (idx: number) => void
  onResetVariant: (idx: number) => void
  onResetAllVariants: () => void
  onSelectVariantImage: (idx: number) => void
  onSelectProductImage: () => void
  onUpdateVisibility: (visibility: string) => void
  onResetVisibility: () => void
  onResetProductImage: () => void
  onSetDefaultVariant: (idx: number) => void
  onRestoreDefaultVariant: () => void
  onAddImagesFromSource?: () => void
  onRemoveImageFromSource?: (imageSrc: string) => void
  onRestoreImageFromSource?: (imageSrc: string) => void
  onAddVariantsFromSource?: () => void
  onResetVariantImage?: (idx: number) => void
}

export function TargetPanel({
  mode = 'create',  // Default to create mode for backward compatibility
  sourceProduct,
  shopTld,
  shopName,
  baseUrl,
  languages,
  data,
  activeLanguage,
  imagesLink,
  sourceProductId,
  sourceShopTld,
  sourceDefaultLang,
  resettingField,
  retranslatingField,
  translating = false,
  error = null,
  sourceImages,
  targetImagesLoading = false,
  onLanguageChange,
  onUpdateField,
  onResetField,
  onResetLanguage,
  onRetranslateField,
  onRetranslateLanguage,
  onContentFocus,
  onResetShop,
  onUpdateVariant,
  onUpdateVariantTitle,
  onRemoveVariant,
  onRestoreVariant,
  onResetVariant,
  onResetAllVariants,
  onSelectVariantImage,
  onSelectProductImage,
  onUpdateVisibility,
  onResetVisibility,
  onResetProductImage,
  onSetDefaultVariant,
  onRestoreDefaultVariant,
  onAddImagesFromSource,
  onRemoveImageFromSource,
  onRestoreImageFromSource,
  onAddVariantsFromSource,
  onResetVariantImage,
}: TargetPanelProps) {
  if (!data && !error) {
    // Show loading state when data is being initialized (same style as main page loading)
    return (
      <Card className="border-border/50 flex flex-col h-fit overflow-hidden relative">
        <LoadingShimmer show={true} position="top" />
        <CardContent className="p-8 flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Translating content...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    // Show error state when translation failed
    return (
      <Card className="border-border/50 flex flex-col h-fit overflow-hidden relative border-destructive/50">
        <CardHeader className="pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-2 sm:mb-3 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap mb-1 sm:mb-2">
                <span className="truncate">{shopName || 'Shop'}</span>
                <Badge variant="outline" className="text-xs sm:text-sm shrink-0">.{shopTld}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">Target</Badge>
                <Badge variant="destructive" className="text-xs">Translation Failed</Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-8 flex flex-col items-center justify-center min-h-[300px]">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <Package className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2 text-destructive">Translation Error</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // After the checks above, data must be defined
  if (!data) {
    return null // Shouldn't happen, but satisfies TypeScript
  }

  const shopUrl = toSafeExternalHref(baseUrl)
  // EDIT: when all images deleted, productImage is null – use null, not originalProductImage (would show deleted image)
  const productOrSrc = mode === 'create'
    ? (sourceProduct?.product_image ? { product_image: sourceProduct.product_image } : (sourceProduct?.product_image?.src ?? data.originalProductImage?.src ?? null) as string | null)
    : (data.productImage ? { product_image: data.productImage } : null)
  const visibilityChanged = data.visibility !== data.originalVisibility
  
  // Get source visibility from source product
  const sourceVisibility = sourceProduct?.visibility
  
  // VISIBILITY BUTTON LOGIC:
  // CREATE mode: In create mode, originalVisibility IS the source visibility
  //              So we check if current differs from original (which is source)
  //              Show "Pick from Source" when changed
  // EDIT mode: originalVisibility is the target's original value
  //            Show "Pick from Source" if differs from source
  //            Show "Reset" if differs from original target
  const showVisibilityPickFromSource = mode === 'create' 
    ? visibilityChanged  // In create mode, any change means it differs from source
    : (sourceVisibility && data.visibility !== sourceVisibility)  // In edit mode, check against source
  const showVisibilityReset = mode === 'edit' && visibilityChanged
  
  const remainingImages = data.images.filter(img => !data.removedImageSrcs.has(img.src ?? ''))
  const deletedImagesToShow = data.images.filter(
    img => data.removedImageSrcs.has(img.src ?? '') && !(img as { addedFromSource?: boolean }).addedFromSource
  )
  const effectiveProductImage = data.productImage?.src && data.removedImageSrcs.has(data.productImage.src) ? null : data.productImage
  const targetProductImageUrl = mode === 'edit'
    ? getImageUrl(getDisplayProductImage({ product_image: effectiveProductImage }, remainingImages) ?? effectiveProductImage)
    : getImageUrl(data.productImage)
  const productImageChanged = !isSameImageInfo(data.productImage, data.originalProductImage)
  
  // PRODUCT IMAGE BUTTON LOGIC:
  // Only show Reset (no Pick from source). Reset restores to original.
  // Disable Reset when original image was deleted (cannot restore)
  const showProductImageReset = (productImageChanged || data.imageOrderChanged) && !(
    data.originalProductImage?.src && data.removedImageSrcs.has(data.originalProductImage.src)
  )
  
  // Get product admin URL for edit mode
  const productAdminUrl = mode === 'edit' && data.targetProductId && shopUrl 
    ? `${shopUrl}/admin/products/${data.targetProductId}` 
    : null

  return (
    <Card className="border-border/50 flex flex-col h-fit overflow-hidden relative">
      {translating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Translating content...</p>
          </div>
        </div>
      )}
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
              {mode === 'edit' && data.targetMatchedByDefaultVariant !== undefined && (
                <Badge variant="outline" className={data.targetMatchedByDefaultVariant ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300' : 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300'}>
                  {data.targetMatchedByDefaultVariant ? <><CheckCircle2 className="h-3 w-3 mr-1" />Default Match</> : <><AlertCircle className="h-3 w-3 mr-1" />Non-default Match</>}
                </Badge>
              )}
              {productAdminUrl && (
                <a href={productAdminUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 font-medium cursor-pointer">
                  <ExternalLink className="h-3 w-3" />
                  Product #{data.targetProductId}
                </a>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 sm:space-y-4 pt-0 px-4 sm:px-6 pb-4 sm:pb-6">
        <div className="flex flex-row gap-3 sm:gap-5 min-w-0">
          <div className="shrink-0 flex flex-col items-start gap-2">
            <div className="relative group">
              <button
                type="button"
                onClick={mode === 'edit' ? undefined : onSelectProductImage}
                disabled={mode === 'edit'}
                title={mode === 'edit' ? 'Product image cannot be changed in edit mode' : (showProductImageReset ? 'Click Reset to change image again' : 'Select product image')}
                className={cn(
                  'w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-lg overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50 transition-colors',
                  mode === 'edit'
                    ? 'opacity-70 cursor-not-allowed'
                    : showProductImageReset
                    ? 'opacity-70 cursor-not-allowed'
                    : 'hover:ring-primary/50 cursor-pointer'
                )}
              >
                {targetProductImageUrl ? (
                  <img src={targetProductImageUrl} alt="Product" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
                    <Package className="h-8 w-8 sm:h-10 sm:w-10" />
                    <span className="text-[10px] sm:text-xs">No image</span>
                  </div>
                )}
              </button>
            </div>
            {mode !== 'edit' && showProductImageReset && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetProductImage}
                className="w-full h-9 px-2 text-xs cursor-pointer"
                title="Reset to original and restore original image order"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-2 sm:gap-y-4 text-[13px] sm:text-sm md:text-base">
            {/* Row 1: Visibility | Price */}
            <div className="flex flex-col items-start sm:items-center justify-center sm:text-center">
              <span className="text-muted-foreground block mb-0.5 text-[11px] sm:text-xs">Visibility</span>
              <div className="flex items-center gap-1.5 justify-center w-full flex-wrap">
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
                {showVisibilityPickFromSource && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => mode === 'create' ? onResetVisibility() : (sourceVisibility && onUpdateVisibility(sourceVisibility))}
                    className="h-9 px-2 text-xs cursor-pointer border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                    title="Pick visibility from source product"
                  >
                    <ArrowDownToLine className="h-3 w-3 mr-1" />
                    Pick from source
                  </Button>
                )}
                {showVisibilityReset && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onResetVisibility}
                    className="h-9 px-2 text-xs cursor-pointer"
                    title="Reset visibility to original target value"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                )}
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
                title="Reset all fields to original values for this shop"
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
              mode={mode}
              sourceProduct={sourceProduct}
              shopTld={shopTld}
              languages={languages}
              content={data.content_by_language}
              dirtyFields={data.dirtyFields}
              translationMeta={data.translationMeta}
              sourceDefaultLang={sourceDefaultLang}
              resettingField={resettingField}
              retranslatingField={retranslatingField}
              onUpdateField={onUpdateField}
              onResetField={onResetField}
              onResetLanguage={onResetLanguage}
              onRetranslateField={onRetranslateField}
              onRetranslateLanguage={onRetranslateLanguage}
              onContentFocus={onContentFocus}
            />
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <EditableVariantsList
            mode={mode}
            sourceProduct={sourceProduct}
            sourceDefaultLang={sourceDefaultLang}
            variants={data.variants}
            activeLanguage={activeLanguage}
            dirtyVariants={data.dirtyVariants}
            orderChanged={data.orderChanged}
            onUpdateVariant={onUpdateVariant}
            onUpdateVariantTitle={onUpdateVariantTitle}
            onRemoveVariant={onRemoveVariant}
            onRestoreVariant={onRestoreVariant}
            onResetVariant={onResetVariant}
            onResetAllVariants={onResetAllVariants}
            onSelectVariantImage={onSelectVariantImage}
            onSetDefaultVariant={onSetDefaultVariant}
            onRestoreDefaultVariant={onRestoreDefaultVariant}
            onAddVariantsFromSource={onAddVariantsFromSource}
            onResetVariantImage={onResetVariantImage}
            removedImageSrcs={data.removedImageSrcs}
          />
          {(data.targetImagesLink || imagesLink || data.images.length > 0 || (sourceImages != null && sourceImages.length > 0) || onAddImagesFromSource) && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
              <>
                <ProductImagesGrid
                  productId={mode === 'edit' && data.targetProductId ? data.targetProductId : sourceProductId}
                  imagesLink={mode === 'edit' && data.targetImagesLink ? data.targetImagesLink : imagesLink}
                  shopTld={mode === 'edit' ? shopTld : sourceShopTld}
                  images={data.images.filter(img => !data.removedImageSrcs.has(img.src ?? ''))}
                  imagesLoading={targetImagesLoading}
                  productOrSrc={productOrSrc}
                  onRemoveImage={onRemoveImageFromSource ?? undefined}
                  trailingElement={onAddImagesFromSource ? (
                    <button
                      type="button"
                      onClick={onAddImagesFromSource}
                      className="aspect-square w-full rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex items-center justify-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      title="Add images from source"
                    >
                      <SquarePlus className="h-8 w-8 text-muted-foreground" />
                    </button>
                  ) : undefined}
                />
                {deletedImagesToShow.length > 0 && onRestoreImageFromSource && (
                  <DeletedImagesSection
                    images={sortImagesForDisplay(deletedImagesToShow, productOrSrc)}
                    onRestore={onRestoreImageFromSource}
                  />
                )}
              </>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DeletedImagesSection({
  images,
  onRestore,
}: {
  images: ProductImageMeta[]
  onRestore: (imageSrc: string) => void
}) {
  const [tooltip, setTooltip] = useState<{ title: string; anchor: DOMRect } | null>(null)
  const imagesKey = useMemo(() => images.map(i => (i.src ?? i.id ?? '')).join('|'), [images])
  useEffect(() => {
    setTooltip(null)
  }, [imagesKey])

  return (
    <>
      <ImageTooltipPortal tooltip={tooltip} />
      <div className="relative mt-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-dashed border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Deleted Images ({images.length})
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mt-3">
        {images.map((img) => {
          const src = img.src ?? img.thumb
          const title = img.title
          return (
            <div
              key={img.src ?? String(img.id)}
              className="group relative opacity-70"
              onMouseEnter={title ? (e) => setTooltip({ title, anchor: e.currentTarget.getBoundingClientRect() }) : undefined}
              onMouseLeave={title ? () => setTooltip(null) : undefined}
            >
              <div className="aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted">
                {src ? (
                  <img src={src} alt={img.title || 'Deleted image'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              {img.src && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRestore(img.src!)}
                  className="absolute top-1 right-1 w-7 h-7 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center cursor-pointer p-0"
                  title="Restore image"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
