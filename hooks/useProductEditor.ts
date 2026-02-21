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
  normalizeContentForComparison,
  sortImagesForDisplay,
  getDisplayProductImage,
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
      removedImageSrcs: new Set(td.removedImageSrcs),
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

export function patchImagesIntoTargetData(
  setTargetData: (updater: (prev: Record<string, EditableTargetData>) => Record<string, EditableTargetData>) => void,
  shopTlds: string[],
  images: ProductImage[],
  srcProduct: ProductData
): void {
  if (!images.length) return
  const productOrSrc = srcProduct?.product_image ? { product_image: srcProduct.product_image } : null
  const sortedByOrder = sortImagesForDisplay([...images], productOrSrc)
  const productImageCandidate = sortedByOrder[0]
  const fallbackProductImage: ImageInfo | null = productImageCandidate
    ? { src: productImageCandidate.src, thumb: productImageCandidate.thumb, title: productImageCandidate.title }
    : null
  setTargetData(prev => {
    const updated = { ...prev }
    shopTlds.forEach(tld => {
      if (!updated[tld]) return
      updated[tld] = {
        ...updated[tld],
        images: [...sortedByOrder],
        originalImageOrder: sortedByOrder.map((_, idx) => idx),
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
    const data = targetData[activeTargetTld]
    const raw =
      data?.images ??
      productImages[sourceProduct?.product_id ?? 0] ??
      []
    // Exclude removed/deleted images from selection (cannot pick deleted)
    const filtered = data?.removedImageSrcs?.size
      ? raw.filter((img: { src?: string }) => !data.removedImageSrcs.has(img.src ?? ''))
      : raw
    const productOrSrc = mode === 'create'
      ? (sourceProduct?.product_image ? { product_image: sourceProduct.product_image } : data?.productImage?.src ?? null)
      : (data?.productImage ? { product_image: data.productImage } : null)
    return sortImagesForDisplay(filtered, productOrSrc)
  }, [showImageDialog, sourceProduct, activeTargetTld, targetData, productImages, mode])

  const dialogSelectedImage = useMemo(() => {
    const data = targetData[activeTargetTld]
    if (!data) return undefined
    // Product image selection mode
    if (selectingProductImage) {
      return data.productImage ?? null
    }
    // Variant image selection mode
    if (selectingImageForVariant === null) return undefined
    const variant = data.variants[selectingImageForVariant]
    return variant?.image ?? null
  }, [selectingImageForVariant, selectingProductImage, activeTargetTld, targetData])

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
        originalImage: v.image ? { src: v.image.src, thumb: v.image.thumb, title: v.image.title } : null,
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

      const productOrSrc = sourceProduct.product_image ? { product_image: sourceProduct.product_image } : null
      const sortedSourceImages = sortImagesForDisplay([...sourceImages], productOrSrc)
      const firstBySortOrder = sortedSourceImages[0]
      const initialProductImage: ImageInfo | null = sourceProduct.product_image
        ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
        : firstBySortOrder
          ? { src: firstBySortOrder.src, thumb: firstBySortOrder.thumb, title: firstBySortOrder.title }
          : null

      newTargetData[tld] = {
        content_by_language,
        variants,
        images: [...sortedSourceImages],
        originalImageOrder: sortedSourceImages.map((_, idx) => idx),
        removedImageSrcs: new Set(),
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        originalImage: v.image ? { src: v.image.src, thumb: v.image.thumb, title: v.image.title } : null,
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
        removedImageSrcs: new Set(),
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
          isChanged = normalizeContentForComparison(value) !== normalizeContentForComparison(sourceValue)
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
          // Only restore meta from original when user had manually edited and reverted to original.
          // Do NOT overwrite 'copied' or 'translated' when value matches original - for same language
          // Pick, the value equals original but meta should stay 'copied'.
          const originalValue = originalTranslatedContentRef.current[tld]?.[langCode]?.[translatableField as keyof ProductContent] ?? (translatableField === 'content' ? initialContentRef.current[tld]?.[langCode] : undefined) ?? ''
          const valueMatchesOriginal = translatableField === 'content'
            ? normalizeContentForComparison(value) === normalizeContentForComparison(originalValue)
            : value === originalValue
          const currentMeta = newTranslationMeta?.[langCode]?.[translatableField]
          if (valueMatchesOriginal && currentMeta === 'manual') {
            // User had manually edited and reverted to original - restore meta
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
          // When value matches original but meta is 'copied' or 'translated', keep it - user picked
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
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || visibilityChanged || productImageChanged,
        dirtyFields: newDirtyFields,
        translationMeta: newTranslationMeta
      }

      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [details, selectedSourceProductId])

  /** Add variants from source (edit mode only). Picks sku, price, title; no image. Appends below last target variant with sort_order = last + 1. */
  const addVariantsFromSource = useCallback((tld: string, sourceVariants: Array<{ sku: string | null; price_excl: number; sort_order?: number; content_by_language?: Record<string, { title?: string }> }>) => {
    if (!details || !selectedSourceProductId || mode !== 'edit') return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find((l: { is_default?: boolean }) => l.is_default)?.code
      ?? details.shops[sourceProduct.shop_tld]?.languages?.[0]?.code ?? ''
    const targetLanguages = details.shops[tld]?.languages ?? []

    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      const existing = updated[tld].variants
      const existingSkus = new Set(existing.map(v => (v.sku || '').toLowerCase().trim()).filter(Boolean))
      const maxSortOrder = existing.reduce((max, v) => Math.max(max, v.sort_order ?? 0), 0)

      const toAdd = sourceVariants
        .filter(sv => !existingSkus.has((sv.sku || '').toLowerCase().trim()))
        .map((sv, i): EditableVariant => {
          const titleByLang: Record<string, string> = {}
          const sourceTitle = sv.content_by_language?.[sourceDefaultLang]?.title ?? ''
          targetLanguages.forEach(lang => {
            titleByLang[lang.code] = sourceTitle
          })
          return {
            variant_id: -Date.now() - i - Math.random() * 1e3,
            temp_id: `from-source-${sv.sku || Date.now()}-${Date.now()}`,
            sku: sv.sku || '',
            is_default: false,
            sort_order: maxSortOrder + 1 + i,
            price_excl: sv.price_excl,
            image: null,
            originalSku: sv.sku || '',
            originalPrice: sv.price_excl,
            originalTitle: titleByLang,
            addedFromSource: true,
            content_by_language: Object.fromEntries(
              targetLanguages.map(lang => [lang.code, { title: titleByLang[lang.code] || '' }])
            )
          }
        })

      if (toAdd.length === 0) return prev

      const merged = [...existing, ...toAdd]

      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      // Do not add newly picked variants to dirtyVariants; they match source and need no reset

      updated[tld] = {
        ...updated[tld],
        variants: merged,
        orderChanged: true,
        dirty: true,
        dirtyVariants: newDirtyVariants
      }

      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [details, selectedSourceProductId, mode])

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
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
      
      // Insert back at original position in the full array (clamped to valid range)
      const insertIndex = Math.min(originalIndex, newVariants.length)
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
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || isChanged || orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      return updated
    })
  }, [])

  // ─── Product Images ───────────────────────────────────────────────────────
  const selectVariantImage = useCallback((tld: string, variantIndex: number, image: ProductImage | null) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      const variant = updated[tld].variants[variantIndex]
      const currentImage = variant?.image ?? null
      const newImage = image ? { src: image.src, thumb: image.thumb, title: image.title } : null
      if (isSameImageInfo(currentImage, newImage)) return prev

      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = {
        ...newVariants[variantIndex],
        image: newImage
      }
      const key = getVariantKey(newVariants[variantIndex])
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      if (isSameImageInfo(newImage, variant?.originalImage ?? null)) {
        newDirtyVariants.delete(key)
      } else {
        newDirtyVariants.add(key)
      }

      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: true,
        dirtyVariants: newDirtyVariants
      }

      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
      if (available.length <= 1 && mode !== 'create') return prev

      const nextProductImage: ImageInfo = { src: image.src, thumb: image.thumb, title: image.title }
      const imageSrc = image.src ?? ''

      const nextIdx = available.findIndex(i => (i.src ?? '') === imageSrc)
      if (nextIdx < 0) {
        updated[tld] = {
          ...updated[tld],
          productImage: nextProductImage,
          dirty: true
        }
        const anyDirty = Object.values(updated).some(
          td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
        )
        setIsDirty(anyDirty)
        return updated
      }

      // Ensure selected image has sort_order = 1 (Lightspeed rule: product image = sort_order 1)
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

      const newImages = available.map(img => ({ ...img }))
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
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
    setShowImageDialog(false)
    setSelectingProductImage(false)
  }, [mode])

  const removeImageFromTarget = useCallback((tld: string, imageSrc: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      const img = updated[tld].images.find(i => (i.src ?? '') === imageSrc)
      const isAddedFromSource = !!(img as { addedFromSource?: boolean })?.addedFromSource

      const newVariants = updated[tld].variants.map(v => {
        if ((v.image?.src ?? '') === imageSrc) {
          return { ...v, image: null as { src?: string; thumb?: string; title?: string } | null }
        }
        return v
      })

      let newImages = updated[tld].images
      let newRemoved = new Set(updated[tld].removedImageSrcs)

      if (isAddedFromSource) {
        newImages = updated[tld].images.filter(i => (i.src ?? '') !== imageSrc)
      } else {
        newRemoved.add(imageSrc)
      }

      const remainingImages = isAddedFromSource
        ? newImages
        : updated[tld].images.filter(i => !newRemoved.has(i.src ?? ''))
      const newProductImage =
        (updated[tld].productImage?.src ?? '') === imageSrc
          ? remainingImages[0]
            ? { src: remainingImages[0].src, thumb: remainingImages[0].thumb, title: remainingImages[0].title }
            : null
          : updated[tld].productImage

      updated[tld] = {
        ...updated[tld],
        images: newImages,
        removedImageSrcs: newRemoved,
        variants: newVariants,
        productImage: newProductImage,
        dirty: true,
      }

      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

  const restoreImageToTarget = useCallback((tld: string, imageSrc: string) => {
    const sourceImgs = productImages[selectedSourceProductId ?? 0]
    const srcProduct = details?.source?.find(p => p.product_id === selectedSourceProductId)
    const productOrSrc = srcProduct?.product_image ? { product_image: srcProduct.product_image } : null
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const newRemoved = new Set(updated[tld].removedImageSrcs)
      newRemoved.delete(imageSrc)
      const remainingImages = updated[tld].images.filter(i => !newRemoved.has(i.src ?? ''))
      // Reset sort_order to match source panel order (so display follows source: Y,R,B)
      let newImages = updated[tld].images
      if (sourceImgs?.length) {
        const sourceOrder = sortImagesForDisplay([...sourceImgs], productOrSrc)
        const srcToOrder = new Map<string, number>()
        sourceOrder.forEach((img, idx) => {
          const s = img.src ?? ''
          if (s) srcToOrder.set(s, idx)
        })
        newImages = updated[tld].images.map(img => ({
          ...img,
          sort_order: srcToOrder.get(img.src ?? '') ?? 999
        }))
      }
      // Product image = first by sort_order (source order) among restored images
      let newProductImage = updated[tld].productImage
      if (remainingImages.length > 0) {
        const remainingWithOrder = newImages.filter(img => !newRemoved.has(img.src ?? ''))
        const sorted = sortImagesForDisplay(remainingWithOrder, null)
        const first = sorted[0]
        newProductImage = first ? { src: first.src, thumb: first.thumb, title: first.title } : null
      }
      updated[tld] = {
        ...updated[tld],
        images: newImages,
        removedImageSrcs: newRemoved,
        productImage: newProductImage,
        dirty: true,
      }
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [productImages, selectedSourceProductId, details])

  const addImagesToTarget = useCallback((tld: string, imagesToAdd: ProductImage[]) => {
    if (!imagesToAdd.length) return
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const currentImages = updated[tld].images
      const maxSortOrder = currentImages.length > 0
        ? Math.max(...currentImages.map(img => img.sort_order ?? 0))
        : -1
      const newImages: ProductImage[] = imagesToAdd.map((img, idx) => ({
        id: String(img.id),
        src: img.src ?? '',
        thumb: img.thumb,
        title: img.title,
        sort_order: maxSortOrder + 1 + idx,
        addedFromSource: true
      }))
      const combined = [...currentImages, ...newImages]
      updated[tld] = {
        ...updated[tld],
        images: combined,
        originalImageOrder: updated[tld].originalImageOrder,
        imageOrderChanged: true,
        dirty: true
      }
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

  const pickProductImageFromSource = useCallback((tld: string) => {
    if (!details) return
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const sourceImages = productImages[sourceProduct.product_id] ?? []
    const productOrSrc = sourceProduct.product_image ? { product_image: sourceProduct.product_image } : null
    const sortedSource = sortImagesForDisplay([...sourceImages], productOrSrc)
    const sourceProductImage: ImageInfo | null = sourceProduct.product_image
      ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
      : sortedSource[0]
        ? { src: sortedSource[0].src, thumb: sortedSource[0].thumb, title: sortedSource[0].title }
        : null

    if (!sourceProductImage?.src) {
      setTargetData(prev => {
        const updated = { ...prev }
        if (!updated[tld]) return prev
        updated[tld] = {
          ...updated[tld],
          productImage: null,
          dirty: true
        }
        setIsDirty(true)
        return updated
      })
      setShowImageDialog(false)
      setSelectingProductImage(false)
      return
    }

    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      let available = updated[tld].images ?? []
      let nextIdx = available.findIndex(i => (i.src ?? '') === sourceProductImage.src)

      // In edit mode, if source image is not in target, add it
      if (mode === 'edit' && nextIdx < 0) {
        const sourceImg = sourceImages.find(i => (i.src ?? '') === sourceProductImage.src) ?? sortedSource.find(i => (i.src ?? '') === sourceProductImage.src)
        if (sourceImg) {
          const maxSortOrder = available.length > 0 ? Math.max(...available.map(img => img.sort_order ?? 0)) : -1
          const newImg: ProductImage = {
            id: String(sourceImg.id),
            src: sourceImg.src ?? '',
            thumb: sourceImg.thumb,
            title: sourceImg.title,
            sort_order: maxSortOrder + 1,
            addedFromSource: true
          }
          available = [...available, newImg]
          nextIdx = available.length - 1
        }
      }

      let newImages = available.map(img => ({ ...img }))
      let imageOrderChanged = updated[tld].imageOrderChanged
      let newRemoved = new Set(updated[tld].removedImageSrcs)
      if (sourceProductImage.src) newRemoved.delete(sourceProductImage.src)

      if (nextIdx >= 0) {
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
        if (doSwap) {
          const primaryOrder = available[primaryIdx]?.sort_order ?? 0
          const nextOrder = available[nextIdx]?.sort_order ?? nextIdx
          newImages[primaryIdx] = { ...available[primaryIdx], sort_order: nextOrder }
          newImages[nextIdx] = { ...available[nextIdx], sort_order: primaryOrder }
          imageOrderChanged = true
        }
      }

      updated[tld] = {
        ...updated[tld],
        images: newImages,
        removedImageSrcs: newRemoved,
        productImage: sourceProductImage,
        imageOrderChanged: mode === 'create' ? imageOrderChanged : true,
        dirty: true
      }
      setIsDirty(true)
      return updated
    })
    setShowImageDialog(false)
    setSelectingProductImage(false)
  }, [details, selectedSourceProductId, productImages, mode])

  const resetProductImage = useCallback((tld: string) => {
    if (!details) return
    
    if (mode === 'create') {
      // CREATE MODE: Pick from source - set product image to source's product image (same as pickProductImageFromSource)
      const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
      if (!sourceProduct) return
      
      setTargetData(prev => {
        const updated = { ...prev }
        if (!updated[tld]) return prev
        
        const sourceImages = productImages[sourceProduct.product_id] ?? []
        const productOrSrc = sourceProduct.product_image ? { product_image: sourceProduct.product_image } : null
        const sortedSource = sortImagesForDisplay([...sourceImages], productOrSrc)
        const sourceProductImage: ImageInfo | null = sourceProduct.product_image
          ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
          : sortedSource[0]
            ? { src: sortedSource[0].src, thumb: sortedSource[0].thumb, title: sortedSource[0].title }
            : null
        
        if (!sourceProductImage?.src) {
          updated[tld] = {
            ...updated[tld],
            productImage: null,
            dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || updated[tld].orderChanged
          }
          return updated
        }
        
        // Restore the source product image if it was deleted
        let newRemoved = new Set(updated[tld].removedImageSrcs)
        newRemoved.delete(sourceProductImage.src)
        
        const available = updated[tld].images ?? []
        const nextIdx = available.findIndex(i => (i.src ?? '') === sourceProductImage.src)
        
        let newImages = available.map(img => ({ ...img }))
        let imageOrderChanged = updated[tld].imageOrderChanged
        
        if (nextIdx >= 0) {
          // Ensure product image has sort_order = 1 (swap with current first)
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
          if (doSwap) {
            const primaryOrder = available[primaryIdx]?.sort_order ?? 0
            const nextOrder = available[nextIdx]?.sort_order ?? nextIdx
            newImages[primaryIdx] = { ...available[primaryIdx], sort_order: nextOrder }
            newImages[nextIdx] = { ...available[nextIdx], sort_order: primaryOrder }
            imageOrderChanged = true
          }
        }
        
        updated[tld] = {
          ...updated[tld],
          images: newImages,
          removedImageSrcs: newRemoved,
          productImage: sourceProductImage,
          imageOrderChanged,
          dirty: true
        }
        
        const anyDirty = Object.values(updated).some(
          td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || updated[tld].orderChanged
        }
        
        const anyDirty = Object.values(updated).some(
          td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
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
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
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
        dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
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
      let targetLanguages = details.shops[tld]?.languages ?? []

      // Added-from-source: restore to original (source) values
      if (variant.addedFromSource) {
        const newVariants = [...updated[tld].variants]
        newVariants[variantIndex] = {
          ...variant,
          sku: variant.originalSku || '',
          price_excl: variant.originalPrice ?? 0,
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
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
          dirtyVariants: newDirtyVariants
        }
        return updated
      }

      // Other temp_id variants (e.g. manually added empty) - remove them
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
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || orderChanged,
          dirtyVariants: newDirtyVariants
        }
        return updated
      }

      // For edit mode, reset to original target values (not source)
      if (mode === 'edit') {
        
        const newVariants = [...updated[tld].variants]
        newVariants[variantIndex] = {
          ...variant,
          sku: variant.originalSku || '',
          price_excl: variant.originalPrice ?? 0,
          is_default: variant.originalIsDefault ?? variant.is_default,
          image: variant.originalImage ?? null,
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
          dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
          dirtyVariants: newDirtyVariants
        }
        
        return updated
      }
      
      // For create mode, reset to source variant values
      const sourceVariant = sourceProduct.variants.find(v => v.variant_id === variant.variant_id)
      if (!sourceVariant) return prev
      
      const sourceShopLanguages = details.shops[sourceProduct.shop_tld]?.languages ?? []
      const sourceDefaultLang = sourceShopLanguages.find((l: { is_default?: boolean }) => l.is_default)?.code ?? sourceShopLanguages[0]?.code ?? ''
      targetLanguages = details.shops[tld]?.languages ?? []
      
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
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
  }, [details, selectedSourceProductId, mode])

  const resetVariantImage = useCallback((tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variant = updated[tld].variants[variantIndex]
      if (!variant) return prev
      if (!variant.originalImage) return prev
      if (updated[tld].removedImageSrcs.has(variant.originalImage.src ?? '')) return prev
      const newVariants = [...updated[tld].variants]
      newVariants[variantIndex] = { ...variant, image: { ...variant.originalImage } }
      const key = getVariantKey(variant)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.delete(key)
      if (!isSameImageInfo(newVariants[variantIndex].image, variant.originalImage)) {
        newDirtyVariants.delete(key)
      }
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
        dirtyVariants: newDirtyVariants,
      }
      const anyDirty = Object.values(updated).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
      )
      setIsDirty(anyDirty)
      return updated
    })
  }, [])

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
            image: v.originalImage ?? v.image ?? null,
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
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
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
          dirty: updated[tld].dirtyFields.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
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
      
      let resetVariants: EditableVariant[]
      let resetProductImage: ImageInfo | null
      let resetImages: ProductImage[]
      let resetOriginalImageOrder: number[]

      if (mode === 'edit') {
        // EDIT MODE: Reset to original target values
        resetVariants = updated[tld].variants.filter(v => !v.temp_id).map(v => {
          const contentByLang: Record<string, { title: string }> = {}
          targetLanguages.forEach(lang => {
            contentByLang[lang.code] = { title: v.originalTitle?.[lang.code] || '' }
          })
          return {
            ...v,
            sku: v.originalSku || '',
            originalSku: v.originalSku || '',
            price_excl: v.originalPrice ?? 0,
            originalPrice: v.originalPrice ?? 0,
            is_default: v.originalIsDefault ?? v.is_default,
            originalIsDefault: v.originalIsDefault ?? v.is_default,
            image: v.originalImage ?? null,
            originalImage: v.originalImage ?? null,
            originalTitle: v.originalTitle ?? {},
            content_by_language: contentByLang,
            deleted: false,
            deletedAt: undefined
          }
        })
        resetProductImage = updated[tld].originalProductImage
        resetImages = updated[tld].images.map((img, idx) => ({
          ...img,
          sort_order: updated[tld].originalImageOrder[idx] ?? idx
        }))
        resetOriginalImageOrder = [...updated[tld].originalImageOrder]
      } else {
        // CREATE MODE: Reset to source values
        resetVariants = sourceProduct.variants.map(v => ({
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
        const productOrSrc = sourceProduct.product_image ? { product_image: sourceProduct.product_image } : null
        const sortedSource = sortImagesForDisplay([...sourceImages], productOrSrc)
        resetProductImage = sourceProduct.product_image
          ? { src: sourceProduct.product_image.src, thumb: sourceProduct.product_image.thumb, title: sourceProduct.product_image.title }
          : sortedSource[0]
            ? { src: sortedSource[0].src, thumb: sortedSource[0].thumb, title: sortedSource[0].title }
            : null
        resetImages = updated[tld].images
        resetOriginalImageOrder = updated[tld].originalImageOrder
      }
      
      updated[tld] = {
        ...updated[tld],
        content_by_language: resetContentByLanguage,
        translationMeta: resetTranslationMeta,
        variants: resetVariants,
        images: resetImages,
        originalImageOrder: resetOriginalImageOrder,
        visibility: updated[tld].originalVisibility,
        productImage: resetProductImage,
        originalProductImage: resetProductImage,
        imageOrderChanged: false,
        dirty: false,
        dirtyFields: new Set(),
        dirtyVariants: new Set(),
        orderChanged: false,
        removedImageSrcs: new Set()
      }
      
      return updated
    })
    
    const anyDirty = Object.entries(targetDataRef.current).some(([shopTld, td]) => {
      if (shopTld === tld) return false
      return td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageSrcs.size > 0
    })
    setIsDirty(anyDirty)
  }, [details, selectedSourceProductId, mode])

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
        // In EDIT mode, NEVER update original refs - they hold target's initial values for Reset
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
          dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
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
          dirty: newDirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageSrcs.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged,
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
    dialogSelectedImage,
    
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
    addVariantsFromSource,
    removeVariant,
    restoreVariant,
    setDefaultVariant,
    undoSetDefaultVariant,
    restoreDefaultVariant,
    updateVisibility,
    resetVisibility,
    selectVariantImage,
    selectProductImage,
    addImagesToTarget,
    removeImageFromTarget,
    restoreImageToTarget,
    pickProductImageFromSource,
    resetProductImage,
    resetField,
    resetLanguage,
    resetVariant,
    resetVariantImage,
    resetAllVariants,
    resetShop,
    retranslateField,
    retranslateLanguage,
    
    // Cleanup
    cleanup,
  }
}
