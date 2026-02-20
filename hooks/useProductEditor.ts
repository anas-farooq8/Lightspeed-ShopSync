/**
 * useProductEditor Hook
 * 
 * Shared business logic for preview-create and preview-edit pages.
 * Handles state management, translation, field updates, image handling, 
 * variant management, and reset/retranslate functionality.
 * 
 * @param mode - 'create' or 'edit' determines behavior differences
 */

import { useState, useRef, useMemo, useCallback } from 'react'
import {
  clearProductImagesCache,
  getCachedImages,
  fetchAndCacheImages,
} from '@/lib/cache/product-images-cache'
import {
  prepareTranslationBatch,
  applyTranslationResults,
  callTranslationAPI,
  deduplicateTranslationItems,
  reconstructResults,
  getBaseValueForField,
  getBaseValuesForLanguage,
  storeTranslationInMemo,
  storeTranslationsInMemo,
  isSameImageInfo,
  getVariantKey,
} from '@/lib/utils'
import type {
  ProductDetails,
  ProductData,
  ProductImage,
  ImageInfo,
  EditableVariant,
  EditableTargetData,
  ProductContent,
  TranslatableField,
  TranslationOrigin,
  TranslationMetaByLang,
} from '@/types/product'

// ─── Module-level pure helpers ──────────────────────────────────────────────

function cloneTargetData(data: Record<string, EditableTargetData>): Record<string, EditableTargetData> {
  const result: Record<string, EditableTargetData> = {}
  for (const [tld, td] of Object.entries(data)) {
    result[tld] = {
      content_by_language: JSON.parse(JSON.stringify(td.content_by_language)),
      variants: td.variants.map(v => ({ ...v, content_by_language: { ...v.content_by_language } })),
      images: td.images.map(img => ({ ...img })),
      originalImageOrder: [...td.originalImageOrder],
      removedImageIds: new Set(td.removedImageIds),
      dirty: td.dirty,
      dirtyFields: new Set(td.dirtyFields),
      dirtyVariants: new Set(td.dirtyVariants),
      originalVariantOrder: [...td.originalVariantOrder],
      visibility: td.visibility,
      originalVisibility: td.originalVisibility,
      productImage: td.productImage ? { ...td.productImage } : null,
      originalProductImage: td.originalProductImage ? { ...td.originalProductImage } : null,
      orderChanged: td.orderChanged,
      imageOrderChanged: td.imageOrderChanged,
      translationMeta: td.translationMeta ? JSON.parse(JSON.stringify(td.translationMeta)) : undefined,
      sourceProduct: td.sourceProduct,
      targetProductId: td.targetProductId,
      targetImagesLink: td.targetImagesLink,
      targetMatchedByDefaultVariant: td.targetMatchedByDefaultVariant,
    }
  }
  return result
}

function patchImagesIntoTargetData(
  setTargetData: (updater: (prev: Record<string, EditableTargetData>) => Record<string, EditableTargetData>) => void,
  shopTlds: string[],
  images: ProductImage[],
  srcProduct: ProductData
): void {
  if (!images.length) return
  setTargetData(prev => {
    const updated = { ...prev }
    shopTlds.forEach(tld => {
      if (!updated[tld]) return
      const firstImage = images[0]
      const fallbackProductImage: ImageInfo | null = srcProduct.product_image
        ? null
        : firstImage
          ? { src: firstImage.src, thumb: firstImage.thumb, title: firstImage.title }
          : null
      updated[tld] = {
        ...updated[tld],
        images: [...images],
        originalImageOrder: images.map((_, idx) => idx),
        productImage: updated[tld].productImage ?? fallbackProductImage,
        originalProductImage: updated[tld].originalProductImage ?? fallbackProductImage,
      }
    })
    return updated
  })
}

// ─── Main Hook ──────────────────────────────────────────────────────────────

interface UseProductEditorOptions {
  mode: 'create' | 'edit'
  sku: string
  selectedTargetShops: string[]
}

