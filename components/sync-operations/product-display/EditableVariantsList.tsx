import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Package, Trash2, RotateCcw, ChevronUp, ChevronDown, Star, Undo2, SquarePlus, ArrowDownToLine } from 'lucide-react'
import { cn, getVariantKey, isSameImageInfo } from '@/lib/utils'
import type { EditableVariant, ProductData } from '@/types/product'

interface EditableVariantsListProps {
  mode?: 'create' | 'edit'
  sourceProduct?: ProductData
  sourceDefaultLang?: string
  variants: EditableVariant[]
  activeLanguage: string
  dirtyVariants: Set<string | number>
  orderChanged: boolean
  onUpdateVariant: (idx: number, field: 'sku' | 'price_excl', value: string | number) => void
  onUpdateVariantTitle: (idx: number, lang: string, title: string) => void
  onRemoveVariant: (idx: number) => void
  onRestoreVariant: (idx: number) => void
  onResetVariant: (idx: number) => void
  onResetAllVariants: () => void
  onSelectVariantImage: (idx: number) => void
  onSetDefaultVariant: (idx: number) => void
  onRestoreDefaultVariant: () => void
  onAddVariantsFromSource?: () => void
  onResetVariantImage?: (idx: number) => void
  removedImageSrcs?: Set<string>
}

