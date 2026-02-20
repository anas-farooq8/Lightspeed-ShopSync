"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Package, Store, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Generic ConfirmDialog ──────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  cancelLabel?: string
  confirmLabel: string
  confirmClassName?: string
  onConfirm: () => void
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmClassName = 'bg-red-600 hover:bg-red-700',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base sm:text-lg break-words">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm sm:text-base break-words">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel className="w-full sm:w-auto">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={cn("w-full sm:w-auto", confirmClassName)}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── UnsavedChangesDialog ───────────────────────────────────────────────────

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Unsaved Changes"
      description="You have unsaved changes. Are you sure you want to leave? All changes will be lost."
      cancelLabel="Continue Editing"
      confirmLabel="Discard Changes"
      confirmClassName="bg-destructive hover:bg-destructive/90"
      onConfirm={onDiscard}
    />
  )
}

// ─── CreateProductConfirmationDialog ────────────────────────────────────────

export interface CreateProductConfirmationContent {
  shopName: string
  shopTld: string
  variantCount: number
  imageCount: number
  sku: string
}

export function CreateProductConfirmationDialog({
  open,
  onOpenChange,
  content,
  onConfirm,
  mode = 'create',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: CreateProductConfirmationContent | null
  onConfirm: () => void
  mode?: 'create' | 'edit'
}) {
  const isEdit = mode === 'edit'
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Store className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 shrink-0" />
            <span className="break-words">
              {isEdit ? 'Confirm Product Update' : 'Confirm Product Creation'}
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 sm:space-y-3 pt-1 text-left">
              {content ? (
                <>
                  <p className="text-sm sm:text-base text-foreground font-medium break-words">
                    {isEdit
                      ? 'Are you sure you want to update this product in the following shop?'
                      : 'Are you sure you want to create this product in the following shop?'}
                  </p>
                  <div className="rounded-lg border bg-muted/50 p-3 sm:p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 shrink-0">
                        {content.shopTld.toUpperCase()}
                      </span>
                      <span className="break-words">{content.shopName}</span>
                    </div>
                    <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 break-words">
                      <li>• {content.variantCount} variant{content.variantCount !== 1 ? 's' : ''}</li>
                      <li>• {content.imageCount} image{content.imageCount !== 1 ? 's' : ''}</li>
                      <li>• SKU: <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono break-all">{content.sku}</code></li>
                    </ul>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground break-words">
                    {isEdit
                      ? 'This will update the product in your Lightspeed store.'
                      : 'This will create a new product in your Lightspeed store. The operation cannot be undone automatically.'}
                  </p>
                </>
              ) : (
                <p className="text-sm sm:text-base">Loading...</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="w-full sm:w-auto bg-red-600 hover:bg-red-700">
            {isEdit ? 'Yes, Update Product' : 'Yes, Create Product'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── ImageSelectionDialog ───────────────────────────────────────────────────

export interface ProductImageForSelection {
  id: string | number
  src?: string
  thumb?: string
  title?: string
  sort_order?: number
}

/** Selected image when dialog opens: null = No Image, ImageInfo = that image. undefined = none. */
type DialogSelectedImage = { src?: string; thumb?: string; title?: string } | null | undefined

function isSameSelection(
  selected: DialogSelectedImage,
  img: ProductImageForSelection | null
): boolean {
  if (selected === undefined) return false
  if (!selected && !img) return true
  if (!selected || !img) return false
  return (selected.src ?? '') === (img.src ?? '')
}

export function ImageSelectionDialog({
  open,
  onOpenChange,
  title,
  images,
  showNoImageOption,
  selectedImage,
  onSelectImage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: 'Select Product Image' | 'Select Variant Image'
  images: ProductImageForSelection[]
  showNoImageOption: boolean
  selectedImage?: DialogSelectedImage
  onSelectImage: (image: ProductImageForSelection | null) => void
}) {
  const handleClose = () => onOpenChange(false)
  const handleSelect = (img: ProductImageForSelection | null) => {
    onSelectImage(img)
    handleClose()
  }

  const noImageSelected = showNoImageOption && selectedImage !== undefined && selectedImage === null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); onOpenChange(o) }}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl md:max-w-4xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg break-words">{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 p-2 sm:p-4">
          {showNoImageOption && (
            <div
              onClick={() => handleSelect(null)}
              className={cn(
                "aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors",
                noImageSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary"
              )}
            >
              <div className="text-center text-muted-foreground text-xs sm:text-sm px-1">
                <Package className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-1 sm:mb-2" />
                <p className="break-words">No Image</p>
              </div>
            </div>
          )}
          {images.map((img) => {
            const selected = isSameSelection(selectedImage, img)
            return (
              <div
                key={String(img.id)}
                onClick={() => handleSelect(img)}
                className={cn(
                  "aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-colors",
                  selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary"
                )}
              >
                <img src={img.src ?? img.thumb ?? ''} alt={img.title ?? ''} className="w-full h-full object-cover" />
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="cursor-pointer w-full sm:w-auto">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── AddImagesFromSourceDialog ──────────────────────────────────────────────

export function AddImagesFromSourceDialog({
  open,
  onOpenChange,
  sourceImages,
  targetImageIds = new Set<string>(),
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceImages: ProductImageForSelection[]
  targetImageIds?: Set<string>
  onConfirm: (images: ProductImageForSelection[]) => void
}) {
  const [selected, setSelected] = useState<ProductImageForSelection[]>([])

  const handleToggle = useCallback((img: ProductImageForSelection) => {
    if (targetImageIds.has(String(img.id))) return
    setSelected(prev => {
      const idx = prev.findIndex(p => String(p.id) === String(img.id))
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx)
      }
      return [...prev, img]
    })
  }, [targetImageIds])

  const handleConfirm = useCallback(() => {
    onConfirm(selected)
    setSelected([])
    onOpenChange(false)
  }, [onConfirm, selected, onOpenChange])

  const handleClose = useCallback(() => {
    setSelected([])
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) setSelected([])
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); onOpenChange(o) }}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl md:max-w-4xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Add images from source</DialogTitle>
          <DialogDescription>
            Select images to add to the target product. Order of selection is preserved (1, 2, 3…). Images already in target are shown but cannot be selected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 p-2 sm:p-4">
          {sourceImages.length === 0 ? (
            <p className="col-span-full text-muted-foreground text-sm">No images available from source.</p>
          ) : (
            sourceImages.map((img) => {
              const order = selected.findIndex(p => String(p.id) === String(img.id)) + 1
              const isSelected = order > 0
              const alreadyInTarget = targetImageIds.has(String(img.id))
              return (
                <button
                  key={String(img.id)}
                  type="button"
                  onClick={() => handleToggle(img)}
                  disabled={alreadyInTarget}
                  className={cn(
                    "aspect-square rounded-lg overflow-hidden border-2 transition-colors relative",
                    alreadyInTarget && "cursor-not-allowed opacity-60",
                    !alreadyInTarget && "cursor-pointer",
                    isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
                  )}
                >
                  <img
                    src={img.src ?? img.thumb ?? ''}
                    alt={img.title ?? ''}
                    className="w-full h-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {order}
                    </div>
                  )}
                  {alreadyInTarget && !isSelected && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-xs text-white font-medium px-2 py-0.5 bg-black/60 rounded">In target</span>
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="cursor-pointer w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleConfirm} disabled={selected.length === 0} className="cursor-pointer w-full sm:w-auto">
            Add {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── AddVariantsFromSourceDialog ─────────────────────────────────────────────

export interface VariantForSelection {
  variant_id: number
  sku: string | null
  price_excl: number
  sort_order?: number
  content_by_language?: Record<string, { title?: string }>
}

export function AddVariantsFromSourceDialog({
  open,
  onOpenChange,
  sourceVariants,
  targetVariantSkus = new Set<string>(),
  sourceDefaultLang = '',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceVariants: VariantForSelection[]
  targetVariantSkus?: Set<string>
  sourceDefaultLang?: string
  onConfirm: (variants: VariantForSelection[]) => void
}) {
  const [selected, setSelected] = useState<VariantForSelection[]>([])

  const allVariantsSorted = useMemo(() => {
    return [...sourceVariants].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
  }, [sourceVariants])

  const handleToggle = useCallback((v: VariantForSelection) => {
    if (targetVariantSkus.has((v.sku || '').toLowerCase().trim())) return
    setSelected(prev => {
      const idx = prev.findIndex(p => p.variant_id === v.variant_id && p.sku === v.sku)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, v]
    })
  }, [targetVariantSkus])

  const handleConfirm = useCallback(() => {
    const ordered = [...selected].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    onConfirm(ordered)
    setSelected([])
    onOpenChange(false)
  }, [onConfirm, selected, onOpenChange])

  const handleClose = useCallback(() => {
    setSelected([])
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) setSelected([])
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); onOpenChange(o) }}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Add variants from source</DialogTitle>
          <DialogDescription>
            Select variants to add to the target. Only title, price, and SKU are copied (no image). Order follows source. Variants already in target cannot be selected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 p-2 sm:p-4">
          {allVariantsSorted.length === 0 ? (
            <p className="text-muted-foreground text-sm">No variants available from source</p>
          ) : (
            allVariantsSorted.map((v) => {
              const title = v.content_by_language?.[sourceDefaultLang]?.title ?? ''
              const isSelected = selected.some(p => p.variant_id === v.variant_id && p.sku === v.sku)
              const alreadyInTarget = targetVariantSkus.has((v.sku || '').toLowerCase().trim())
              const order = selected.findIndex(p => p.variant_id === v.variant_id && p.sku === v.sku) + 1
              return (
                <button
                  key={`${v.variant_id}-${v.sku}`}
                  type="button"
                  onClick={() => handleToggle(v)}
                  disabled={alreadyInTarget}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-lg border-2 text-left transition-colors relative",
                    alreadyInTarget && "cursor-not-allowed opacity-60",
                    !alreadyInTarget && "cursor-pointer",
                    isSelected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="font-medium truncate">{title || v.sku || 'Untitled'}</span>
                    <span className="text-xs text-muted-foreground">
                      SKU: {v.sku || '-'} · €{v.price_excl.toFixed(2)}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {order}
                    </span>
                  )}
                  {alreadyInTarget && !isSelected && (
                    <span className="shrink-0 text-xs font-medium px-2 py-0.5 bg-muted rounded">In target</span>
                  )}
                </button>
              )
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="cursor-pointer w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleConfirm} disabled={selected.length === 0} className="cursor-pointer w-full sm:w-auto">
            Add {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TargetShopSelectionDialog ──────────────────────────────────────────────

interface TargetShop {
  tld: string
  name: string
  status: 'not_exists' | 'exists' | 'unknown'
}

export function TargetShopSelectionDialog({
  open,
  onOpenChange,
  targetShops,
  onConfirm,
  productSku,
  isLoading = false,
  mode = 'create',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetShops: TargetShop[]
  onConfirm: (selectedShops: string[]) => void
  productSku: string
  isLoading?: boolean
  mode?: 'create' | 'edit'
}) {
  const defaultSelection = useMemo(() => 
    mode === 'edit' 
      ? targetShops.filter((s) => s.status === 'exists').map((s) => s.tld)
      : targetShops.filter((s) => s.status === 'not_exists').map((s) => s.tld), 
    [targetShops, mode]
  )
  const [selectedShops, setSelectedShops] = useState<Set<string>>(() => new Set(defaultSelection))

  useEffect(() => {
    if (open) setSelectedShops(new Set(defaultSelection))
  }, [open, defaultSelection])

  const handleToggle = useCallback((tld: string, canSelect: boolean) => {
    if (!canSelect) return
    setSelectedShops((prev) => {
      const next = new Set(prev)
      next.has(tld) ? next.delete(tld) : next.add(tld)
      return next
    })
  }, [])

  const handleConfirm = useCallback(() => onConfirm(Array.from(selectedShops)), [onConfirm, selectedShops])

  const dialogTitle = mode === 'edit' ? 'Select Shops to Edit' : 'Select Target Shops'
  const dialogDescription = mode === 'edit' 
    ? `Choose which shops to edit this product in. Product SKU: ` 
    : `Choose which shops to create this product in. Product SKU: `

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg break-words">{dialogTitle}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm break-words">
            {dialogDescription}
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs break-all">{productSku}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 sm:space-y-3 py-2 sm:py-4 max-h-[60vh] sm:max-h-none overflow-y-auto">
          {targetShops.map((shop) => {
            const exists = shop.status === 'exists'
            const canSelect = mode === 'edit' ? exists : !exists
            return (
              <div
                key={shop.tld}
                role="button"
                tabIndex={canSelect ? 0 : -1}
                className={cn(
                  'flex items-start sm:items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border',
                  !canSelect ? 'bg-muted/30 border-muted cursor-not-allowed opacity-60' : 'bg-background border-border hover:bg-muted/50 cursor-pointer transition-colors'
                )}
                onClick={() => handleToggle(shop.tld, canSelect)}
                onKeyDown={(e) => canSelect && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleToggle(shop.tld, true))}
              >
                <span onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0 mt-0.5 sm:mt-0">
                  <Checkbox id={`shop-${shop.tld}`} checked={selectedShops.has(shop.tld)} disabled={!canSelect} onCheckedChange={() => handleToggle(shop.tld, canSelect)} className="cursor-pointer" />
                </span>
                <div className="flex-1 min-w-0">
                  <Label htmlFor={`shop-${shop.tld}`} className={cn('font-medium text-sm sm:text-base break-words', canSelect ? 'cursor-pointer' : 'cursor-not-allowed')}>
                    {shop.name}
                  </Label>
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                    <Badge variant="outline" className="text-xs shrink-0">.{shop.tld}</Badge>
                    {exists ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 shrink-0" />
                        <span className="whitespace-nowrap">Already exists</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-600 shrink-0" />
                        <span className="whitespace-nowrap">Not exists</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading} className="cursor-pointer w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleConfirm} disabled={selectedShops.size === 0 || isLoading} className="cursor-pointer bg-red-600 hover:bg-red-700 w-full sm:w-auto">
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />}
            <span className="break-words">Continue ({selectedShops.size} {selectedShops.size === 1 ? 'shop' : 'shops'})</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
