import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, ExternalLink, RotateCcw, Loader2, ArrowDownToLine, CheckCircle2, AlertCircle, SquarePlus, Trash2, Star } from 'lucide-react'
import { getVisibilityOption, VISIBILITY_OPTIONS } from '@/lib/constants/product-ui'
import { EditableLanguageContentTabs } from '@/components/sync-operations/product-display/EditableLanguageContentTabs'
import { EditableVariantsList } from '@/components/sync-operations/product-display/EditableVariantsList'
import { ProductImagesGrid, ImageTooltipPortal, ImagePreviewDialog, type ProductImageMeta } from '@/components/sync-operations/product-display/ProductImagesGrid'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref, isSameImageInfo, getImageUrl } from '@/lib/utils'
import type { Language, EditableTargetData, ProductContent, ProductData } from '@/types/product'

function EditModeImagesSection({
  images,
  onAddImagesFromSource,
  onRemoveImageFromSource,
}: {
  images: ProductImageMeta[]
  onAddImagesFromSource?: () => void
  onRemoveImageFromSource?: (imageId: string) => void
}) {
  const [tooltip, setTooltip] = useState<{ title: string; anchor: DOMRect } | null>(null)
  const [previewImage, setPreviewImage] = useState<{ src?: string; thumb?: string; title?: string } | null>(null)

  useEffect(() => {
    setTooltip(null)
  }, [images])

  const originalImages = images.filter((img: ProductImageMeta & { addedFromSource?: boolean }) => !img.addedFromSource)
  const addedImages = images
    .filter((img: ProductImageMeta & { addedFromSource?: boolean }) => img.addedFromSource)
    .sort((a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0))

  const gridClass = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"

  return (
    <>
      <ImageTooltipPortal tooltip={tooltip} />
      <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
      <div className="space-y-4">
        {originalImages.length > 0 && (
          <div className={gridClass}>
            {originalImages.map((img, index) => {
              const src = img.src ?? img.thumb
              const isPrimary = index === 0
              const title = img.title
              return (
                <div
                  key={String(img.id)}
                  className="group relative"
                  onMouseEnter={title ? (e) => setTooltip({ title, anchor: e.currentTarget.getBoundingClientRect() }) : undefined}
                  onMouseLeave={title ? () => setTooltip(null) : undefined}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewImage({ src, thumb: img.thumb, title })}
                    className="w-full aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted hover:border-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer transition-colors"
                  >
                    {src ? (
                      <img src={src} alt={img.title || 'Product image'} className="w-full h-full object-cover" />
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
        )}

        {(addedImages.length > 0 || onAddImagesFromSource) && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-dashed border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Images from source</span>
              </div>
            </div>

            <div className={gridClass}>
              {addedImages.map((img, index) => {
                const src = img.src ?? img.thumb
                const title = img.title
                return (
                  <div
                    key={String(img.id)}
                    className="group relative"
                    onMouseEnter={title ? (e) => setTooltip({ title, anchor: e.currentTarget.getBoundingClientRect() }) : undefined}
                    onMouseLeave={title ? () => setTooltip(null) : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ src, thumb: img.thumb, title })}
                      className="w-full aspect-square rounded-lg overflow-hidden border border-border/40 bg-muted hover:border-border focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer transition-colors"
                    >
                      {src ? (
                        <img src={src} alt={img.title || 'Product image'} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                    </button>
                    {onRemoveImageFromSource && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemoveImageFromSource(String(img.id)) }}
                        className="absolute top-1 right-1 w-7 h-7 rounded-md bg-destructive/90 hover:bg-destructive text-destructive-foreground flex items-center justify-center cursor-pointer transition-colors"
                        title="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            {onAddImagesFromSource && (
              <button
                type="button"
                onClick={onAddImagesFromSource}
                className="aspect-square w-full rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex items-center justify-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                title="Add images from source"
              >
                <SquarePlus className="h-8 w-8 text-muted-foreground" />
              </button>
            )}
          </div>
        </>
      )}
      </div>
    </>
  )
}

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
  onLanguageChange: (lang: string) => void
  onUpdateField: (lang: string, field: keyof ProductContent, value: string) => void
  onResetField: (lang: string, field: keyof ProductContent) => void
  onResetLanguage: (lang: string) => void
  onRetranslateField?: (lang: string, field: keyof ProductContent) => void
  onRetranslateLanguage?: (lang: string) => void
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
  onRemoveImageFromSource?: (imageId: string) => void
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
  onLanguageChange,
  onUpdateField,
  onResetField,
  onResetLanguage,
  onRetranslateField,
  onRetranslateLanguage,
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
  
  const targetProductImageUrl = getImageUrl(data.productImage)
  const productImageChanged = !isSameImageInfo(data.productImage, data.originalProductImage)
  
  // PRODUCT IMAGE BUTTON LOGIC:
  // CREATE mode: originalProductImage IS the source image
  //              Show "Pick from Source" when changed or order changed
  // EDIT mode: originalProductImage is the target's original image
  //            Show "Reset" when changed or order changed
  const showProductImagePickFromSource = mode === 'create' && (productImageChanged || data.imageOrderChanged)
  const showProductImageReset = mode === 'edit' && (productImageChanged || data.imageOrderChanged)
  
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
                onClick={onSelectProductImage}
                className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-lg overflow-hidden bg-muted flex items-center justify-center ring-1 ring-border/50 hover:ring-primary/50 transition-colors cursor-pointer"
              >
                {targetProductImageUrl ? (
                  <img src={targetProductImageUrl} alt="Product" className="w-full h-full object-cover" />
                ) : (
                  <Package className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/30" />
                )}
              </button>
            </div>
            {showProductImagePickFromSource && (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetProductImage}
                className="w-full h-9 px-2 text-xs cursor-pointer border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                title="Pick from source and restore original image order"
              >
                <ArrowDownToLine className="h-3 w-3 mr-1" />
                Pick from source
              </Button>
            )}
            {showProductImageReset && (
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
                title="Reset all fields, variants, and settings to original values"
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
            />
          </div>
        )}

        <div className="border-t border-border/50 pt-3 sm:pt-4">
          <EditableVariantsList
            mode={mode}
            sourceProduct={sourceProduct}
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
          />
          {(data.targetImagesLink || imagesLink || data.images.length > 0 || (sourceImages != null && sourceImages.length > 0)) && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
              {mode === 'edit' && (onAddImagesFromSource != null || onRemoveImageFromSource != null) ? (
                <EditModeImagesSection
                  images={data.images}
                  onAddImagesFromSource={onAddImagesFromSource}
                  onRemoveImageFromSource={onRemoveImageFromSource}
                />
              ) : (
                <ProductImagesGrid
                  productId={mode === 'edit' && data.targetProductId ? data.targetProductId : sourceProductId}
                  imagesLink={mode === 'edit' && data.targetImagesLink ? data.targetImagesLink : imagesLink}
                  shopTld={mode === 'edit' ? shopTld : sourceShopTld}
                  images={data.images}
                  trailingElement={mode === 'edit' && onAddImagesFromSource ? (
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
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
