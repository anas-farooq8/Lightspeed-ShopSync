import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, ExternalLink, RotateCcw, Loader2 } from 'lucide-react'
import { getVisibilityOption, VISIBILITY_OPTIONS } from '@/lib/constants/product-ui'
import { EditableLanguageContentTabs } from '@/components/sync-operations/product-display/EditableLanguageContentTabs'
import { EditableVariantsList } from '@/components/sync-operations/product-display/EditableVariantsList'
import { ProductImagesGrid, type ProductImageMeta } from '@/components/sync-operations/product-display/ProductImagesGrid'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { toSafeExternalHref, isSameImageInfo, getImageUrl } from '@/lib/utils'
import type { Language, EditableTargetData, ProductContent } from '@/types/product'

interface TargetPanelProps {
  shopTld: string
  shopName: string
  baseUrl: string
  languages: Language[]
  data: EditableTargetData | undefined
  activeLanguage: string
  imagesLink: string | null | undefined
  sourceShopTld: string
  sourceDefaultLang?: string
  resettingField?: string | null
  retranslatingField?: string | null
  translating?: boolean
  error?: string | null
  /** Pre-fetched source images (create-preview: same metadata for all targets, no extra fetch). */
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
  onAddVariant: () => void
  onRemoveVariant: (idx: number) => void
  onMoveVariant: (from: number, to: number) => void
  onResetVariant: (idx: number) => void
  onResetAllVariants: () => void
  onSelectVariantImage: (idx: number) => void
  onSelectProductImage: () => void
  onUpdateVisibility: (visibility: string) => void
  onResetVisibility: () => void
  onResetProductImage: () => void
}

export function TargetPanel({
  shopTld,
  shopName,
  baseUrl,
  languages,
  data,
  activeLanguage,
  imagesLink,
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
  onAddVariant,
  onRemoveVariant,
  onMoveVariant,
  onResetVariant,
  onResetAllVariants,
  onSelectVariantImage,
  onSelectProductImage,
  onUpdateVisibility,
  onResetVisibility,
  onResetProductImage
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
  const targetProductImageUrl = getImageUrl(data.productImage)
  const productImageChanged = !isSameImageInfo(data.productImage, data.originalProductImage)

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
          {(imagesLink || data.images.length > 0 || (sourceImages != null && sourceImages.length > 0)) && (
            <div className="border-t border-border/50 pt-3 sm:pt-4 mt-3 sm:mt-4">
              <h4 className="text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-3">Images</h4>
              <ProductImagesGrid
                imagesLink={imagesLink}
                shopTld={sourceShopTld}
                // In preview-create, show the target's current image order (which can change when selecting a new product image).
                // Keep `sourceImages` only as a defensive fallback.
                images={data.images}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