export function EditableVariantsList({
  mode = 'create',
  sourceProduct,
  sourceDefaultLang: sourceDefaultLangProp,
  variants,
  activeLanguage,
  dirtyVariants,
  orderChanged,
  onUpdateVariant,
  onUpdateVariantTitle,
  onRemoveVariant,
  onRestoreVariant,
  onResetVariant,
  onResetAllVariants,
  onSelectVariantImage,
  onSetDefaultVariant,
  onRestoreDefaultVariant,
  onAddVariantsFromSource,
  onResetVariantImage,
  removedImageSrcs,
}: EditableVariantsListProps) {
  
  // Split variants into active and deleted
  const activeVariants = variants.filter(v => !v.deleted)
  const deletedVariants = variants.filter(v => v.deleted)
  
  // Check if any variant's default status changed
  const hasDefaultChanges = activeVariants.some(v => 
    v.originalIsDefault !== undefined && v.is_default !== v.originalIsDefault
  )
  
  // Check if the original default variant is deleted (can't restore default in that case)
  const originalDefaultIsDeleted = variants.some(v => v.originalIsDefault === true && v.deleted === true)
  
  // Helper to find matching source variant by SKU
  const findSourceVariantBySku = (sku: string | null) => {
    if (!sku || !sourceProduct?.variants) return null
    return sourceProduct.variants.find(v => v.sku === sku)
  }
  
  // Helper to pick value from source variant
  const pickFromSourceVariant = (idx: number, field: 'sku' | 'price_excl' | 'title') => {
    const variant = variants[idx]
    if (!variant || !sourceProduct) return
    
    const sourceVariant = findSourceVariantBySku(variant.sku)
    if (!sourceVariant) return
    
    if (field === 'sku') {
      onUpdateVariant(idx, 'sku', sourceVariant.sku || '')
    } else if (field === 'price_excl') {
      onUpdateVariant(idx, 'price_excl', sourceVariant.price_excl)
    } else     if (field === 'title') {
      const sourceDefaultLang = sourceDefaultLangProp || 'nl'
      const sourceTitle = sourceVariant.content_by_language?.[sourceDefaultLang]?.title || ''
      onUpdateVariantTitle(idx, activeLanguage, sourceTitle)
    }
  }
  
  const renderVariant = (variant: EditableVariant, idx: number, isDeleted: boolean = false) => {
    const isChanged = dirtyVariants.has(getVariantKey(variant))
    const variantImageUrl = variant.image?.src || variant.image?.thumb
    const sourceVariant = findSourceVariantBySku(variant.sku)
    
    // Compare against original values
    const priceDifferent = variant.price_excl !== variant.originalPrice
    const titleDifferent = variant.content_by_language?.[activeLanguage]?.title !== variant.originalTitle?.[activeLanguage]
    const skuDifferent = variant.sku !== variant.originalSku
    const imageDifferent = !isSameImageInfo(variant.image ?? null, variant.originalImage ?? null)
    // Compare against source (for Pick from source for price/title)
    const priceDiffersFromSource = !!sourceVariant && Number(variant.price_excl) !== Number(sourceVariant.price_excl)
    const titleDiffersFromSource = !!sourceVariant && (variant.content_by_language?.[activeLanguage]?.title ?? '') !== (sourceVariant.content_by_language?.[sourceDefaultLangProp || activeLanguage]?.title ?? '')
    const originalImageDeleted = !!(
      variant.originalImage?.src &&
      removedImageSrcs?.has(variant.originalImage.src)
    )

    // Check if default status has changed
    const defaultChanged = variant.originalIsDefault !== undefined && variant.is_default !== variant.originalIsDefault
    
    // For new variants (temp_id) without addedFromSource, don't show "different" badges
    const isNewVariant = !!variant.temp_id && !variant.addedFromSource
    
    return (
      <div
        key={variant.variant_id || variant.temp_id}
        className={cn(
          "flex items-start gap-2 p-2 sm:p-3 rounded-lg border bg-muted/30 transition-all duration-200",
          isChanged && "border-amber-500",
          isDeleted && "opacity-60"
        )}
      >
        {isChanged && !isDeleted && !defaultChanged && (
          <Button
            variant={mode === 'create' ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => onResetVariant(idx)}
            className={mode === 'create' ? 'h-7 px-2 text-xs cursor-pointer shrink-0 mt-0.5 border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950' : 'h-7 w-7 p-0 cursor-pointer shrink-0 mt-0.5'}
            title={mode === 'create' ? 'Pick from source' : 'Reset variant to original values'}
          >
            {mode === 'create' ? (
              <><ArrowDownToLine className="h-3.5 w-3.5" /></>
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
        <div className="shrink-0 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => !isDeleted && onSelectVariantImage(idx)}
            disabled={isDeleted}
            className={cn(
              "w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center border-2 border-dashed border-border transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              !isDeleted && "cursor-pointer hover:border-primary"
            )}
          >
            {variantImageUrl ? (
              <img src={variantImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/50" />
            )}
          </button>
          {imageDifferent && variant.originalImage && !isDeleted && onResetVariantImage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResetVariantImage(idx)}
              disabled={originalImageDeleted}
              className="h-6 px-1.5 text-[10px] cursor-pointer"
              title={originalImageDeleted ? 'Original image was removed' : 'Reset variant image'}
            >
              <RotateCcw className="h-3 w-3 mr-0.5" /> Reset
            </Button>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <Input
                value={variant.sku ?? ''}
                readOnly
                placeholder="SKU"
                className="h-8 sm:h-8 text-xs sm:text-xs flex-1 min-w-0 cursor-default bg-muted/50"
              />
            </div>
            <div className="flex items-start gap-1">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="relative flex items-center h-8 rounded-md border border-input bg-transparent dark:bg-input/30 overflow-hidden min-w-[120px] sm:min-w-[120px] transition-[color,box-shadow] focus-within:ring-1 focus-within:ring-red-400 focus-within:border-red-300">
                  <span className="pl-2 text-xs text-muted-foreground shrink-0">€</span>
                  <input
                    type="number"
                    value={variant.price_excl}
                    onChange={(e) => onUpdateVariant(idx, 'price_excl', e.target.value)}
                    step="1"
                    placeholder="0.00"
                    disabled={isDeleted}
                    className="flex-1 h-full px-1 text-xs bg-transparent border-0 outline-none cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:cursor-default"
                  />
                  <div className="flex flex-col border-l border-input">
                    <button
                      type="button"
                      onClick={() => {
                        const currentPrice = parseFloat(String(variant.price_excl)) || 0
                        onUpdateVariant(idx, 'price_excl', (currentPrice + 1).toFixed(2))
                      }}
                      disabled={isDeleted}
                      className="h-4 px-1 hover:bg-accent transition-colors cursor-pointer flex items-center justify-center disabled:cursor-default disabled:opacity-50"
                      title="Increase price"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentPrice = parseFloat(String(variant.price_excl)) || 0
                        onUpdateVariant(idx, 'price_excl', Math.max(0, currentPrice - 1).toFixed(2))
                      }}
                      disabled={isDeleted}
                      className="h-4 px-1 hover:bg-accent transition-colors cursor-pointer flex items-center justify-center border-t border-input disabled:cursor-default disabled:opacity-50"
                      title="Decrease price"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
              {(priceDiffersFromSource || (mode === 'create' && priceDifferent)) && !isDeleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pickFromSourceVariant(idx, 'price_excl')}
                  className="h-8 px-2 text-xs cursor-pointer shrink-0 border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                  title="Pick from source"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                </Button>
              )}
              {priceDifferent && !isDeleted && mode === 'edit' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUpdateVariant(idx, 'price_excl', variant.originalPrice ?? 0)}
                  className="h-8 px-2 text-xs cursor-pointer shrink-0"
                  title="Reset price to original value"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <Input
                  value={variant.content_by_language[activeLanguage]?.title || ''}
                  onChange={(e) => onUpdateVariantTitle(idx, activeLanguage, e.target.value)}
                  placeholder="Variant title"
                  readOnly={isDeleted}
                  className={cn(
                    "h-8 text-xs flex-1",
                    isDeleted ? "cursor-default bg-muted/50" : "cursor-text"
                  )}
                />
              </div>
              {(titleDiffersFromSource || (mode === 'create' && titleDifferent)) && !isDeleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pickFromSourceVariant(idx, 'title')}
                  className="h-8 px-2 text-xs cursor-pointer shrink-0 border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                  title="Pick from source"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                </Button>
              )}
              {titleDifferent && !isDeleted && mode === 'edit' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onUpdateVariantTitle(idx, activeLanguage, variant.originalTitle?.[activeLanguage] || '')}
                  className="h-8 px-2 text-xs cursor-pointer shrink-0"
                  title="Reset title to original value"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {variant.addedFromSource && (
              <Badge variant="outline" className="text-xs border-blue-500 text-blue-600 dark:text-blue-400">
                Picked from source
              </Badge>
            )}
            {variant.is_default && (
              <Badge variant="outline" className="text-xs px-2 py-0.5 border-blue-500/70 text-blue-700 dark:text-blue-400">
                Default
              </Badge>
            )}
            {defaultChanged && (
              <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 text-xs px-2 py-0.5">
                Default status changed
              </Badge>
            )}
            {!isNewVariant && titleDifferent && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 text-xs px-2 py-0.5">
                Title is different
              </Badge>
            )}
            {!isNewVariant && priceDifferent && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 text-xs px-2 py-0.5">
                Price is different
              </Badge>
            )}
            {!isNewVariant && imageDifferent && (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 text-xs px-2 py-0.5">
                Image is different
              </Badge>
            )}
            {isDeleted && (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-xs px-2 py-0.5">
                Deleted
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {!isDeleted && !variant.is_default && activeVariants.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetDefaultVariant(idx)}
              className="h-7 w-7 p-0 cursor-pointer hover:bg-blue-500/10"
              title="Set as default variant"
            >
              <Star className="h-3.5 w-3.5 text-blue-600" />
            </Button>
          )}
          {isDeleted ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRestoreVariant(idx)}
              className="h-7 w-7 p-0 cursor-pointer bg-blue-600 hover:bg-blue-700 opacity-100"
              title="Restore variant"
            >
              <Undo2 className="h-3.5 w-3.5 text-white" />
            </Button>
          ) : !variant.is_default ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveVariant(idx)}
              className="h-7 w-7 p-0 cursor-pointer hover:bg-destructive/10"
              title="Delete variant"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs sm:text-sm font-bold uppercase">Variants ({activeVariants.length})</h4>
        <div className="flex gap-2 items-center flex-wrap">
          {mode === 'edit' && sourceProduct && onAddVariantsFromSource && (
            <Button
              size="sm"
              onClick={onAddVariantsFromSource}
              className="text-xs cursor-pointer bg-red-600 hover:bg-red-700 text-white"
              title="Add variants from source (sku, price, title only)"
            >
              <SquarePlus className="h-3 w-3 mr-1" />
              Add from source
            </Button>
          )}
          {hasDefaultChanges && originalDefaultIsDeleted && (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              Cannot restore default. The original default variant is deleted. Restore it first.
            </span>
          )}
          {(dirtyVariants.size > 0 || orderChanged) && (
            <Button
              size="sm"
              variant="outline"
              onClick={onResetAllVariants}
              className="text-xs cursor-pointer"
              title="Reset all variants to original values"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset All
            </Button>
          )}
          {hasDefaultChanges && !originalDefaultIsDeleted && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRestoreDefaultVariant}
              className="text-xs cursor-pointer"
              title="Restore original default variant"
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Restore Default
            </Button>
          )}
        </div>
      </div>
      
      {/* Active Variants */}
      <div className="space-y-2">
        {activeVariants.map((variant, idx) => {
          const actualIdx = variants.indexOf(variant)
          return renderVariant(variant, actualIdx, false)
        })}
      </div>
      
      {/* Deleted Variants Section */}
      {deletedVariants.length > 0 && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-dashed border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Deleted Variants ({deletedVariants.length})
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {deletedVariants.map((variant, idx) => {
              const actualIdx = variants.indexOf(variant)
              return renderVariant(variant, actualIdx, true)
            })}
          </div>
        </>
      )}
    </div>
  )
}
