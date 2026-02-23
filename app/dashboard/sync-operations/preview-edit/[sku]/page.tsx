"use client"

import { useEffect, useMemo, useCallback, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import { getCachedImages } from '@/lib/cache/product-images-cache'
import {
  UnsavedChangesDialog,
  CreateProductConfirmationDialog,
  ImageSelectionDialog,
  AddImagesFromSourceDialog,
  AddVariantsFromSourceDialog,
} from '@/components/sync-operations/dialogs'
import { ProductHeader } from '@/components/sync-operations/product-display/ProductHeader'
import { SourcePanel } from '@/components/sync-operations/product-display/SourcePanel'
import { TargetPanel } from '@/components/sync-operations/product-display/TargetPanel'
import { useProductNavigation } from '@/hooks/useProductNavigation'
import { useProductEditor } from '@/hooks/useProductEditor'
import { getVariantKey, sortBySortOrder } from '@/lib/utils'
import type { ProductImage } from '@/types/product'

export default function PreviewEditPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sku = decodeURIComponent((params.sku as string) || '')
  const { navigating, navigateBack } = useProductNavigation()

  const targetShopsParam = searchParams.get('targetShops') || ''
  const productIdParam = searchParams.get('productId')
  const selectedTargetShops = useMemo(() => targetShopsParam.split(',').filter(Boolean), [targetShopsParam])
  const [showAddImagesFromSource, setShowAddImagesFromSource] = useState(false)
  const [showAddVariantsFromSource, setShowAddVariantsFromSource] = useState(false)
  const [sourceImagesLoading, setSourceImagesLoading] = useState(false)
  const [targetImagesLoading, setTargetImagesLoading] = useState(false)

  // Use the shared product editor hook
  const editor = useProductEditor({
    mode: 'edit',
    sku,
    selectedTargetShops
  })

  const {
    details,
    loading,
    error,
    targetErrors,
    productImages,
    updating,
    updateSuccess,
    updateErrors,
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
    setDetails,
    setLoading,
    setError,
    setUpdating,
    setUpdateSuccess,
    setUpdateErrors,
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
    initializeTargetDataForEdit,
    handleSourceProductSelect,
    updateField,
    updateVariant,
    updateVariantTitle,
    removeVariant,
    restoreVariant,
    addVariantsFromSource,
    setDefaultVariant,
    restoreDefaultVariant,
    updateVisibility,
    resetVisibility,
    selectVariantImage,
    selectProductImage,
    addImagesToTarget,
    removeImageFromTarget,
    restoreImageToTarget,
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
    if (updateSuccess[activeTargetTld]) {
      navigateBack('edit')
    } else if (isDirty) {
      setShowCloseConfirmation(true)
    } else {
      navigateBack('edit')
    }
  }, [isDirty, updateSuccess, activeTargetTld, navigateBack, setShowCloseConfirmation])

  const handleUpdateClick = useCallback(() => {
    if (!sourceProduct || !details) return
    const data = targetData[activeTargetTld]
    if (!data) {
      alert('No data available for this shop')
      return
    }
    if (!data.dirty) {
      return
    }
    setShowCreateConfirmation(true)
  }, [sourceProduct, details, activeTargetTld, targetData, setShowCreateConfirmation])

  const handleConfirmUpdate = useCallback(async () => {
    if (!sourceProduct || !details) return

    const tld = activeTargetTld
    const data = targetData[tld]
    
    if (!data) {
      setShowCreateConfirmation(false)
      return
    }

    if (!data.dirty) {
      setShowCreateConfirmation(false)
      return
    }

    setShowCreateConfirmation(false)
    setUpdating(true)
    setUpdateErrors(prev => {
      const updated = { ...prev }
      delete updated[tld]
      return updated
    })
    setUpdateSuccess(prev => {
      const updated = { ...prev }
      delete updated[tld]
      return updated
    })

    try {
      const activeVariants = data.variants.filter(v => !v.deleted)
      const intendedImages = sortBySortOrder(
        data.images.filter(img => !data.removedImageSrcs.has(img.src ?? ''))
      )
      const updateProductData = {
        visibility: data.visibility,
        content_by_language: data.content_by_language,
        variants: activeVariants.map(v => ({
          variant_id: v.addedFromSource ? null : v.variant_id,
          sku: v.sku || '',
          is_default: v.is_default,
          sort_order: v.sort_order || 0,
          price_excl: v.price_excl,
          image: v.image,
          content_by_language: v.content_by_language
        })),
        images: intendedImages
      }

      console.log('[UI] Updating product in shop:', tld)
      console.log('[UI] Product data:', updateProductData)

      const shopId = details.shops?.[tld]?.id
      const targetShopLanguages = details.shops?.[tld]?.languages
      
      if (!shopId) {
        throw new Error(`Shop ID not found for ${tld}`)
      }

      if (!targetShopLanguages || targetShopLanguages.length === 0) {
        throw new Error(`Language configuration not found for ${tld}`)
      }

      const productId = data.targetProductId
      if (!productId) {
        throw new Error('Target product ID not found')
      }

      // Build currentState from product-details (avoids DB load on backend)
      const existingVariants = data.variants.filter(v => !v.addedFromSource)
      const currentState = {
        visibility: data.originalVisibility,
        content_by_language: data.originalContentByLanguage ?? data.content_by_language,
        variants: existingVariants.map(v => ({
          lightspeed_variant_id: v.variant_id,
          sku: v.originalSku ?? v.sku ?? '',
          is_default: v.originalIsDefault ?? v.is_default,
          sort_order: v.sort_order ?? 0,
          price_excl: v.originalPrice ?? v.price_excl,
          image: v.originalImage ?? null,
          content_by_language: v.originalTitle
            ? Object.fromEntries(
                Object.entries(v.originalTitle).map(([lang, t]) => [lang, { title: t }])
              )
            : v.content_by_language ?? {}
        }))
      }

      const changes = updateConfirmationContent?.changes ?? []

      const response = await fetch('/api/update-product', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetShopTld: tld,
          shopId,
          productId,
          updateProductData,
          currentState,
          targetShopLanguages,
          changes,
          productImageChanged: (data.productImage?.src ?? '') !== (data.originalProductImage?.src ?? ''),
          imageOrderChanged: data.imageOrderChanged ?? false,
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update product')
      }

      console.log('[UI] ✓ Product updated successfully:', result)

      setUpdateSuccess(prev => ({ ...prev, [tld]: true }))

      // Edit updates one shop at a time; navigate back when this update succeeds (like create does)
      setTimeout(() => navigateBack('edit'), 500)

    } catch (err) {
      console.error('[UI] Failed to update product:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setUpdateErrors(prev => ({ ...prev, [tld]: errorMessage }))
    } finally {
      setUpdating(false)
    }
  }, [activeTargetTld, targetData, sourceProduct, details, navigateBack, setShowCreateConfirmation, setUpdating, setUpdateErrors, setUpdateSuccess])

  // Update confirmation dialog content (changes that will be applied)
  const updateConfirmationContent = useMemo(() => {
    if (!details || !sourceProduct) return null
    const tld = activeTargetTld
    const data = targetData[tld]
    if (!data) return null

    const shopName = details.shops?.[tld]?.name ?? tld
    const activeVariants = data.variants.filter(v => !v.deleted)
    const skuVal = activeVariants[0]?.sku || sourceProduct.sku || sku

    const productTitle = (() => {
      const content = data.content_by_language
      if (!content) return undefined
      for (const lang of Object.keys(content)) {
        const title = content[lang]?.title?.trim()
        if (title) return title
      }
      return undefined
    })()

    const changes: string[] = []

    if (data.visibility !== data.originalVisibility) {
      changes.push(`Visibility: ${data.originalVisibility} → ${data.visibility}`)
    }

    if (data.dirtyFields.size > 0) {
      const fields = new Set<string>()
      Array.from(data.dirtyFields).forEach(f => {
        const parts = f.split('.')
        if (parts.length >= 2) fields.add(parts[1])
      })
      const fieldLabels: Record<string, string> = {
        title: 'Title',
        fulltitle: 'Full title',
        description: 'Description',
        content: 'Content',
      }
      const names = Array.from(fields).map(f => fieldLabels[f] || f).filter(Boolean)
      if (names.length > 0) {
        changes.push(`Product content: ${names.join(', ')}`)
      }
    }

    const deletedCount = data.variants.filter(v => v.deleted).length
    if (deletedCount > 0) {
      changes.push(`${deletedCount} variant${deletedCount !== 1 ? 's' : ''} removed`)
    }

    const addedCount = data.variants.filter(v => v.addedFromSource).length
    if (addedCount > 0) {
      changes.push(`${addedCount} variant${addedCount !== 1 ? 's' : ''} added from source`)
    }

    const updatedCount = data.variants.filter(
      v => !v.deleted && !v.addedFromSource && data.dirtyVariants.has(getVariantKey(v))
    ).length
    if (updatedCount > 0) {
      changes.push(`${updatedCount} variant${updatedCount !== 1 ? 's' : ''} updated`)
    }

    const productImageChanged = data.productImage?.src !== data.originalProductImage?.src
    if (productImageChanged) {
      changes.push('Product image')
    }

    const imagesAddedFromSource = data.images.filter(
      (img: { addedFromSource?: boolean; src?: string }) =>
        img.addedFromSource && !data.removedImageSrcs.has(img.src ?? '')
    ).length
    if (imagesAddedFromSource > 0) {
      changes.push(`${imagesAddedFromSource} image${imagesAddedFromSource !== 1 ? 's' : ''} added from source`)
    }

    const imagesRemovedCount = data.images.filter(
      (img: { addedFromSource?: boolean; src?: string }) =>
        data.removedImageSrcs.has(img.src ?? '') && !img.addedFromSource
    ).length
    if (imagesRemovedCount > 0) {
      changes.push(`${imagesRemovedCount} image${imagesRemovedCount !== 1 ? 's' : ''} removed`)
    }

    if (data.imageOrderChanged) {
      changes.push('Image order')
    }

    return {
      shopName,
      shopTld: tld,
      variantCount: activeVariants.length,
      imageCount: data.images.filter(img => !data.removedImageSrcs.has(img.src ?? '')).length,
      sku: skuVal,
      defaultSku: skuVal,
      productTitle: productTitle || undefined,
      changes: changes.length > 0 ? changes : ['No specific changes tracked'],
    }
  }, [details, sourceProduct, activeTargetTld, targetData, sku])

  // Initial data fetch
  useEffect(() => {
    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        
        const url = `/api/product-details?sku=${encodeURIComponent(sku)}${productIdParam ? `&productId=${productIdParam}` : ''}&mode=edit&targetShops=${selectedTargetShops.join(',')}`
        
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
          
          initializeTargetDataForEdit(data, initialSourceId, selectedTargetShops)
          
          const sortedTargets = [...selectedTargetShops].sort((a, b) => a.localeCompare(b))
          const firstTarget = sortedTargets.length > 0 ? sortedTargets[0] : null
          if (firstTarget) {
            setActiveTargetTld(firstTarget)
          }
          
          // Show both source and target panels immediately; images load in background
          setLoading(false)
          
          // Fire off image fetches in parallel (don't block)
          if (initialSourceProduct?.images_link) {
            setSourceImagesLoading(true)
            fetchProductImages(
              initialSourceProduct.product_id,
              initialSourceProduct.images_link,
              initialSourceProduct.shop_tld
            ).catch(err => console.error('Failed to fetch source images:', err))
              .finally(() => setSourceImagesLoading(false))
          }
          
          if (firstTarget) {
            const targetProduct = data.targets?.[firstTarget]?.[0]
            if (targetProduct?.images_link) {
              setTargetImagesLoading(true)
              fetchProductImages(
                targetProduct.product_id,
                targetProduct.images_link,
                firstTarget
              ).then((targetImages: ProductImage[]) => {
                setTargetData(prev => {
                  const updated = { ...prev }
                  if (updated[firstTarget]) {
                    const editable = targetImages.map((img, idx) => {
                      const order = img.sort_order ?? (img as { sortOrder?: number }).sortOrder ?? idx
                      return { ...img, id: String(img.id ?? idx), src: img.src ?? '', sort_order: order, originalSortOrder: order }
                    })
                    updated[firstTarget] = {
                      ...updated[firstTarget],
                      images: editable,
                      originalImageOrder: editable.map((_, idx) => idx),
                    }
                  }
                  return updated
                })
              }).catch(err => console.error(`Failed to fetch ${firstTarget} images:`, err))
                .finally(() => setTargetImagesLoading(false))
            }
          }
        } else {
          setLoading(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product details')
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
  }, [cleanup])

  // Fetch target images when switching tabs (on-demand)
  useEffect(() => {
    if (!details || !activeTargetTld) return
    
    const targetData_current = targetData[activeTargetTld]
    if (!targetData_current) return
    
    if (targetData_current.images.length > 0) return
    
    if (!targetData_current.targetImagesLink) return
    
    const targetProductId = targetData_current.targetProductId
    if (!targetProductId) return
    
    const cached = getCachedImages(targetProductId, activeTargetTld)
    if (cached) {
      setTargetImagesLoading(false)
      setTargetData(prev => {
        const updated = { ...prev }
        if (updated[activeTargetTld]) {
          const editable = cached.map((img, idx) => {
            const order = Number(img.sortOrder ?? idx)
            return {
              id: String(img.id ?? `img-${idx}`),
              src: img.src ?? '',
              thumb: img.thumb,
              title: img.title,
              sort_order: order,
              originalSortOrder: order,
            }
          })
          updated[activeTargetTld] = {
            ...updated[activeTargetTld],
            images: editable,
            originalImageOrder: editable.map((_, idx) => idx),
          }
        }
        return updated
      })
      return
    }
    
    setTargetImagesLoading(true)
    fetchProductImages(
      targetProductId,
      targetData_current.targetImagesLink,
      activeTargetTld
    ).then((targetImages: ProductImage[]) => {
      setTargetData(prev => {
        const updated = { ...prev }
        if (updated[activeTargetTld]) {
          const editable = targetImages.map((img, idx) => {
            const order = img.sort_order ?? (img as { sortOrder?: number }).sortOrder ?? idx
            return {
              ...img,
              id: String(img.id ?? idx),
              src: img.src ?? '',
              sort_order: order,
              originalSortOrder: order,
            }
          })
          updated[activeTargetTld] = {
            ...updated[activeTargetTld],
            images: editable,
            originalImageOrder: editable.map((_, idx) => idx),
          }
        }
        return updated
      })
    }).catch(err => console.error(`Failed to fetch ${activeTargetTld} images:`, err))
      .finally(() => setTargetImagesLoading(false))
  }, [activeTargetTld, details, targetData, fetchProductImages, setTargetData])

  // Render methods - memoize callbacks for better performance
  const handleLanguageChange = useCallback((tld: string) => (lang: string) => {
    setActiveLanguages(prev => ({ ...prev, [tld]: lang }))
  }, [setActiveLanguages])

  const handleSelectVariantImage = useCallback((tld: string) => (idx: number) => {
    setSelectingImageForVariant(idx)
    setSelectingProductImage(false)
    setShowImageDialog(true)
  }, [setSelectingImageForVariant, setSelectingProductImage, setShowImageDialog])

  const handleSelectProductImage = useCallback((tld: string) => () => {
    const imgs = (targetData[tld]?.images ?? []).filter(
      (img: { src?: string }) => !targetData[tld]?.removedImageSrcs?.has(img.src ?? '')
    )
    if (imgs.length <= 1) return
    setSelectingProductImage(true)
    setSelectingImageForVariant(null)
    setShowImageDialog(true)
  }, [targetData, setSelectingProductImage, setSelectingImageForVariant, setShowImageDialog])

  const renderTargetPanel = useCallback((tld: string) => (
    <TargetPanel
      mode="edit"
      sourceProduct={sourceProduct}
      shopTld={tld}
      shopName={details?.shops?.[tld]?.name ?? details?.targets?.[tld]?.[0]?.shop_name ?? tld}
      baseUrl={details?.shops?.[tld]?.base_url ?? details?.targets?.[tld]?.[0]?.base_url ?? ''}
      languages={details?.shops?.[tld]?.languages ?? []}
      data={targetData[tld]}
      activeLanguage={activeLanguages[tld] || ''}
      imagesLink={sourceProduct?.images_link}
      sourceProductId={sourceProduct?.product_id ?? 0}
      sourceShopTld={sourceProduct?.shop_tld ?? ''}
      sourceDefaultLang={details?.shops[sourceProduct?.shop_tld ?? '']?.languages?.find((l: { is_default?: boolean }) => l.is_default)?.code ?? details?.shops[sourceProduct?.shop_tld ?? '']?.languages?.[0]?.code}
      resettingField={resettingField}
      retranslatingField={retranslatingField}
      error={targetErrors[tld]}
      sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
      targetImagesLoading={tld === activeTargetTld ? targetImagesLoading : false}
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
      onAddImagesFromSource={() => setShowAddImagesFromSource(true)}
      onRemoveImageFromSource={(imageId) => removeImageFromTarget(tld, imageId)}
      onRestoreImageFromSource={(imageId) => restoreImageToTarget(tld, imageId)}
      onAddVariantsFromSource={() => setShowAddVariantsFromSource(true)}
    />
  ), [
    details,
    targetData,
    activeLanguages,
    activeTargetTld,
    sourceProduct,
    targetErrors,
    productImages,
    targetImagesLoading,
    resettingField,
    retranslatingField,
    handleLanguageChange,
    handleSelectVariantImage,
    handleSelectProductImage,
    updateField,
    resetField,
    resetLanguage,
    retranslateField,
    retranslateLanguage,
    setContentFocused,
    resetShop,
    updateVariant,
    updateVariantTitle,
    removeVariant,
    restoreVariant,
    setDefaultVariant,
    restoreDefaultVariant,
    resetVariant,
    resetVariantImage,
    resetAllVariants,
    updateVisibility,
    resetVisibility,
    addImagesToTarget,
    removeImageFromTarget,
    restoreImageToTarget,
    resetProductImage,
    addVariantsFromSource,
  ])

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
            identifier={{ label: 'Preview Edit - SKU', value: sku }}
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
        onDiscard={() => navigateBack('edit')}
      />

      <CreateProductConfirmationDialog
        open={showCreateConfirmation}
        onOpenChange={setShowCreateConfirmation}
        content={updateConfirmationContent}
        onConfirm={handleConfirmUpdate}
        mode="edit"
      />

      {hasMultipleTargets ? (
        <Tabs value={activeTargetTld} onValueChange={setActiveTargetTld} className="w-full min-w-0">
          <div className="w-full p-4 sm:p-6">
            <ProductHeader
              onBack={handleBack}
              identifier={{ label: 'Preview Edit - SKU', value: sku }}
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
                sourceImagesLoading={sourceImagesLoading}
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
          <ProductHeader onBack={handleBack} identifier={{ label: 'Preview Edit - SKU', value: sku }} />
          <div className="grid gap-4 sm:gap-6 min-w-0 grid-cols-1 lg:grid-cols-2">
            <SourcePanel
              product={sourceProduct}
              languages={details.shops[sourceProduct.shop_tld]?.languages ?? []}
              hasDuplicates={hasSourceDuplicates}
              allProducts={details.source}
              selectedProductId={selectedSourceProductId}
              onProductSelect={handleSourceProductSelect}
              sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
              sourceImagesLoading={sourceImagesLoading}
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
        showNoImageOption={false}
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

      <AddImagesFromSourceDialog
        open={showAddImagesFromSource}
        onOpenChange={setShowAddImagesFromSource}
        sourceImages={(productImages[sourceProduct?.product_id ?? 0] ?? []).map(img => ({
          id: img.id,
          src: img.src,
          thumb: img.thumb,
          title: img.title,
          sort_order: img.sort_order
        }))}
        targetImageTitles={new Set(
          (targetData[activeTargetTld]?.images ?? [])
            .filter(img => !targetData[activeTargetTld]?.removedImageSrcs?.has(img.src ?? ''))
            .map(img => img.title ?? '')
            .filter(t => t !== '')
        )}
        deletedImageTitles={new Set(
          (targetData[activeTargetTld]?.images ?? [])
            .filter(img => targetData[activeTargetTld]?.removedImageSrcs?.has(img.src ?? ''))
            .map(img => img.title ?? '')
            .filter(t => t !== '')
        )}
        onConfirm={(imgs) => {
          const toAdd: ProductImage[] = imgs.map(img => ({
            id: String(img.id),
            src: img.src ?? '',
            thumb: img.thumb,
            title: img.title,
            sort_order: img.sort_order ?? 0
          }))
          addImagesToTarget(activeTargetTld, toAdd)
          setShowAddImagesFromSource(false)
        }}
      />

      <AddVariantsFromSourceDialog
        open={showAddVariantsFromSource}
        onOpenChange={setShowAddVariantsFromSource}
        sourceVariants={sourceProduct?.variants ?? []}
        targetVariantSkus={new Set(
          (targetData[activeTargetTld]?.variants ?? [])
            .map(v => (v.sku || '').toLowerCase().trim())
            .filter(Boolean)
        )}
        sourceDefaultLang={details?.shops?.[sourceProduct?.shop_tld ?? '']?.languages?.find((l: { is_default?: boolean }) => l.is_default)?.code ?? details?.shops?.[sourceProduct?.shop_tld ?? '']?.languages?.[0]?.code ?? ''}
        onConfirm={(variants) => {
          addVariantsFromSource(activeTargetTld, variants)
          setShowAddVariantsFromSource(false)
        }}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg z-50">
        <div className="w-full flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 text-sm">
            {updating && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Updating product...</span>
              </div>
            )}
            {!updating && updateSuccess[activeTargetTld] && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>Product updated successfully</span>
              </div>
            )}
            {!updating && updateErrors[activeTargetTld] && (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span>Update failed</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={updating}
              className="min-h-[44px] sm:min-h-0 touch-manipulation cursor-pointer"
            >
              {updateSuccess[activeTargetTld] ? 'Done' : 'Cancel'}
            </Button>
            <Button
              onClick={handleUpdateClick}
              disabled={updating || updateSuccess[activeTargetTld] || !targetData[activeTargetTld]?.dirty}
              className="bg-red-600 hover:bg-red-700 min-h-[44px] sm:min-h-0 touch-manipulation cursor-pointer disabled:opacity-50"
            >
              {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {updateSuccess[activeTargetTld] ? '✓ Updated' : 'Update Product'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
