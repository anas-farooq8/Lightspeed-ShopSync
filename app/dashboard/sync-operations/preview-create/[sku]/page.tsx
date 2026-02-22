"use client"

import { useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import {
  UnsavedChangesDialog,
  CreateProductConfirmationDialog,
  ImageSelectionDialog,
} from '@/components/sync-operations/dialogs'
import { ProductHeader } from '@/components/sync-operations/product-display/ProductHeader'
import { SourcePanel } from '@/components/sync-operations/product-display/SourcePanel'
import { TargetPanel } from '@/components/sync-operations/product-display/TargetPanel'
import { useProductNavigation } from '@/hooks/useProductNavigation'
import { useProductEditor, patchImagesIntoTargetData } from '@/hooks/useProductEditor'
import { sortImagesForDisplay } from '@/lib/utils'
import type { ProductImage } from '@/types/product'

export default function PreviewCreatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sku = decodeURIComponent((params.sku as string) || '')
  const { navigating, navigateBack } = useProductNavigation()

  const targetShopsParam = searchParams.get('targetShops') || ''
  const productIdParam = searchParams.get('productId')
  const selectedTargetShops = useMemo(() => targetShopsParam.split(',').filter(Boolean), [targetShopsParam])
  
  // Track initialization to prevent infinite loops
  const initializedRef = useRef(false)
  const initializationKeyRef = useRef<string>('')

  // Use the shared product editor hook
  const editor = useProductEditor({
    mode: 'create',
    sku,
    selectedTargetShops
  })

  const {
    details,
    loading,
    error,
    targetErrors,
    productImages,
    translating,
    creating,
    createSuccess,
    createErrors,
    selectedSourceProductId,
    activeTargetTld,
    targetData,
    activeLanguages,
    isDirty,
    showCloseConfirmation,
    resettingField,
    retranslatingField,
    sourceSwitching,
    showImageDialog,
    selectingImageForVariant,
    selectingProductImage,
    showCreateConfirmation,
    sortedTargetShops,
    sourceProduct,
    hasSourceDuplicates,
    hasMultipleTargets,
    dialogImages,
    dialogSelectedImage,
    removeImageFromTarget,
    restoreImageToTarget,
    setDetails,
    setLoading,
    setError,
    setCreating,
    setCreateSuccess,
    setCreateErrors,
    setSelectedSourceProductId,
    setActiveTargetTld,
    setTargetData,
    setActiveLanguages,
    setShowCloseConfirmation,
    setShowImageDialog,
    setSelectingImageForVariant,
    setSelectingProductImage,
    setShowCreateConfirmation,
    fetchProductImages,
    initializeTargetData,
    handleSourceProductSelect,
    updateField,
    updateVariant,
    updateVariantTitle,
    removeVariant,
    restoreVariant,
    setDefaultVariant,
    restoreDefaultVariant,
    updateVisibility,
    resetVisibility,
    selectVariantImage,
    selectProductImage,
    resetProductImage,
    resetField,
    resetLanguage,
    resetVariant,
    resetVariantImage,
    resetAllVariants,
    resetShop,
    retranslateField,
    retranslateLanguage,
    setContentFocused,
    cleanup,
  } = editor

  // Event handlers
  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirmation(true)
    } else {
      navigateBack()
    }
  }, [isDirty, navigateBack, setShowCloseConfirmation])

  const handleCreateClick = useCallback(() => {
    if (!sourceProduct || !details) return
    const missing = sortedTargetShops.filter(tld => !targetData[tld])
    if (missing.length > 0) {
      alert(`No data available for shop(s): ${missing.join(', ')}`)
      return
    }
    setShowCreateConfirmation(true)
  }, [sourceProduct, details, sortedTargetShops, targetData])

  const handleConfirmCreate = useCallback(async () => {
    if (!sourceProduct || !details) return

    const shopsToCreate = sortedTargetShops.filter(tld => targetData[tld])
    if (shopsToCreate.length === 0) {
      setShowCreateConfirmation(false)
      return
    }

    setShowCreateConfirmation(false)
    setCreating(true)
    setCreateErrors({})
    setCreateSuccess({})

    const newSuccess: Record<string, boolean> = {}
    const newErrors: Record<string, string> = {}

    const createPromises = shopsToCreate.map(async (tld) => {
      const data = targetData[tld]
      if (!data) return { tld, success: false }

      const shopId = details.shops?.[tld]?.id
      const targetShopLanguages = details.shops?.[tld]?.languages

      if (!shopId) {
        throw new Error(`Shop ID not found for ${tld}`)
      }
      if (!targetShopLanguages || targetShopLanguages.length === 0) {
        throw new Error(`Language configuration not found for ${tld}`)
      }

      const activeVariants = data.variants.filter(v => !v.deleted)
      const sourceProductData = {
        visibility: data.visibility,
        content_by_language: data.content_by_language,
        variants: activeVariants.map(v => ({
          sku: v.sku || '',
          is_default: v.is_default,
          sort_order: v.sort_order || 0,
          price_excl: v.price_excl,
          image: v.image,
          content_by_language: v.content_by_language
        })),
        images: (() => {
          const filtered = data.images.filter(img => !data.removedImageSrcs.has(img.src ?? ''))
          const productOrSrc = sourceProduct?.product_image ? { product_image: sourceProduct.product_image } : sourceProduct?.product_image?.src ?? null
          return sortImagesForDisplay(filtered, productOrSrc)
        })()
      }

      const sourceShopId = sourceProduct?.shop_tld ? details?.shops?.[sourceProduct.shop_tld]?.id : undefined
      const sourceLightspeedProductId = sourceProduct?.product_id ?? undefined

      const response = await fetch('/api/create-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetShopTld: tld,
          shopId,
          sourceProductData,
          targetShopLanguages,
          sourceShopId: sourceShopId ?? undefined,
          sourceLightspeedProductId: sourceLightspeedProductId ?? undefined,
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create product')
      }

      return { tld, success: true }
    })

    const results = await Promise.allSettled(createPromises)

    results.forEach((result, i) => {
      const tld = shopsToCreate[i]
      if (result.status === 'fulfilled') {
        if (result.value.success) newSuccess[tld] = true
      } else {
        newErrors[tld] = result.reason instanceof Error ? result.reason.message : 'Unknown error occurred'
      }
    })

    setCreateSuccess(prev => ({ ...prev, ...newSuccess }))
    setCreateErrors(prev => ({ ...prev, ...newErrors }))
    setCreating(false)

    const allShopsCreated = shopsToCreate.every(tld => newSuccess[tld])
    if (allShopsCreated) {
      setTimeout(() => navigateBack(), 500)
    }
  }, [targetData, sourceProduct, details, sortedTargetShops, navigateBack, setCreating, setCreateErrors, setCreateSuccess])

  // Create confirmation dialog content (counts match what will be created) - all target shops
  const createConfirmationContent = useMemo(() => {
    if (!details || !sourceProduct) return null
    const items: Array<{ shopName: string; shopTld: string; variantCount: number; imageCount: number; sku: string; productTitle?: string; defaultSku?: string }> = []

    for (const tld of sortedTargetShops) {
      const data = targetData[tld]
      if (!data) continue

      const shopName = details.shops?.[tld]?.name ?? tld
      const activeVariants = data.variants.filter(v => !v.deleted)
      const variantCount = activeVariants.length
      const imageCount = data.images.filter(img => !data.removedImageSrcs.has(img.src ?? '')).length
      const defaultSku = activeVariants[0]?.sku || sourceProduct.sku || sku

      // Product title from first available language
      const productTitle = (() => {
        const content = data.content_by_language
        if (!content) return undefined
        const langs = Object.keys(content)
        for (const lang of langs) {
          const title = content[lang]?.title?.trim()
          if (title) return title
        }
        return undefined
      })()

      items.push({
        shopName,
        shopTld: tld,
        variantCount,
        imageCount,
        sku: defaultSku,
        productTitle: productTitle || undefined,
        defaultSku
      })
    }

    return items.length === 0 ? null : items.length === 1 ? items[0] : items
  }, [details, sourceProduct, sortedTargetShops, targetData, sku])

  // Initial data fetch
  useEffect(() => {
    // Create a unique key for this initialization
    const initKey = `${sku}-${productIdParam || 'none'}-${selectedTargetShops.join(',')}`
    
    // Reset initialization if key changed
    if (initializationKeyRef.current !== initKey) {
      initializedRef.current = false
      initializationKeyRef.current = initKey
    }
    
    // Skip if already initialized for this key
    if (initializedRef.current) {
      return
    }

    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        
        const url = `/api/product-details?sku=${encodeURIComponent(sku)}${productIdParam ? `&productId=${productIdParam}` : ''}`
        
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch product details')
        }
        
        const data = await response.json()
        setDetails(data)
        
        if (data.source.length > 0) {
          const initialSourceId = productIdParam ? parseInt(productIdParam) : data.source[0].product_id
          setSelectedSourceProductId(initialSourceId)
          
          const initialSourceProduct = data.source.find((p: any) => p.product_id === initialSourceId)

          if (initialSourceProduct?.images_link) {
            const [sourceImages] = await Promise.all([
              fetchProductImages(
                initialSourceProduct.product_id,
                initialSourceProduct.images_link,
                initialSourceProduct.shop_tld
              ),
              initializeTargetData(data, initialSourceId, selectedTargetShops, []),
            ])
            patchImagesIntoTargetData(setTargetData, selectedTargetShops, sourceImages, initialSourceProduct)
          } else {
            await initializeTargetData(data, initialSourceId, selectedTargetShops, [])
          }
        }
        
        const sortedTargets = [...selectedTargetShops].sort((a, b) => a.localeCompare(b))
        if (sortedTargets.length > 0) {
          setActiveTargetTld(sortedTargets[0])
        }
        
        // Mark as initialized
        initializedRef.current = true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product details')
      } finally {
        setLoading(false)
      }
    }

    if (selectedTargetShops.length === 0) {
      setError('No target shops selected')
      setLoading(false)
      return
    }

    fetchProductDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, productIdParam, targetShopsParam])

  useEffect(() => {
    return cleanup
  }, [])

  // Render methods - memoize callbacks for better performance
  const handleLanguageChange = useCallback((tld: string) => (lang: string) => {
    setActiveLanguages(prev => ({ ...prev, [tld]: lang }))
  }, [])

  const handleSelectVariantImage = useCallback((tld: string) => (idx: number) => {
    setSelectingImageForVariant(idx)
    setSelectingProductImage(false)
    setShowImageDialog(true)
  }, [])

  const handleSelectProductImage = useCallback((tld: string) => () => {
    const imgs = targetData[tld]?.images ?? []
    if (imgs.length <= 1) return
    setSelectingProductImage(true)
    setSelectingImageForVariant(null)
    setShowImageDialog(true)
  }, [targetData])

  const renderTargetPanel = useCallback((tld: string) => (
    <TargetPanel
      mode="create"
      sourceProduct={sourceProduct}
      shopTld={tld}
      shopName={details?.shops?.[tld]?.name ?? details?.targets[tld]?.[0]?.shop_name ?? tld}
      baseUrl={details?.shops?.[tld]?.base_url ?? details?.targets[tld]?.[0]?.base_url ?? ''}
      languages={details?.shops[tld]?.languages ?? []}
      data={targetData[tld]}
      activeLanguage={activeLanguages[tld] || ''}
      imagesLink={sourceProduct?.images_link}
      sourceProductId={sourceProduct?.product_id ?? 0}
      sourceShopTld={sourceProduct?.shop_tld ?? ''}
      sourceDefaultLang={details?.shops[sourceProduct?.shop_tld ?? '']?.languages?.find((l: { is_default?: boolean }) => l.is_default)?.code ?? details?.shops[sourceProduct?.shop_tld ?? '']?.languages?.[0]?.code}
      resettingField={resettingField}
      retranslatingField={retranslatingField}
      translating={translating}
      error={targetErrors[tld]}
      sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
      onLanguageChange={handleLanguageChange(tld)}
      onUpdateField={(lang, field, value) => updateField(tld, lang, field, value)}
      onResetField={(lang, field) => resetField(tld, lang, field)}
      onResetLanguage={(lang) => resetLanguage(tld, lang)}
      onRetranslateField={(lang, field) => retranslateField(tld, lang, field)}
      onRetranslateLanguage={(lang) => retranslateLanguage(tld, lang)}
      onContentFocus={(lang) => setContentFocused(tld, lang)}
      onResetShop={() => resetShop(tld)}
      onUpdateVariant={(idx, field, val) => updateVariant(tld, idx, field, val)}
      onUpdateVariantTitle={(idx, lang, title) => updateVariantTitle(tld, idx, lang, title)}
      onRemoveVariant={(idx) => removeVariant(tld, idx)}
      onRestoreVariant={(idx) => restoreVariant(tld, idx)}
      onResetVariant={(idx) => resetVariant(tld, idx)}
      onResetVariantImage={(idx) => resetVariantImage(tld, idx)}
      onResetAllVariants={() => resetAllVariants(tld)}
      onSelectVariantImage={handleSelectVariantImage(tld)}
      onSelectProductImage={handleSelectProductImage(tld)}
      onUpdateVisibility={(visibility) => updateVisibility(tld, visibility)}
      onResetVisibility={() => resetVisibility(tld)}
      onResetProductImage={() => resetProductImage(tld)}
      onSetDefaultVariant={(idx) => setDefaultVariant(tld, idx)}
      onRestoreDefaultVariant={() => restoreDefaultVariant(tld)}
      onRemoveImageFromSource={(imgSrc) => removeImageFromTarget(tld, imgSrc)}
      onRestoreImageFromSource={(imgSrc) => restoreImageToTarget(tld, imgSrc)}
    />
  ), [details, targetData, activeLanguages, sourceProduct, targetErrors, productImages, resettingField, retranslatingField, translating, handleLanguageChange, handleSelectVariantImage, handleSelectProductImage, updateField, resetField, resetLanguage, retranslateField, retranslateLanguage, setContentFocused, resetShop, updateVariant, updateVariantTitle, removeVariant, restoreVariant, setDefaultVariant, restoreDefaultVariant, resetVariant, resetVariantImage, resetAllVariants, updateVisibility, resetVisibility, resetProductImage, removeImageFromTarget, restoreImageToTarget])

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <LoadingShimmer show={true} position="top" />
        <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !details || !sourceProduct) {
    return (
      <div className="w-full h-full p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <ProductHeader
            onBack={handleBack}
            identifier={{ label: 'Preview Create - SKU', value: sku }}
          />
          <div className="border border-destructive/50 rounded-lg p-8 sm:p-12 text-destructive text-sm sm:text-base text-center">
            {error || 'Product not found'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-w-0 pb-20">
      <LoadingShimmer show={navigating} position="top" />
      
      <UnsavedChangesDialog
        open={showCloseConfirmation}
        onOpenChange={setShowCloseConfirmation}
        onDiscard={navigateBack}
      />

      <CreateProductConfirmationDialog
        open={showCreateConfirmation}
        onOpenChange={setShowCreateConfirmation}
        content={createConfirmationContent}
        onConfirm={handleConfirmCreate}
      />

      {hasMultipleTargets ? (
        <Tabs value={activeTargetTld} onValueChange={setActiveTargetTld} className="w-full min-w-0">
          <div className="w-full p-4 sm:p-6">
            <ProductHeader
              onBack={handleBack}
              identifier={{ label: 'Preview Create - SKU', value: sku }}
              targetTabs={{ tlds: sortedTargetShops, activeTab: activeTargetTld }}
            />
            <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
              <SourcePanel
                product={sourceProduct}
                languages={details.shops[sourceProduct.shop_tld]?.languages ?? []}
                hasDuplicates={hasSourceDuplicates}
                allProducts={details.source}
                selectedProductId={selectedSourceProductId}
                onProductSelect={handleSourceProductSelect}
                sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
                sourceSwitching={sourceSwitching}
              />
              {sortedTargetShops.map(tld => (
                <TabsContent key={tld} value={tld} className="mt-0">
                  {renderTargetPanel(tld)}
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      ) : (
        <div className="w-full p-4 sm:p-6">
          <ProductHeader onBack={handleBack} identifier={{ label: 'Preview Create - SKU', value: sku }} />
          <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
            <SourcePanel
              product={sourceProduct}
              languages={details.shops[sourceProduct.shop_tld]?.languages ?? []}
              hasDuplicates={hasSourceDuplicates}
              allProducts={details.source}
              selectedProductId={selectedSourceProductId}
              onProductSelect={handleSourceProductSelect}
              sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
              sourceSwitching={sourceSwitching}
            />
            {renderTargetPanel(sortedTargetShops[0])}
          </div>
        </div>
      )}

      <ImageSelectionDialog
        open={showImageDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowImageDialog(false)
            setSelectingImageForVariant(null)
            setSelectingProductImage(false)
          }
        }}
        title={selectingProductImage ? 'Select Product Image' : 'Select Variant Image'}
        images={dialogImages}
        showNoImageOption={true}
        selectedImage={dialogSelectedImage}
        onSelectImage={(img) => {
          const productImg = img as ProductImage | null
          if (selectingProductImage) {
            selectProductImage(activeTargetTld, productImg)
          } else if (selectingImageForVariant !== null) {
            selectVariantImage(activeTargetTld, selectingImageForVariant, productImg)
          }
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg z-50">
        <div className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          {/* Status indicators */}
          <div className="flex items-center gap-2 text-sm">
            {creating && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating product...</span>
              </div>
            )}
            {!creating && (() => {
              const successCount = sortedTargetShops.filter(tld => createSuccess[tld]).length
              const errorCount = sortedTargetShops.filter(tld => createErrors[tld]).length
              const allDone = successCount + errorCount === sortedTargetShops.length
              if (!allDone) return null
              return (
                <div className="flex flex-wrap items-center gap-2">
                  {successCount > 0 && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        {successCount === sortedTargetShops.length
                          ? sortedTargetShops.length > 1
                            ? `Product created in all ${sortedTargetShops.length} shops`
                            : 'Product created successfully'
                          : `Created in ${successCount} of ${sortedTargetShops.length} shop${sortedTargetShops.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="flex items-center gap-2 text-destructive">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>
                        {errorCount === sortedTargetShops.length ? 'Creation failed' : `${errorCount} shop${errorCount > 1 ? 's' : ''} failed`}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {(() => {
              const allCreated = sortedTargetShops.every(tld => createSuccess[tld])
              return (
                <>
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={creating}
                    className="min-h-[44px] sm:min-h-0 touch-manipulation cursor-pointer"
                  >
                    {allCreated ? 'Done' : 'Cancel'}
                  </Button>
                  <Button
                    onClick={handleCreateClick}
                    disabled={creating || allCreated}
                    className="bg-red-600 hover:bg-red-700 min-h-[44px] sm:min-h-0 touch-manipulation cursor-pointer disabled:opacity-50"
                  >
                    {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {allCreated ? '✓ Created' : 'Create Product'}
                  </Button>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