export function useProductEditor({ mode, sku, selectedTargetShops }: UseProductEditorOptions) {
  // ─── Core State ───────────────────────────────────────────────────────────
  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targetErrors, setTargetErrors] = useState<Record<string, string>>({})
  const [productImages, setProductImages] = useState<Record<number, ProductImage[]>>({})
  
  // Mode-specific states
  const [translating, setTranslating] = useState(mode === 'create')
  const [creating, setCreating] = useState(false)
  const [createSuccess, setCreateSuccess] = useState<Record<string, boolean>>({})
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [updating, setUpdating] = useState(false)
  const [updateSuccess, setUpdateSuccess] = useState<Record<string, boolean>>({})
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({})

  const translationMemoRef = useRef(new Map<string, string>())

  // ─── Editor State ─────────────────────────────────────────────────────────
  const [selectedSourceProductId, setSelectedSourceProductId] = useState<number | null>(null)
  const [activeTargetTld, setActiveTargetTld] = useState<string>('')
  const [targetData, setTargetData] = useState<Record<string, EditableTargetData>>({})
  const [activeLanguages, setActiveLanguages] = useState<Record<string, string>>({})

  const targetDataRef = useRef(targetData)
  targetDataRef.current = targetData
  const activeLanguagesRef = useRef(activeLanguages)
  activeLanguagesRef.current = activeLanguages

  const [isDirty, setIsDirty] = useState(false)
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false)
  const [resettingField, setResettingField] = useState<string | null>(null)
  const [retranslatingField, setRetranslatingField] = useState<string | null>(null)

  const initialContentRef = useRef<Record<string, Record<string, string>>>({})
  const contentEditorReadyRef = useRef<Record<string, Record<string, boolean>>>({})
  const originalTranslatedContentRef = useRef<Record<string, Record<string, Record<string, string>>>>({})
  const originalTranslationMetaRef = useRef<Record<string, Record<string, Record<string, TranslationOrigin>>>>({})

  const [sourceSwitching, setSourceSwitching] = useState(false)

  const perSourceCacheRef = useRef(
    new Map<number, {
      targetData: Record<string, EditableTargetData>
      originalTranslatedContent: Record<string, Record<string, Record<string, string>>>
      originalTranslationMeta: Record<string, Record<string, Record<string, TranslationOrigin>>>
      initialContent: Record<string, Record<string, string>>
      contentEditorReady: Record<string, Record<string, boolean>>
      activeLanguages: Record<string, string>
    }>()
  )

  // ─── Image Dialog State ───────────────────────────────────────────────────
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [selectingImageForVariant, setSelectingImageForVariant] = useState<number | null>(null)
  const [selectingProductImage, setSelectingProductImage] = useState(false)
  const [showCreateConfirmation, setShowCreateConfirmation] = useState(false)

  // ─── Computed Values ──────────────────────────────────────────────────────
  const sortedTargetShops = useMemo(
    () => [...selectedTargetShops].sort((a, b) => a.localeCompare(b)),
    [selectedTargetShops]
  )

  const sourceProduct = useMemo(
    () => details?.source.find(p => p.product_id === selectedSourceProductId) || details?.source[0],
    [details, selectedSourceProductId]
  )

  const hasSourceDuplicates = useMemo(
    () => (details?.source.length || 0) > 1,
    [details]
  )

  const hasMultipleTargets = sortedTargetShops.length > 1

  const dialogImages = useMemo(() => {
    if (!showImageDialog || !sourceProduct) return []
    const raw =
      targetData[activeTargetTld]?.images ??
      productImages[sourceProduct?.product_id ?? 0] ??
      []
    return [...raw].sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999))
  }, [showImageDialog, sourceProduct, activeTargetTld, targetData, productImages])

  // ─── Image Fetching ───────────────────────────────────────────────────────
  const fetchProductImages = useCallback(async (
    productId: number,
    imagesLink: string,
    shopTld: string
  ): Promise<ProductImage[]> => {
    const moduleCached = getCachedImages(productId, shopTld)
    if (moduleCached) {
      const imgs: ProductImage[] = moduleCached.map((img, idx) => ({
        id: String(img.id ?? `img-${idx}`),
        src: img.src ?? '',
        thumb: img.thumb,
        title: img.title,
        sort_order: Number(img.sortOrder ?? idx)
      }))
      setProductImages(prev => ({ ...prev, [productId]: imgs }))
      return imgs
    }

    try {
      const raw = await fetchAndCacheImages(productId, imagesLink, shopTld)
      const imgs: ProductImage[] = raw.map((img, idx) => ({
        id: String(img.id ?? `img-${idx}`),
        src: img.src ?? '',
        thumb: img.thumb,
        title: img.title,
        sort_order: Number(img.sortOrder ?? idx)
      }))
      setProductImages(prev => ({ ...prev, [productId]: imgs }))
      return imgs
    } catch (err) {
      console.error('Failed to fetch images:', err)
      return []
    }
  }, [])

  // ─── Translation Initialization (CREATE mode) ─────────────────────────────
  const initializeTargetData = useCallback(async (
    data: ProductDetails,
    sourceProductId: number,
    targetShopTlds: string[],
    sourceImagesOverride?: ProductImage[],
    options?: { preserveExisting?: boolean }
  ) => {
    const sourceProduct = data.source.find(p => p.product_id === sourceProductId)
    if (!sourceProduct) return

    const sourceShopLanguages = data.shops[sourceProduct.shop_tld]?.languages ?? []
    const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
    if (!sourceDefaultLang) return
    
    const sourceContent = sourceProduct.content_by_language?.[sourceDefaultLang] || {}
    const sourceImages = sourceImagesOverride ?? productImages[sourceProduct.product_id] ?? []
    
    const newTargetData: Record<string, EditableTargetData> = options?.preserveExisting
      ? { ...targetDataRef.current }
      : {}
    const newActiveLanguages: Record<string, string> = options?.preserveExisting
      ? { ...activeLanguagesRef.current }
      : {}

    const initialContent: Record<string, Record<string, string>> = options?.preserveExisting
      ? { ...initialContentRef.current }
      : {}
    if (!options?.preserveExisting) {
      contentEditorReadyRef.current = {}
    }

    const allTranslationItems: any[] = []

    targetShopTlds.forEach(tld => {
      const targetLanguages = data.shops[tld]?.languages ?? []
      const { translationItems } = prepareTranslationBatch(
        sourceContent,
        sourceDefaultLang,
        targetLanguages
      )

      allTranslationItems.push(...translationItems)
    })

    let translationResults: any[] = []
    let translationError: string | null = null
    if (allTranslationItems.length > 0) {
      setTranslating(true)
      try {
        const { uniqueItems, indexMap } = deduplicateTranslationItems(allTranslationItems)
        console.log(`⏳ Translating ${uniqueItems.length} unique items (${allTranslationItems.length} total)`)
        
        const uniqueResults = await callTranslationAPI(uniqueItems, translationMemoRef.current)
        translationResults = reconstructResults(uniqueResults, indexMap)
        
        console.log(`✓ Translation complete`)
      } catch (error) {
        console.error('Translation failed:', error)
        translationError = error instanceof Error ? error.message : 'Unknown error'
      } finally {
        setTranslating(false)
      }
    }

    const newTargetErrors: Record<string, string> = {}
    let resultIndex = 0
    targetShopTlds.forEach(tld => {
      const targetLanguages = data.shops[tld]?.languages ?? []
      const defaultLang = targetLanguages.find(l => l.is_default)?.code || targetLanguages[0]?.code
      
      if (translationError) {
        newTargetErrors[tld] = translationError
        newActiveLanguages[tld] = defaultLang
        return
      }
      
      const shopItemCount = targetLanguages.reduce((count, lang) => {
        if (sourceDefaultLang && lang.code !== sourceDefaultLang) {
          const fields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']
          return count + fields.filter(f => sourceContent?.[f] && sourceContent[f]!.trim() !== '').length
        }
        return count
      }, 0)
      
      const shopResults = translationResults.slice(resultIndex, resultIndex + shopItemCount)
      resultIndex += shopItemCount

      const { content_by_language, translationMeta } = applyTranslationResults(
        sourceContent,
        sourceDefaultLang,
        targetLanguages,
        shopResults
      )

      if (!originalTranslatedContentRef.current[tld]) {
        originalTranslatedContentRef.current[tld] = {}
      }
      if (!originalTranslationMetaRef.current[tld]) {
        originalTranslationMetaRef.current[tld] = {}
      }
      targetLanguages.forEach(lang => {
        originalTranslatedContentRef.current[tld][lang.code] = {
          title: content_by_language[lang.code]?.title || '',
          fulltitle: content_by_language[lang.code]?.fulltitle || '',
          description: content_by_language[lang.code]?.description || '',
          content: content_by_language[lang.code]?.content || ''
        }
        originalTranslationMetaRef.current[tld][lang.code] = {
          title: translationMeta[lang.code]?.title || 'copied',
          fulltitle: translationMeta[lang.code]?.fulltitle || 'copied',
          description: translationMeta[lang.code]?.description || 'copied',
          content: translationMeta[lang.code]?.content || 'copied'
        }
      })

      const variants: EditableVariant[] = sourceProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalIsDefault: v.is_default,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            sourceDefaultLang ? (v.content_by_language?.[sourceDefaultLang]?.title || '') : ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: sourceDefaultLang ? (v.content_by_language?.[sourceDefaultLang]?.title || '') : '' }
          ])
        )
      }))

      const firstImage = sourceImages[0]
      const initialProductImage: ImageInfo | null = sourceProduct.product_image
        ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
        : firstImage
          ? { src: firstImage.src, thumb: firstImage.thumb, title: firstImage.title }
          : null

      newTargetData[tld] = {
        content_by_language,
        variants,
        images: [...sourceImages],
        originalImageOrder: sourceImages.map((_, idx) => idx),
        removedImageIds: new Set(),
        dirty: false,
        dirtyFields: new Set(),
        dirtyVariants: new Set(),
        originalVariantOrder: variants.map((_, idx) => idx),
        visibility: sourceProduct.visibility || 'visible',
        originalVisibility: sourceProduct.visibility || 'visible',
        productImage: initialProductImage,
        originalProductImage: initialProductImage,
        orderChanged: false,
        imageOrderChanged: false,
        translationMeta
      }

      newActiveLanguages[tld] = defaultLang

      initialContent[tld] = {}
      targetLanguages.forEach(lang => {
        initialContent[tld][lang.code] = content_by_language[lang.code]?.content || ''
      })
      contentEditorReadyRef.current[tld] = {}
    })

    initialContentRef.current = initialContent

    setTargetData(newTargetData)
    setActiveLanguages(newActiveLanguages)
    setTargetErrors(newTargetErrors)

    if (options?.preserveExisting) {
      const anyDirty = Object.values(newTargetData).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
    } else {
      setIsDirty(false)
    }
  }, [mode, productImages])

  // ─── Target Data Initialization (EDIT mode) ───────────────────────────────
  const initializeTargetDataForEdit = useCallback(async (
    data: ProductDetails,
    sourceProductId: number,
    targetShopTlds: string[],
    options?: { preserveExisting?: boolean }
  ) => {
    const sourceProduct = data.source.find(p => p.product_id === sourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = data.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code
    
    const newTargetData: Record<string, EditableTargetData> = options?.preserveExisting
      ? { ...targetDataRef.current }
      : {}
    const newActiveLanguages: Record<string, string> = options?.preserveExisting
      ? { ...activeLanguagesRef.current }
      : {}

    const initialContent: Record<string, Record<string, string>> = options?.preserveExisting
      ? { ...initialContentRef.current }
      : {}
    if (!options?.preserveExisting) {
      contentEditorReadyRef.current = {}
    }

    const newTargetErrors: Record<string, string> = {}

    for (const tld of targetShopTlds) {
      const targetLanguages = data.shops[tld]?.languages ?? []
      const defaultLang = targetLanguages.find(l => l.is_default)?.code || targetLanguages[0]?.code

      const targetProducts = data.targets?.[tld] || []
      
      if (targetProducts.length === 0) {
        newTargetErrors[tld] = 'No existing product found in this shop'
        newActiveLanguages[tld] = defaultLang
        continue
      }

      const targetProduct = targetProducts[0]

      const content_by_language: Record<string, ProductContent> = {}
      targetLanguages.forEach(lang => {
        content_by_language[lang.code] = targetProduct.content_by_language?.[lang.code] || {
          title: '',
          fulltitle: '',
          description: '',
          content: ''
        }
      })

      if (!originalTranslatedContentRef.current[tld]) {
        originalTranslatedContentRef.current[tld] = {}
      }
      if (!originalTranslationMetaRef.current[tld]) {
        originalTranslationMetaRef.current[tld] = {}
      }
      
      targetLanguages.forEach(lang => {
        originalTranslatedContentRef.current[tld][lang.code] = {
          title: content_by_language[lang.code]?.title || '',
          fulltitle: content_by_language[lang.code]?.fulltitle || '',
          description: content_by_language[lang.code]?.description || '',
          content: content_by_language[lang.code]?.content || ''
        }
        originalTranslationMetaRef.current[tld][lang.code] = {
          title: 'existing',
          fulltitle: 'existing',
          description: 'existing',
          content: 'existing'
        }
      })

      const variants: EditableVariant[] = targetProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalIsDefault: v.is_default,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language?.[lang.code]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language?.[lang.code]?.title || '' }
          ])
        )
      }))

      const targetImages: ProductImage[] = []
      const targetImagesLink = targetProduct.images_link
      
      const initialProductImage: ImageInfo | null = targetProduct.product_image
        ? { src: targetProduct.product_image.src, thumb: targetProduct.product_image.thumb, title: targetProduct.product_image.title }
        : null

      // Initialize translationMeta with 'existing' for all fields
      const initialTranslationMeta: TranslationMetaByLang = {}
      targetLanguages.forEach(lang => {
        initialTranslationMeta[lang.code] = {
          title: 'existing',
          fulltitle: 'existing',
          description: 'existing',
          content: 'existing'
        }
      })

      newTargetData[tld] = {
        content_by_language,
        variants,
        images: targetImages,
        originalImageOrder: [],
        removedImageIds: new Set(),
        dirty: false,
        dirtyFields: new Set(),
        dirtyVariants: new Set(),
        originalVariantOrder: variants.map((_, idx) => idx),
        visibility: targetProduct.visibility || 'visible',
        originalVisibility: targetProduct.visibility || 'visible',
        productImage: initialProductImage,
        originalProductImage: initialProductImage,
        orderChanged: false,
        imageOrderChanged: false,
        translationMeta: initialTranslationMeta,
        sourceProduct: sourceProduct,
        targetProductId: targetProduct.product_id,
        targetImagesLink: targetImagesLink,
        targetMatchedByDefaultVariant: targetProduct.matched_by_default_variant,
      }

      newActiveLanguages[tld] = defaultLang

      initialContent[tld] = {}
      targetLanguages.forEach(lang => {
        initialContent[tld][lang.code] = content_by_language[lang.code]?.content || ''
      })
      contentEditorReadyRef.current[tld] = {}
    }

    initialContentRef.current = initialContent

    setTargetData(newTargetData)
    setActiveLanguages(newActiveLanguages)
    setTargetErrors(newTargetErrors)

    if (options?.preserveExisting) {
      const anyDirty = Object.values(newTargetData).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
    } else {
      setIsDirty(false)
    }
  }, [])

  // ─── Source Product Switch Handler ────────────────────────────────────────
  const handleSourceProductSelect = useCallback(async (newProductId: number) => {
    if (newProductId === selectedSourceProductId || !details) return

    if (selectedSourceProductId !== null) {
      perSourceCacheRef.current.set(selectedSourceProductId, {
        targetData: cloneTargetData(targetDataRef.current),
        originalTranslatedContent: JSON.parse(JSON.stringify(originalTranslatedContentRef.current)),
        originalTranslationMeta: JSON.parse(JSON.stringify(originalTranslationMetaRef.current)),
        initialContent: JSON.parse(JSON.stringify(initialContentRef.current)),
        contentEditorReady: JSON.parse(JSON.stringify(contentEditorReadyRef.current)),
        activeLanguages: { ...activeLanguagesRef.current },
      })
    }

    const snapshot = perSourceCacheRef.current.get(newProductId)
    if (snapshot) {
      setSelectedSourceProductId(newProductId)
      setTargetData(snapshot.targetData)
      setActiveLanguages(snapshot.activeLanguages)
      originalTranslatedContentRef.current = snapshot.originalTranslatedContent
      originalTranslationMetaRef.current = snapshot.originalTranslationMeta
      initialContentRef.current = snapshot.initialContent
      contentEditorReadyRef.current = snapshot.contentEditorReady
      const anyDirty = Object.values(snapshot.targetData).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return
    }

    setSourceSwitching(true)
    setSelectedSourceProductId(newProductId)
    setTargetData({})

    const newSourceProduct = details.source.find(p => p.product_id === newProductId)
    if (!newSourceProduct) {
      setSourceSwitching(false)
      return
    }

    try {
      const cachedPageImages = productImages[newProductId]
      const cachedModuleImages = newSourceProduct.images_link
        ? getCachedImages(newProductId, newSourceProduct.shop_tld)
        : null

      if (cachedPageImages?.length || cachedModuleImages?.length) {
        const imgs = cachedPageImages ?? (cachedModuleImages!.map((img, idx) => ({
          id: String(img.id ?? `img-${idx}`),
          src: img.src ?? '',
          thumb: img.thumb,
          title: img.title,
          sort_order: Number(img.sortOrder ?? idx)
        })) as ProductImage[])
        if (!cachedPageImages?.length) {
          setProductImages(prev => ({ ...prev, [newProductId]: imgs }))
        }
        
        if (mode === 'create') {
          await initializeTargetData(details, newProductId, selectedTargetShops, imgs)
        } else {
          await initializeTargetDataForEdit(details, newProductId, selectedTargetShops)
        }
      } else if (newSourceProduct.images_link) {
        if (mode === 'create') {
          const [imgs] = await Promise.all([
            fetchProductImages(newProductId, newSourceProduct.images_link, newSourceProduct.shop_tld),
            initializeTargetData(details, newProductId, selectedTargetShops, []),
          ])
          patchImagesIntoTargetData(setTargetData, selectedTargetShops, imgs, newSourceProduct)
        } else {
          const imgs = await fetchProductImages(newProductId, newSourceProduct.images_link, newSourceProduct.shop_tld)
          await initializeTargetDataForEdit(details, newProductId, selectedTargetShops)
        }
      } else {
        if (mode === 'create') {
          await initializeTargetData(details, newProductId, selectedTargetShops, [])
        } else {
          await initializeTargetDataForEdit(details, newProductId, selectedTargetShops)
        }
      }
    } finally {
      setSourceSwitching(false)
    }
  }, [mode, selectedSourceProductId, details, productImages, selectedTargetShops, fetchProductImages, initializeTargetData, initializeTargetDataForEdit])

  // ─── Field Update Handlers ────────────────────────────────────────────────
  const updateField = useCallback((tld: string, langCode: string, field: keyof ProductContent, value: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      let sourceValue: string
      if (field === 'content') {
        sourceValue = initialContentRef.current[tld]?.[langCode] || ''
      } else {
        sourceValue = originalTranslatedContentRef.current[tld]?.[langCode]?.[field] || ''
      }

      let isChanged: boolean
      if (field === 'content') {
        if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
        const ready = contentEditorReadyRef.current[tld][langCode]
        if (!ready) {
          contentEditorReadyRef.current[tld][langCode] = true
          if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
          initialContentRef.current[tld][langCode] = value
          sourceValue = value
          isChanged = false
        } else {
          sourceValue = initialContentRef.current[tld]?.[langCode] || ''
          isChanged = value !== sourceValue
        }
      } else if (field === 'description') {
        const normalizedValue = value.replace(/\r\n/g, '\n')
        const normalizedSource = sourceValue.replace(/\r\n/g, '\n')
        isChanged = normalizedValue !== normalizedSource
      } else {
        isChanged = value !== sourceValue
      }

      const fieldKey = `${langCode}.${field}`
      const newDirtyFields = new Set(updated[tld].dirtyFields)
      if (isChanged) {
        newDirtyFields.add(fieldKey)
      } else {
        newDirtyFields.delete(fieldKey)
      }
      
      const translatableField = field as TranslatableField
      const translatableFields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']
      let newTranslationMeta = updated[tld].translationMeta
      
      if (translatableFields.includes(translatableField)) {
        if (isChanged) {
          newTranslationMeta = {
            ...newTranslationMeta,
            [langCode]: {
              ...newTranslationMeta?.[langCode],
              [translatableField]: 'manual'
            }
          }
        } else {
          const originalOrigin = originalTranslationMetaRef.current[tld]?.[langCode]?.[translatableField]
          if (originalOrigin !== undefined) {
            newTranslationMeta = {
              ...newTranslationMeta,
              [langCode]: {
                ...newTranslationMeta?.[langCode],
                [translatableField]: originalOrigin
              }
            }
          }
        }
      }
      
      const visibilityChanged = updated[tld].visibility !== updated[tld].originalVisibility
      const productImageChanged = !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: {
          ...updated[tld].content_by_language,
          [langCode]: {
            ...updated[tld].content_by_language[langCode],
            [field]: value
          }
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || visibilityChanged || productImageChanged,
        dirtyFields: newDirtyFields,
        translationMeta: newTranslationMeta
      }

      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      
      return updated
    })
  }, [])

  const updateVariant = useCallback((tld: string, variantIndex: number, field: 'sku' | 'price_excl', value: string | number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      const variant = newVariants[variantIndex]
      
      // For SKU field, validate uniqueness
      if (field === 'sku') {
        const newSku = String(value).toLowerCase().trim()
        if (newSku) {
          // Check if SKU already exists in other variants (including deleted ones)
          const skuExists = newVariants.some((v, idx) => 
            idx !== variantIndex && 
            v.sku?.toLowerCase().trim() === newSku
          )
          if (skuExists) {
            alert('This SKU already exists. Please use a unique SKU.')
            return prev
          }
        }
      }
      
      const newValue = field === 'price_excl' ? parseFloat(value as string) || 0 : value
      
      newVariants[variantIndex] = { ...variant, [field]: newValue }
      const updatedVariant = newVariants[variantIndex]
      
      const isChanged = field === 'sku' 
        ? newValue !== variant.originalSku
        : newValue !== variant.originalPrice
      
      const key = getVariantKey(variant)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isChanged) {
        newDirtyVariants.add(key)
      } else {
        const variantTitle = updatedVariant.content_by_language[activeLanguages[tld]]?.title || ''
        const originalTitle = updatedVariant.originalTitle?.[activeLanguages[tld]] || ''
        const skuMatch = updatedVariant.sku === updatedVariant.originalSku
        const isDefaultMatch = updatedVariant.is_default === (updatedVariant.originalIsDefault ?? false)
        if (variantTitle === originalTitle && skuMatch && updatedVariant.price_excl === updatedVariant.originalPrice && isDefaultMatch) {
          newDirtyVariants.delete(key)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [mode, activeLanguages])

  const updateVariantTitle = useCallback((tld: string, variantIndex: number, langCode: string, title: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      const variant = newVariants[variantIndex]
      
      newVariants[variantIndex] = {
        ...variant,
        content_by_language: {
          ...variant.content_by_language,
          [langCode]: { title }
        }
      }
      const updatedVariant = newVariants[variantIndex]
      
      const originalTitle = variant.originalTitle?.[langCode] || ''
      const isChanged = title !== originalTitle
      
      const key = getVariantKey(variant)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isChanged) {
        newDirtyVariants.add(key)
      } else {
        const skuMatch = mode === 'create' || updatedVariant.sku === updatedVariant.originalSku
        if (skuMatch && updatedVariant.price_excl === updatedVariant.originalPrice && title === originalTitle) {
          newDirtyVariants.delete(key)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [mode])

  // ─── Variant Management ───────────────────────────────────────────────────
  const addVariant = useCallback((tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const targetLanguages = details.shops[tld]?.languages ?? []
      
      // Get all existing SKUs (including deleted variants) for uniqueness check
      const existingSkus = new Set(
        updated[tld].variants
          .filter(v => v.sku)
          .map(v => v.sku?.toLowerCase().trim())
      )
      
      const newVariant: EditableVariant = {
        variant_id: Date.now(),
        temp_id: `new-${Date.now()}`,
        sku: '',
        is_default: false,
        price_excl: 0,
        image: null,
        originalSku: '',
        originalPrice: 0,
        originalTitle: {},
        originalIsDefault: false,
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [lang.code, { title: '' }])
        )
      }
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.add(getVariantKey(newVariant))
      
      updated[tld] = {
        ...updated[tld],
        variants: [...updated[tld].variants, newVariant],
        dirty: true,
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [details, selectedSourceProductId])

  const removeVariant = useCallback((tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (variantIndex < 0 || variantIndex >= variants.length) return prev
      
      const variant = variants[variantIndex]
      
      // For new variants (temp_id), actually remove them
      if (variant.temp_id) {
        const removedKey = getVariantKey(variant)
        const newVariants = variants.filter((_, idx) => idx !== variantIndex)
        const newDirtyVariants = new Set(updated[tld].dirtyVariants)
        newDirtyVariants.delete(removedKey)
        
        updated[tld] = {
          ...updated[tld],
          variants: newVariants,
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
          dirtyVariants: newDirtyVariants
        }
      } else {
        // For existing variants, mark as deleted (soft delete)
        const newVariants = [...variants]
        newVariants[variantIndex] = {
          ...variant,
          deleted: true,
          deletedAt: Date.now(),
          originalIndex: variantIndex
        }
        
        const newDirtyVariants = new Set(updated[tld].dirtyVariants)
        newDirtyVariants.add(getVariantKey(variant))
        
        updated[tld] = {
          ...updated[tld],
          variants: newVariants,
          dirty: true,
          dirtyVariants: newDirtyVariants
        }
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [details, selectedSourceProductId])

  const restoreVariant = useCallback((tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (variantIndex < 0 || variantIndex >= variants.length) return prev
      
      const variant = variants[variantIndex]
      if (!variant.deleted) return prev
      
      // Find the original position
      const originalIndex = variant.originalIndex ?? variantIndex
      
      // Remove from current position
      const newVariants = [...variants]
      const [restoredVariant] = newVariants.splice(variantIndex, 1)
      
      // Remove deleted flag
      delete restoredVariant.deleted
      delete restoredVariant.deletedAt
      delete restoredVariant.originalIndex
      
      // Insert back at original position (clamped to valid range)
      const insertIndex = Math.min(originalIndex, newVariants.filter(v => !v.deleted).length)
      newVariants.splice(insertIndex, 0, restoredVariant)
      
      // Check if this variant is still dirty after restoration
      const key = getVariantKey(restoredVariant)
      const isDirty = 
        restoredVariant.sku !== restoredVariant.originalSku ||
        restoredVariant.price_excl !== restoredVariant.originalPrice ||
        restoredVariant.is_default !== restoredVariant.originalIsDefault ||
        Object.keys(restoredVariant.content_by_language).some(
          lang => restoredVariant.content_by_language[lang]?.title !== restoredVariant.originalTitle?.[lang]
        )
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (!isDirty) {
        newDirtyVariants.delete(key)
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

  const setDefaultVariant = useCallback((tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (variantIndex < 0 || variantIndex >= variants.length) return prev
      
      // Find current default variant index
      const currentDefaultIndex = variants.findIndex(v => v.is_default)
      
      // Update all variants: set the selected one as default, others as non-default
      const newVariants = variants.map((v, idx) => ({
        ...v,
        is_default: idx === variantIndex,
        previousDefaultIndex: idx === currentDefaultIndex ? variantIndex : v.previousDefaultIndex
      }))
      
      // Mark the changed variants as dirty
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newVariants.forEach((v, idx) => {
        const originalIsDefault = v.originalIsDefault ?? false
        if (v.is_default !== originalIsDefault) {
          newDirtyVariants.add(getVariantKey(v))
        } else {
          // Check if other fields are dirty
          const skuChanged = v.sku !== v.originalSku
          const priceChanged = v.price_excl !== v.originalPrice
          const titleChanged = Object.keys(v.content_by_language).some(
            lang => v.content_by_language[lang]?.title !== v.originalTitle?.[lang]
          )
          if (!skuChanged && !priceChanged && !titleChanged) {
            newDirtyVariants.delete(getVariantKey(v))
          }
        }
      })
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirtyVariants: newDirtyVariants,
        dirty: true
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

  const undoSetDefaultVariant = useCallback((tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (variantIndex < 0 || variantIndex >= variants.length) return prev
      
      const variant = variants[variantIndex]
      const originalIsDefault = variant.originalIsDefault ?? false
      
      // Restore all variants to their original default state
      const newVariants = variants.map((v) => ({
        ...v,
        is_default: v.originalIsDefault ?? false,
        previousDefaultIndex: undefined
      }))
      
      // Update dirty variants
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newVariants.forEach((v) => {
        const originalIsDefault = v.originalIsDefault ?? false
        if (v.is_default !== originalIsDefault) {
          newDirtyVariants.add(getVariantKey(v))
        } else {
          // Check if other fields are dirty
          const skuChanged = v.sku !== v.originalSku
          const priceChanged = v.price_excl !== v.originalPrice
          const titleChanged = Object.keys(v.content_by_language).some(
            lang => v.content_by_language[lang]?.title !== v.originalTitle?.[lang]
          )
          if (!skuChanged && !priceChanged && !titleChanged) {
            newDirtyVariants.delete(getVariantKey(v))
          }
        }
      })
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirtyVariants: newDirtyVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

  const restoreDefaultVariant = useCallback((tld: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      
      // Restore all variants to their original default state
      const newVariants = variants.map((v) => ({
        ...v,
        is_default: v.originalIsDefault ?? false,
        previousDefaultIndex: undefined
      }))
      
      // Update dirty variants
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newVariants.forEach((v) => {
        const originalIsDefault = v.originalIsDefault ?? false
        if (v.is_default !== originalIsDefault) {
          newDirtyVariants.add(getVariantKey(v))
        } else {
          // Check if other fields are dirty
          const skuChanged = v.sku !== v.originalSku
          const priceChanged = v.price_excl !== v.originalPrice
          const titleChanged = Object.keys(v.content_by_language).some(
            lang => v.content_by_language[lang]?.title !== v.originalTitle?.[lang]
          )
          if (!skuChanged && !priceChanged && !titleChanged) {
            newDirtyVariants.delete(getVariantKey(v))
          }
        }
      })
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirtyVariants: newDirtyVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

  // ─── Visibility ───────────────────────────────────────────────────────────
  const updateVisibility = useCallback((tld: string, visibility: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const isChanged = visibility !== updated[tld].originalVisibility
      const currentOrder = updated[tld].variants.map(v => v.variant_id)
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const originalOrder = originalVariants.map(v => v.variant_id)
      const orderChanged = !currentOrder.every((id, idx) => id === originalOrder[idx])
      
      updated[tld] = {
        ...updated[tld],
        visibility,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || isChanged || orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [details, selectedSourceProductId])

  const resetVisibility = useCallback((tld: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      updated[tld] = {
        ...updated[tld],
        visibility: updated[tld].originalVisibility,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      return updated
    })
  }, [])

  // ─── Product Images ───────────────────────────────────────────────────────
  const selectVariantImage = useCallback((tld: string, variantIndex: number, image: ProductImage | null) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = {
        ...newVariants[variantIndex],
        image: image ? { src: image.src, thumb: image.thumb, title: image.title } : null
      }
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.add(getVariantKey(newVariants[variantIndex]))
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: true,
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
    setShowImageDialog(false)
    setSelectingImageForVariant(null)
  }, [])

  const selectProductImage = useCallback((tld: string, image: ProductImage | null) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      const available = updated[tld].images ?? []
      if (!image) return prev
      if (available.length <= 1) return prev

      const nextProductImage: ImageInfo = { src: image.src, thumb: image.thumb, title: image.title }

      const nextIdx = available.findIndex(i => i.id === image.id)
      if (nextIdx < 0) {
        updated[tld] = { ...updated[tld], productImage: nextProductImage, dirty: true }
        return updated
      }

      let primaryIdx = 0
      let bestOrder = Number.POSITIVE_INFINITY
      for (let i = 0; i < available.length; i++) {
        const order = available[i]?.sort_order ?? Number.POSITIVE_INFINITY
        if (order < bestOrder) {
          bestOrder = order
          primaryIdx = i
        }
      }

      const doSwap = primaryIdx !== nextIdx
      const primaryOrder = available[primaryIdx]?.sort_order ?? 0
      const nextOrder = available[nextIdx]?.sort_order ?? nextIdx

      const newImages = available.slice()
      if (doSwap) {
        newImages[primaryIdx] = { ...available[primaryIdx], sort_order: nextOrder }
        newImages[nextIdx] = { ...available[nextIdx], sort_order: primaryOrder }
      }

      updated[tld] = {
        ...updated[tld],
        images: newImages,
        imageOrderChanged: doSwap ? true : updated[tld].imageOrderChanged,
        productImage: nextProductImage,
        dirty: true
      }
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
    setShowImageDialog(false)
    setSelectingProductImage(false)
  }, [])

  const resetProductImage = useCallback((tld: string) => {
    if (!details) return
    
    if (mode === 'create') {
      // CREATE MODE: Pick from source and restore original order
      const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
      if (!sourceProduct) return
      
      setTargetData(prev => {
        const updated = { ...prev }
        if (!updated[tld]) return prev
        
        const sourceImages = productImages[sourceProduct.product_id] ?? []
        const resetImages = sourceImages.map((img, idx) => ({
          ...img,
          sort_order: idx
        }))
        
        // Get the original product image from source
        const sourceProductImage: ImageInfo | null = sourceProduct.product_image
          ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
          : resetImages[0]
            ? { src: resetImages[0].src, thumb: resetImages[0].thumb, title: resetImages[0].title }
            : null
        
        updated[tld] = {
          ...updated[tld],
          images: resetImages,
          productImage: sourceProductImage,
          imageOrderChanged: false,
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || updated[tld].orderChanged
        }
        
        const anyDirty = Object.values(updated).some(
          td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
        )
        setIsDirty(anyDirty)
        return updated
      })
    } else {
      // EDIT MODE: Reset to original target values and restore original order
      setTargetData(prev => {
        const updated = { ...prev }
        if (!updated[tld]) return prev
        
        // Restore original image order
        const originalImages = updated[tld].images.map((img, idx) => ({
          ...img,
          sort_order: updated[tld].originalImageOrder[idx] ?? idx
        }))
        
        updated[tld] = {
          ...updated[tld],
          images: originalImages,
          productImage: updated[tld].originalProductImage,
          imageOrderChanged: false,
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || updated[tld].orderChanged
        }
        
        const anyDirty = Object.values(updated).some(
          td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
        )
        setIsDirty(anyDirty)
        return updated
      })
    }
  }, [mode, details, selectedSourceProductId, productImages])

  // ─── Reset Operations ─────────────────────────────────────────────────────
  const resetField = useCallback(async (tld: string, langCode: string, field: keyof ProductContent) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const resetKey = `${tld}:${langCode}:${field}`
    setResettingField(resetKey)

    await new Promise(resolve => setTimeout(resolve, 100))

    if (field === 'content') {
      if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
      contentEditorReadyRef.current[tld][langCode] = false
    }

    const originalValue = originalTranslatedContentRef.current[tld]?.[langCode]?.[field] || ''
    const originalOrigin = originalTranslationMetaRef.current[tld]?.[langCode]?.[field] as TranslationOrigin

    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      const fieldKey = `${langCode}.${field}`
      const newDirtyFields = new Set(updated[tld].dirtyFields)
      newDirtyFields.delete(fieldKey)

      const newTranslationMeta = {
        ...updated[tld].translationMeta,
        [langCode]: {
          ...updated[tld].translationMeta?.[langCode],
          [field]: originalOrigin
        }
      }

      if (field === 'content') {
        if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
        initialContentRef.current[tld][langCode] = originalValue
      }

      updated[tld] = {
        ...updated[tld],
        content_by_language: {
          ...updated[tld].content_by_language,
          [langCode]: {
            ...updated[tld].content_by_language[langCode],
            [field]: originalValue
          }
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
        dirtyFields: newDirtyFields,
        translationMeta: newTranslationMeta
      }

      return updated
    })

    setResettingField(null)
  }, [details, selectedSourceProductId])

  const resetLanguage = useCallback(async (tld: string, langCode: string) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const resetKey = `${tld}:${langCode}:all`
    setResettingField(resetKey)

    await new Promise(resolve => setTimeout(resolve, 100))

    if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
    contentEditorReadyRef.current[tld][langCode] = false

    const translatableFields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']
    const originalContent = originalTranslatedContentRef.current[tld]?.[langCode] || {}
    const originalMeta = originalTranslationMetaRef.current[tld]?.[langCode] || {}

    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newDirtyFields = new Set(
        Array.from(updated[tld].dirtyFields).filter(f => !f.startsWith(`${langCode}.`))
      )

      const newContent: ProductContent = {
        title: originalContent.title || '',
        fulltitle: originalContent.fulltitle || '',
        description: originalContent.description || '',
        content: originalContent.content || ''
      }

      const newLangMeta: any = {}
      translatableFields.forEach(field => {
        newLangMeta[field] = originalMeta[field] || 'translated'
      })

      if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
      initialContentRef.current[tld][langCode] = newContent.content || ''

      const newTranslationMeta = {
        ...updated[tld].translationMeta,
        [langCode]: newLangMeta
      }
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: {
          ...updated[tld].content_by_language,
          [langCode]: newContent
        },
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
        dirtyFields: newDirtyFields,
        translationMeta: newTranslationMeta
      }
      
      return updated
    })

    setResettingField(null)
  }, [details, selectedSourceProductId])

  const resetVariant = useCallback((tld: string, variantIndex: number) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const variant = updated[tld].variants[variantIndex]
      if (!variant) return prev
      
      const key = getVariantKey(variant)
      
      // Handle newly added variants (temp_id) - remove them
      if (variant.temp_id) {
        const newVariants = updated[tld].variants.filter((_, idx) => idx !== variantIndex)
        const newDirtyVariants = new Set(updated[tld].dirtyVariants)
        newDirtyVariants.delete(key)
        const sourceProductForOrder = details.source.find(p => p.product_id === selectedSourceProductId)
        const originalVariants = sourceProductForOrder?.variants || []
        const orderChanged = newVariants.length !== originalVariants.length || !newVariants.every((v, i) => originalVariants[i]?.variant_id === v.variant_id)
        updated[tld] = {
          ...updated[tld],
          variants: newVariants,
          orderChanged,
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || orderChanged,
          dirtyVariants: newDirtyVariants
        }
        return updated
      }
      
      // For edit mode, reset to original target values (not source)
      if (mode === 'edit') {
        const targetLanguages = details.shops[tld]?.languages ?? []
        
        const newVariants = [...updated[tld].variants]
        newVariants[variantIndex] = {
          ...variant,
          sku: variant.originalSku || '',
          price_excl: variant.originalPrice ?? 0,
          is_default: variant.originalIsDefault ?? variant.is_default,
          content_by_language: Object.fromEntries(
            targetLanguages.map(lang => [
              lang.code,
              { title: variant.originalTitle?.[lang.code] || '' }
            ])
          )
        }
        
        const newDirtyVariants = new Set(updated[tld].dirtyVariants)
        newDirtyVariants.delete(key)
        
        updated[tld] = {
          ...updated[tld],
          variants: newVariants,
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
          dirtyVariants: newDirtyVariants
        }
        
        return updated
      }
      
      // For create mode, reset to source variant values
      const sourceVariant = sourceProduct.variants.find(v => v.variant_id === variant.variant_id)
      if (!sourceVariant) return prev
      
      const sourceShopLanguages = details.shops[sourceProduct.shop_tld]?.languages ?? []
      const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
      const targetLanguages = details.shops[tld]?.languages ?? []
      
      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = {
        ...sourceVariant,
        sku: sourceVariant.sku || '',
        originalSku: sourceVariant.sku || '',
        originalPrice: sourceVariant.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            sourceDefaultLang ? (sourceVariant.content_by_language?.[sourceDefaultLang]?.title || '') : ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: sourceDefaultLang ? (sourceVariant.content_by_language?.[sourceDefaultLang]?.title || '') : '' }
          ])
        )
      }
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.delete(key)
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
  }, [details, selectedSourceProductId, mode])

  const resetAllVariants = useCallback((tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const targetLanguages = details.shops[tld]?.languages ?? []
      
      if (mode === 'edit') {
        // EDIT MODE: Reset to the original target variants (from targetData initialization)
        // Filter out only the original variants (those without temp_id)
        const originalVariants = updated[tld].variants.filter(v => !v.temp_id).map(v => {
          const contentByLang: Record<string, { title: string }> = {}
          targetLanguages.forEach(lang => {
            contentByLang[lang.code] = { title: v.originalTitle?.[lang.code] || '' }
          })
          
          return {
            ...v,
            sku: v.originalSku || '',
            price_excl: v.originalPrice ?? 0,
            is_default: v.originalIsDefault ?? v.is_default,
            deleted: false,
            deletedAt: undefined,
            originalIndex: undefined,
            content_by_language: contentByLang
          }
        })
        
        updated[tld] = {
          ...updated[tld],
          variants: originalVariants,
          orderChanged: false,
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
          dirtyVariants: new Set()
        }
      } else {
        // CREATE MODE: Reset to source variants
        const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
        if (!sourceProduct) return prev
        
        const sourceShopLanguages = details.shops[sourceProduct.shop_tld]?.languages ?? []
        const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
        
        const newVariants = sourceProduct.variants.map(v => ({
          ...v,
          sku: v.sku || '',
          originalSku: v.sku || '',
          originalPrice: v.price_excl,
          originalIsDefault: v.is_default,
          originalTitle: Object.fromEntries(
            targetLanguages.map(lang => [
              lang.code,
              sourceDefaultLang ? (v.content_by_language?.[sourceDefaultLang]?.title || '') : ''
            ])
          ),
          content_by_language: Object.fromEntries(
            targetLanguages.map(lang => [
              lang.code,
              { title: sourceDefaultLang ? (v.content_by_language?.[sourceDefaultLang]?.title || '') : '' }
            ])
          )
        }))
        
        updated[tld] = {
          ...updated[tld],
          variants: newVariants,
          orderChanged: false,
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
          dirtyVariants: new Set()
        }
      }
      
      return updated
    })
  }, [details, selectedSourceProductId, mode])

  const resetShop = useCallback((tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const targetLanguages = details.shops[tld]?.languages ?? []
    const sourceShopLanguages = details.shops[sourceProduct.shop_tld]?.languages ?? []
    const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const resetContentByLanguage: Record<string, ProductContent> = {}
      const resetTranslationMeta: any = {}
      
      targetLanguages.forEach(lang => {
        const originalContent = originalTranslatedContentRef.current[tld]?.[lang.code] || {}
        const originalMeta = originalTranslationMetaRef.current[tld]?.[lang.code] || {}
        
        resetContentByLanguage[lang.code] = {
          title: originalContent.title || '',
          fulltitle: originalContent.fulltitle || '',
          description: originalContent.description || '',
          content: originalContent.content || ''
        }
        
        resetTranslationMeta[lang.code] = originalMeta
        
        if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
        contentEditorReadyRef.current[tld][lang.code] = false
        
        if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
        initialContentRef.current[tld][lang.code] = originalContent.content || ''
      })
      
      const resetVariants = sourceProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            sourceDefaultLang ? (v.content_by_language?.[sourceDefaultLang]?.title || '') : ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: sourceDefaultLang ? (v.content_by_language?.[sourceDefaultLang]?.title || '') : '' }
          ])
        )
      }))
      
      const sourceImages = updated[tld].images
      const firstImage = sourceImages[0]
      const resetProductImage: ImageInfo | null = sourceProduct.product_image
        ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
        : firstImage
          ? { src: firstImage.src, thumb: firstImage.thumb, title: firstImage.title }
          : null
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: resetContentByLanguage,
        translationMeta: resetTranslationMeta,
        variants: resetVariants,
        visibility: updated[tld].originalVisibility,
        productImage: resetProductImage,
        originalProductImage: resetProductImage,
        dirty: false,
        dirtyFields: new Set(),
        dirtyVariants: new Set(),
        orderChanged: false,
        removedImageIds: new Set()
      }
      
      return updated
    })
    
    const anyDirty = Object.entries(targetDataRef.current).some(([shopTld, td]) => {
      if (shopTld === tld) return false
      return td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
    })
    setIsDirty(anyDirty)
  }, [details, selectedSourceProductId])

  // ─── Re-translate Operations ──────────────────────────────────────────────
  const retranslateField = useCallback(async (tld: string, langCode: string, field: keyof ProductContent) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const sourceShopLanguages = details.shops[sourceProduct.shop_tld]?.languages ?? []
    const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
    if (!sourceDefaultLang) return
    
    const sourceContent = sourceProduct.content_by_language?.[sourceDefaultLang] || {}
    
    // In CREATE mode, don't allow re-translating same language (it's just a copy, use reset instead)
    // In EDIT mode, allow it for "Pick from source" functionality
    if (langCode === sourceDefaultLang && mode === 'create') {
      alert('Cannot re-translate content in the same language as source.')
      return
    }

    const retranslateKey = `${tld}:${langCode}:${field}`
    setRetranslatingField(retranslateKey)

    if (field === 'content') {
      if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
      contentEditorReadyRef.current[tld][langCode] = false
    }

    try {
      const { value, origin } = await getBaseValueForField(
        sourceContent,
        sourceDefaultLang,
        langCode,
        field as TranslatableField,
        undefined,
        tld
      )
      
      if (origin === 'translated') {
        storeTranslationInMemo(
          translationMemoRef.current,
          sourceDefaultLang,
          langCode,
          field,
          sourceContent[field] || '',
          value,
          tld
        )
      }

      setTargetData(prev => {
        const updated = { ...prev }
        if (!updated[tld]) return prev

        const fieldKey = `${langCode}.${field}`
        const newDirtyFields = new Set(updated[tld].dirtyFields)
        newDirtyFields.delete(fieldKey)

        // Use the origin from getBaseValueForField ('copied' or 'translated')
        const newTranslationMeta = {
          ...updated[tld].translationMeta,
          [langCode]: {
            ...updated[tld].translationMeta?.[langCode],
            [field]: origin
          }
        }

        if (field === 'content') {
          if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
          initialContentRef.current[tld][langCode] = value
        }

        // In CREATE mode, update the original refs (so this becomes the new baseline)
        // In EDIT mode, DON'T update original refs (keep the original target values for reset)
        if (mode === 'create') {
          if (!originalTranslatedContentRef.current[tld]) originalTranslatedContentRef.current[tld] = {}
          if (!originalTranslatedContentRef.current[tld][langCode]) {
            originalTranslatedContentRef.current[tld][langCode] = {
              title: '', fulltitle: '', description: '', content: ''
            }
          }
          originalTranslatedContentRef.current[tld][langCode][field] = value

          if (!originalTranslationMetaRef.current[tld]) originalTranslationMetaRef.current[tld] = {}
          if (!originalTranslationMetaRef.current[tld][langCode]) {
            originalTranslationMetaRef.current[tld][langCode] = {}
          }
          originalTranslationMetaRef.current[tld][langCode][field] = origin
        }

        updated[tld] = {
          ...updated[tld],
          content_by_language: {
            ...updated[tld].content_by_language,
            [langCode]: {
              ...updated[tld].content_by_language[langCode],
              [field]: value
            }
          },
          dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
          dirtyFields: newDirtyFields,
          translationMeta: newTranslationMeta
        }

        return updated
      })
    } catch (error) {
      console.error('Failed to re-translate field:', error)
      alert(`Re-translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setRetranslatingField(null)
    }
  }, [details, selectedSourceProductId, mode])

  const retranslateLanguage = useCallback(async (tld: string, langCode: string) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const sourceShopLanguages = details.shops[sourceProduct.shop_tld]?.languages ?? []
    const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
    if (!sourceDefaultLang) return
    
    if (langCode === sourceDefaultLang) {
      alert('Cannot re-translate content in the same language as source.')
      return
    }

    const retranslateKey = `${tld}:${langCode}:all`
    setRetranslatingField(retranslateKey)

    if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
    contentEditorReadyRef.current[tld][langCode] = false

    const sourceContent = sourceProduct.content_by_language?.[sourceDefaultLang] || {}
    const translatableFields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']

    try {
      const results = await getBaseValuesForLanguage(
        sourceContent,
        sourceDefaultLang,
        langCode,
        translatableFields,
        undefined,
        tld
      )
      
      storeTranslationsInMemo(
        translationMemoRef.current,
        sourceContent,
        sourceDefaultLang,
        langCode,
        results,
        tld
      )

      setTargetData(prev => {
        const updated = { ...prev }
        if (!updated[tld]) return prev
        
        const newDirtyFields = new Set(
          Array.from(updated[tld].dirtyFields).filter(f => !f.startsWith(`${langCode}.`))
        )

        const newContent: ProductContent = {}
        const newLangMeta: any = {}
        
        translatableFields.forEach((field) => {
          const { value } = results[field]
          newContent[field] = value
          newLangMeta[field] = 'translated'
        })

        if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
        initialContentRef.current[tld][langCode] = newContent.content || ''

        if (!originalTranslatedContentRef.current[tld]) originalTranslatedContentRef.current[tld] = {}
        originalTranslatedContentRef.current[tld][langCode] = {
          title: newContent.title || '',
          fulltitle: newContent.fulltitle || '',
          description: newContent.description || '',
          content: newContent.content || ''
        }

        if (!originalTranslationMetaRef.current[tld]) originalTranslationMetaRef.current[tld] = {}
        originalTranslationMetaRef.current[tld][langCode] = {
          title: 'translated',
          fulltitle: 'translated',
          description: 'translated',
          content: 'translated'
        }

        const newTranslationMeta = {
          ...updated[tld].translationMeta,
          [langCode]: newLangMeta
        }
        
        updated[tld] = {
          ...updated[tld],
          content_by_language: {
            ...updated[tld].content_by_language,
            [langCode]: newContent
          },
          dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
          dirtyFields: newDirtyFields,
          translationMeta: newTranslationMeta
        }
        
        return updated
      })
    } catch (error) {
      console.error('Failed to re-translate language:', error)
      alert(`Re-translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setRetranslatingField(null)
    }
  }, [details, selectedSourceProductId])

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearProductImagesCache()
  }, [])

  // ─── Return API ───────────────────────────────────────────────────────────
  return {
    // State
    details,
    loading,
    error,
    targetErrors,
    productImages,
    translating,
    creating,
    createSuccess,
    createErrors,
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
    
    // Computed
    sortedTargetShops,
    sourceProduct,
    hasSourceDuplicates,
    hasMultipleTargets,
    dialogImages,
    
    // Setters
    setDetails,
    setLoading,
    setError,
    setTargetErrors,
    setCreating,
    setCreateSuccess,
    setCreateErrors,
    setUpdating,
    setUpdateSuccess,
    setUpdateErrors,
    setSelectedSourceProductId,
    setActiveTargetTld,
    setTargetData,
    setActiveLanguages,
    setIsDirty,
    setShowCloseConfirmation,
    setShowImageDialog,
    setSelectingImageForVariant,
    setSelectingProductImage,
    setShowCreateConfirmation,
    
    // Methods
    fetchProductImages,
    initializeTargetData,
    initializeTargetDataForEdit,
    handleSourceProductSelect,
    updateField,
    updateVariant,
    updateVariantTitle,
    addVariant,
    removeVariant,
    restoreVariant,
    setDefaultVariant,
    undoSetDefaultVariant,
    restoreDefaultVariant,
    updateVisibility,
    resetVisibility,
    selectVariantImage,
    selectProductImage,
    resetProductImage,
    resetField,
    resetLanguage,
    resetVariant,
    resetAllVariants,
    resetShop,
    retranslateField,
    retranslateLanguage,
    
    // Cleanup
    cleanup,
  }
}
