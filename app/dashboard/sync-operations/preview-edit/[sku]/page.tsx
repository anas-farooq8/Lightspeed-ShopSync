"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { LoadingShimmer } from '@/components/ui/loading-shimmer'
import {
  clearProductImagesCache,
  getCachedImages,
  fetchAndCacheImages,
} from '@/lib/cache/product-images-cache'
import {
  UnsavedChangesDialog,
  CreateProductConfirmationDialog,
  ImageSelectionDialog,
} from '@/components/sync-operations/dialogs'
import { ProductHeader } from '@/components/sync-operations/product-display/ProductHeader'
import { SourcePanel } from '@/components/sync-operations/product-display/SourcePanel'
import { TargetPanel } from '@/components/sync-operations/product-display/TargetPanel'
import { useProductNavigation } from '@/hooks/useProductNavigation'
import {
  getBaseValueForField,
  getBaseValuesForLanguage,
  storeTranslationInMemo,
  storeTranslationsInMemo,
  isSameImageInfo,
  getVariantKey,
} from '@/lib/utils'
import type { ProductDetails, ProductData, ProductImage, ImageInfo, EditableVariant, EditableTargetData, ProductContent, TranslatableField, TranslationOrigin } from '@/types/product'

// ─── Module-level pure helpers (no component state) ──────────────────────────

/**
 * Deep-clones an EditableTargetData map.
 * Sets (dirtyFields, dirtyVariants, removedImageIds) can't survive JSON round-trips
 * so we clone them explicitly. Lives outside the component so it's never recreated.
 */
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
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PreviewEditPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sku = decodeURIComponent((params.sku as string) || '')
  const { navigating, navigateBack } = useProductNavigation()

  const targetShopsParam = searchParams.get('targetShops') || ''
  const selectedTargetShops = useMemo(() => targetShopsParam.split(',').filter(Boolean), [targetShopsParam])

  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targetErrors, setTargetErrors] = useState<Record<string, string>>({}) // Per-shop load errors
  /** Keyed by product_id so duplicate sources (same SKU, different products) keep separate image sets. */
  const [productImages, setProductImages] = useState<Record<number, ProductImage[]>>({})
  
  // Edit/Update product states
  const [updating, setUpdating] = useState(false)
  const [updateSuccess, setUpdateSuccess] = useState<Record<string, boolean>>({})
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({})

  /** Runtime-only translation memo for re-translate functionality. */
  const translationMemoRef = useRef(new Map<string, string>())

  const [selectedSourceProductId, setSelectedSourceProductId] = useState<number | null>(null)
  const [activeTargetTld, setActiveTargetTld] = useState<string>('')
  const [targetData, setTargetData] = useState<Record<string, EditableTargetData>>({})
  const [activeLanguages, setActiveLanguages] = useState<Record<string, string>>({})

  /**
   * Always-current refs for mutable state used inside async callbacks.
   * Assigned synchronously during each render (not via useEffect) so there is
   * zero gap between a state commit and the ref reflecting that value.
   * useEffect fires *after* the browser paints, leaving a ~16 ms window where
   * the ref would be stale — assigning in the render body closes that window.
   */
  const targetDataRef = useRef(targetData)
  targetDataRef.current = targetData
  const activeLanguagesRef = useRef(activeLanguages)
  activeLanguagesRef.current = activeLanguages
  const [isDirty, setIsDirty] = useState(false)
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false)
  const [resettingField, setResettingField] = useState<string | null>(null) // "tld:lang:field"
  const [retranslatingField, setRetranslatingField] = useState<string | null>(null) // "tld:lang:field"
  const initialContentRef = useRef<Record<string, Record<string, string>>>({})
  /** Tracks whether we've seen the first onChange for content (tld, lang). Ignore that one for dirty so Quill's mount normalization doesn't mark content changed. */
  const contentEditorReadyRef = useRef<Record<string, Record<string, boolean>>>({})
  /** Stores the original translated/copied content for each shop, lang, field - used for reset */
  const originalTranslatedContentRef = useRef<Record<string, Record<string, Record<string, string>>>>({})
  /** Stores the original translation metadata for reset */
  const originalTranslationMetaRef = useRef<Record<string, Record<string, Record<string, TranslationOrigin>>>>({})

  /** True while a source-product switch is in progress (fetching images + re-translating). */
  const [sourceSwitching, setSourceSwitching] = useState(false)

  /**
   * Per-source snapshot cache.
   * When the user switches the source-product dropdown we save the complete editable state
   * (targetData, refs, activeLanguages) for the OLD source so that switching BACK restores
   * everything — including any edits the user had already made — instantly without an API call.
   */
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

  const [showImageDialog, setShowImageDialog] = useState(false)
  const [selectingImageForVariant, setSelectingImageForVariant] = useState<number | null>(null)
  const [selectingProductImage, setSelectingProductImage] = useState(false)
  const [showCreateConfirmation, setShowCreateConfirmation] = useState(false)

  const sortedTargetShops = useMemo(
    () => [...selectedTargetShops].sort((a, b) => a.localeCompare(b)),
    [selectedTargetShops]
  )

  // Compute values after data is loaded (using useMemo with dependencies)
  const sourceProduct = useMemo(() => 
    details?.source.find(p => p.product_id === selectedSourceProductId) || details?.source[0],
    [details, selectedSourceProductId]
  )
  const hasSourceDuplicates = useMemo(() => 
    (details?.source.length || 0) > 1,
    [details]
  )
  const hasMultipleTargets = sortedTargetShops.length > 1

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowCloseConfirmation(true)
    } else {
      navigateBack()
    }
  }, [isDirty, navigateBack])

  const handleUpdateClick = useCallback(() => {
    if (!sourceProduct || !details) return
    const data = targetData[activeTargetTld]
    if (!data) {
      alert('No data available for this shop')
      return
    }
    setShowCreateConfirmation(true)
  }, [sourceProduct, details, activeTargetTld, targetData])

  const handleConfirmUpdate = useCallback(async () => {
    if (!sourceProduct || !details) return

    const tld = activeTargetTld
    const data = targetData[tld]
    
    if (!data) {
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
      // Prepare data for API
      const updateProductData = {
        visibility: data.visibility,
        content_by_language: data.content_by_language,
        variants: data.variants.map(v => ({
          sku: v.sku || '',
          is_default: v.is_default,
          sort_order: v.sort_order || 0,
          price_excl: v.price_excl,
          image: v.image,
          content_by_language: v.content_by_language
        })),
        images: data.images
          .filter(img => !data.removedImageIds.has(img.id))
          .sort((a, b) => a.sort_order - b.sort_order)
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

      // Call API (will be created)
      const response = await fetch('/api/update-product', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetShopTld: tld,
          shopId,
          sku,
          updateProductData,
          targetShopLanguages
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update product')
      }

      console.log('[UI] ✓ Product updated successfully:', result)

      // Mark as success
      setUpdateSuccess(prev => ({ ...prev, [tld]: true }))

      // If all shops are done, navigate back after a delay
      const allShopsUpdated = sortedTargetShops.every(
        shop => updateSuccess[shop] || shop === tld
      )
      
      if (allShopsUpdated) {
        setTimeout(() => {
          navigateBack()
        }, 1500)
      }

    } catch (err) {
      console.error('[UI] Failed to update product:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setUpdateErrors(prev => ({ ...prev, [tld]: errorMessage }))
    } finally {
      setUpdating(false)
    }
  }, [activeTargetTld, targetData, sourceProduct, details, sortedTargetShops, updateSuccess, navigateBack, sku])

  // Update confirmation dialog content
  const updateConfirmationContent = useMemo(() => {
    if (!details || !sourceProduct) return null
    const tld = activeTargetTld
    const data = targetData[tld]
    if (!data) return null

    const shopName = details.shops?.[tld]?.name ?? tld
    const imageCount = data.images.filter(img => !data.removedImageIds.has(img.id)).length
    const variantCount = data.variants.length

    return {
      shopName,
      shopTld: tld,
      variantCount,
      imageCount,
      sku: data.variants[0]?.sku || sourceProduct.sku || sku
    }
  }, [details, sourceProduct, activeTargetTld, targetData, sku])

  useEffect(() => {
    async function fetchProductDetails() {
      try {
        setLoading(true)
        setError(null)
        const productId = searchParams.get('productId')
        
        // For EDIT mode, we need to fetch both source AND existing target products
        const url = `/api/product-details?sku=${encodeURIComponent(sku)}${productId ? `&productId=${productId}` : ''}&mode=edit&targetShops=${selectedTargetShops.join(',')}`
        
        const response = await fetch(url)
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to fetch product details')
        }
        
        const data = await response.json()
        setDetails(data)
        
        if (data.source.length > 0) {
          const initialSourceId = productId ? parseInt(productId) : data.source[0].product_id
          setSelectedSourceProductId(initialSourceId)
          
          const initialSourceProduct = data.source.find((p: ProductData) => p.product_id === initialSourceId)

          if (initialSourceProduct?.images_link) {
            // In EDIT mode, we just fetch source images for display in source panel
            // Target images are fetched separately per shop in initializeTargetDataForEdit
            const sourceImages = await fetchProductImages(
              initialSourceProduct.product_id,
              initialSourceProduct.images_link,
              initialSourceProduct.shop_tld
            )
            await initializeTargetDataForEdit(data, initialSourceId, selectedTargetShops)
          } else {
            await initializeTargetDataForEdit(data, initialSourceId, selectedTargetShops)
          }
        }
        
        const sortedTargets = selectedTargetShops.sort((a, b) => a.localeCompare(b))
        if (sortedTargets.length > 0) {
          setActiveTargetTld(sortedTargets[0])
        }
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
  }, [sku, searchParams])

  useEffect(() => {
    return () => clearProductImagesCache()
  }, [])


  /**
   * Handles source-product dropdown selection in preview-edit.
   *
   * 1. Saves the current complete editable state to perSourceCacheRef for the OLD source.
   * 2. If the NEW source was previously selected, its snapshot is restored instantly.
   * 3. Otherwise: shows loading, then fetches source images and re-initializes target data for the new source.
   */
  const handleSourceProductSelect = useCallback(async (newProductId: number) => {
    if (newProductId === selectedSourceProductId || !details) return

    // ── 1. Save current state — read from refs, not closure, to capture latest edits ──
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

    // ── 2. Restore from per-source cache if available (instant, no API call) ──
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

    // ── 3. Not cached — fetch source images and re-initialize target data ────────────────
    setSourceSwitching(true)
    setSelectedSourceProductId(newProductId)
    // Clear target panels so they show their loading state while we work.
    setTargetData({})

    const newSourceProduct = details.source.find(p => p.product_id === newProductId)
    if (!newSourceProduct) {
      setSourceSwitching(false)
      return
    }

    try {
      // Check page-state and module-level cache first (no network needed).
      const cachedPageImages = productImages[newProductId]
      const cachedModuleImages = newSourceProduct.images_link
        ? getCachedImages(newProductId, newSourceProduct.shop_tld)
        : null

      if (cachedPageImages?.length || cachedModuleImages?.length) {
        // Images already available — just update state
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
        await initializeTargetDataForEdit(details, newProductId, selectedTargetShops)
      } else if (newSourceProduct.images_link) {
        // Fetch source images for display in source panel
        const imgs = await fetchProductImages(newProductId, newSourceProduct.images_link, newSourceProduct.shop_tld)
        await initializeTargetDataForEdit(details, newProductId, selectedTargetShops)
      } else {
        // No images link — just initialize target data
        await initializeTargetDataForEdit(details, newProductId, selectedTargetShops)
      }
    } finally {
      setSourceSwitching(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceProductId, details, productImages, selectedTargetShops])

  /**
   * Fetches a product's image list, sharing the module-level cache so that
   * ProductImagesGrid (view-only pages) and preview-create never duplicate a request.
   * Cache key: productId|shopTld  — unique per product per shop.
   */
  const fetchProductImages = async (productId: number, imagesLink: string, shopTld: string): Promise<ProductImage[]> => {
    // Reuse module-level cache (same store as ProductImagesGrid).
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
      // fetchAndCacheImages writes to the module-level cache and returns sorted images.
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
  }


  /**
   * Initialize target data for EDIT mode - loads existing target products instead of translating from source
   */
  const initializeTargetDataForEdit = async (
    data: ProductDetails,
    sourceProductId: number,
    targetShopTlds: string[],
    options?: { preserveExisting?: boolean }
  ) => {
    const sourceProduct = data.source.find(p => p.product_id === sourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = data.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    
    const newTargetData: Record<string, EditableTargetData> = options?.preserveExisting
      ? { ...targetData }
      : {}
    const newActiveLanguages: Record<string, string> = options?.preserveExisting
      ? { ...activeLanguages }
      : {}

    const initialContent: Record<string, Record<string, string>> = options?.preserveExisting
      ? { ...initialContentRef.current }
      : {}
    if (!options?.preserveExisting) {
      contentEditorReadyRef.current = {}
    }

    const newTargetErrors: Record<string, string> = {}

    // For EDIT mode, load existing target products
    for (const tld of targetShopTlds) {
      const targetLanguages = data.shops[tld]?.languages ?? []
      const defaultLang = targetLanguages.find(l => l.is_default)?.code || targetLanguages[0]?.code || 'nl'

      // Get existing target products for this shop
      const targetProducts = data.targets?.[tld] || []
      
      if (targetProducts.length === 0) {
        newTargetErrors[tld] = 'No existing product found in this shop'
        newActiveLanguages[tld] = defaultLang
        continue
      }

      // Use the first target product (user can switch if there are duplicates)
      const targetProduct = targetProducts[0]

      // Load existing target content for all languages
      const content_by_language: Record<string, ProductContent> = {}
      targetLanguages.forEach(lang => {
        content_by_language[lang.code] = targetProduct.content_by_language?.[lang.code] || {
          title: '',
          fulltitle: '',
          description: '',
          content: ''
        }
      })

      // Store original content for comparison and reset
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
        // Mark as existing data (not translated) - this will be used for reset behavior
        originalTranslationMetaRef.current[tld][lang.code] = {
          title: 'existing',
          fulltitle: 'existing',
          description: 'existing',
          content: 'existing'
        }
      })

      // Load existing variants from target
      const variants: EditableVariant[] = targetProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
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

      // Load existing images from target product
      // In EDIT mode, we need to fetch images from the TARGET product's images_link
      const targetImages: ProductImage[] = []
      const targetImagesLink = targetProduct.images_link
      
      const initialProductImage: ImageInfo | null = targetProduct.product_image
        ? { src: targetProduct.product_image.src, thumb: targetProduct.product_image.thumb, title: targetProduct.product_image.title }
        : null

      newTargetData[tld] = {
        content_by_language,
        variants,
        images: targetImages, // Will be populated later when target images are fetched
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
        translationMeta: {}, // No translation metadata in edit mode initially
        sourceProduct: sourceProduct, // Store source product for comparison
        targetProductId: targetProduct.product_id, // Store target product ID
        targetImagesLink: targetImagesLink, // Store target images link for fetching
      }

      newActiveLanguages[tld] = defaultLang

      // Set up initial content for editor
      initialContent[tld] = {}
      targetLanguages.forEach(lang => {
        initialContent[tld][lang.code] = content_by_language[lang.code]?.content || ''
      })
      if (!contentEditorReadyRef.current[tld]) {
        contentEditorReadyRef.current[tld] = {}
      } else {
        contentEditorReadyRef.current[tld] = {}
      }
    }

    initialContentRef.current = initialContent

    setTargetData(newTargetData)
    setActiveLanguages(newActiveLanguages)
    setTargetErrors(newTargetErrors)

    // Fetch images for each target shop separately
    for (const tld of targetShopTlds) {
      const targetProduct = data.targets?.[tld]?.[0]
      if (targetProduct?.images_link && newTargetData[tld]) {
        // Fetch target product images
        try {
          const targetImages = await fetchProductImages(
            targetProduct.product_id,
            targetProduct.images_link,
            tld
          )
          
          // Patch images into this specific target shop
          setTargetData(prev => {
            const updated = { ...prev }
            if (updated[tld]) {
              updated[tld] = {
                ...updated[tld],
                images: targetImages,
                originalImageOrder: targetImages.map((_, idx) => idx),
              }
            }
            return updated
          })
        } catch (err) {
          console.error(`Failed to fetch images for ${tld}:`, err)
        }
      }
    }

    if (options?.preserveExisting) {
      const anyDirty = Object.values(newTargetData).some(
        td => td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
      )
      setIsDirty(anyDirty)
    } else {
      setIsDirty(false)
    }
  }

  const updateField = (tld: string, langCode: string, field: keyof ProductContent, value: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      let sourceValue: string
      if (field === 'content') {
        sourceValue = initialContentRef.current[tld]?.[langCode] || ''
      } else {
        // Use the original translated value for this specific language
        sourceValue = originalTranslatedContentRef.current[tld]?.[langCode]?.[field] || ''
      }

      let isChanged: boolean
      if (field === 'content') {
        if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
        const ready = contentEditorReadyRef.current[tld][langCode]
        if (!ready) {
          // First change from the editor: treat as normalization
          // and update our baseline to the normalized HTML.
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
        // Normalize line endings for textarea comparison (browser might convert \n to \r\n or vice versa)
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
      
      // Update translation metadata when field is edited
      const translatableField = field as TranslatableField
      const translatableFields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']
      let newTranslationMeta = updated[tld].translationMeta
      
      if (translatableFields.includes(translatableField)) {
        if (isChanged) {
          // Mark as manually edited
          newTranslationMeta = {
            ...newTranslationMeta,
            [langCode]: {
              ...newTranslationMeta?.[langCode],
              [translatableField]: 'manual'
            }
          }
        } else {
          // Restore original translation metadata when field is reverted
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
  }

  const updateVariant = (tld: string, variantIndex: number, field: 'sku' | 'price_excl', value: string | number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = [...updated[tld].variants]
      const variant = newVariants[variantIndex]
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
        const variantTitle = updatedVariant.content_by_language[activeLanguages[tld] || 'nl']?.title || ''
        const originalTitle = updatedVariant.originalTitle?.[activeLanguages[tld] || 'nl'] || ''
        if (variantTitle === originalTitle && updatedVariant.sku === updatedVariant.originalSku && updatedVariant.price_excl === updatedVariant.originalPrice) {
          newDirtyVariants.delete(key)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const updateVariantTitle = (tld: string, variantIndex: number, langCode: string, title: string) => {
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
        if (updatedVariant.sku === updatedVariant.originalSku && updatedVariant.price_excl === updatedVariant.originalPrice && title === originalTitle) {
          newDirtyVariants.delete(key)
        }
      }
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const addVariant = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const targetLanguages = details.shops[tld]?.languages ?? []
      const newVariant: EditableVariant = {
        variant_id: Date.now(),
        temp_id: `new-${Date.now()}`,
        sku: '',
        is_default: false,
        sort_order: updated[tld].variants.length,
        price_excl: 0,
        image: null,
        originalSku: '',
        originalPrice: 0,
        originalTitle: {},
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [lang.code, { title: '' }])
        )
      }
      
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.add(getVariantKey(newVariant))
      
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const orderChanged = updated[tld].variants.length + 1 !== originalVariants.length
      
      updated[tld] = {
        ...updated[tld],
        variants: [...updated[tld].variants, newVariant],
        orderChanged,
        dirty: true,
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const removeVariant = (tld: string, variantIndex: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (variantIndex < 0 || variantIndex >= variants.length) return prev
      const removedKey = getVariantKey(variants[variantIndex])
      const newVariants = variants.filter((_, idx) => idx !== variantIndex)
      const newDirtyVariants = new Set(updated[tld].dirtyVariants)
      newDirtyVariants.delete(removedKey)
      
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const orderChanged = newVariants.length !== originalVariants.length || !newVariants.every((v, i) => originalVariants[i]?.variant_id === v.variant_id)
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        orderChanged,
        dirty: updated[tld].dirtyFields.size > 0 || newDirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage),
        dirtyVariants: newDirtyVariants
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const moveVariant = (tld: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      const variants = updated[tld].variants
      if (fromIndex < 0 || fromIndex >= variants.length || toIndex < 0 || toIndex >= variants.length) return prev
      const newVariants = [...variants]
      const [movedVariant] = newVariants.splice(fromIndex, 1)
      newVariants.splice(toIndex, 0, movedVariant)
      
      newVariants.forEach((v, idx) => {
        v.sort_order = idx
      })
      
      // Check if order has changed from original by comparing variant IDs in order
      const currentOrder = newVariants.map(v => v.variant_id)
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const originalOrder = originalVariants.map(v => v.variant_id)
      const orderChanged = currentOrder.length !== originalOrder.length || !currentOrder.every((id, idx) => id === originalOrder[idx])
      
      const visibilityChanged = updated[tld].visibility !== updated[tld].originalVisibility
      
      updated[tld] = {
        ...updated[tld],
        variants: newVariants,
        orderChanged,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || orderChanged || visibilityChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const updateVisibility = (tld: string, visibility: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const isChanged = visibility !== updated[tld].originalVisibility
      
      // Check if order has changed from original by comparing variant IDs in order
      const currentOrder = updated[tld].variants.map(v => v.variant_id)
      const originalVariants = details?.source.find(p => p.product_id === selectedSourceProductId)?.variants || []
      const originalOrder = originalVariants.map(v => v.variant_id)
      const orderChanged = !currentOrder.every((id, idx) => id === originalOrder[idx])
      
      updated[tld] = {
        ...updated[tld],
        visibility,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || isChanged || orderChanged || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const resetVisibility = (tld: string) => {
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
  }

  const selectVariantImage = (tld: string, variantIndex: number, image: ProductImage | null) => {
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
      
      return updated
    })
    setIsDirty(true)
    setShowImageDialog(false)
    setSelectingImageForVariant(null)
  }

  const selectProductImage = (tld: string, image: ProductImage | null) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      // Product image rules:
      // - If there are no images, product image can be null (nothing to select anyway).
      // - If there is only 1 image, product image cannot be changed or removed.
      // - If there are 2+ images, selecting a new product image swaps its position (and sort_order)
      //   with the previous product image so bottom-grid ordering stays consistent.
      const available = updated[tld].images ?? []
      if (!image) return prev // Product image cannot be removed via the picker
      if (available.length <= 1) return prev // Cannot change when only one (or zero) image exists

      const nextProductImage: ImageInfo = { src: image.src, thumb: image.thumb, title: image.title }

      // Robust swap strategy:
      // - Identify selected image by id.
      // - Identify current "primary" image by smallest sort_order (typically 0).
      // - Swap their sort_order values (immutably) so the bottom grid re-sorts accordingly.
      const nextIdx = available.findIndex(i => i.id === image.id)
      if (nextIdx < 0) {
        // If we can't find it in the current list, still update productImage but don't attempt reordering.
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

      // Efficient immutable update: create a new array, clone only changed items.
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
      return updated
    })
    setIsDirty(true)
    setShowImageDialog(false)
    setSelectingProductImage(false)
  }

  const dialogImages = useMemo(() => {
    if (!showImageDialog || !sourceProduct) return []
    const raw =
      targetData[activeTargetTld]?.images ??
      productImages[sourceProduct?.product_id ?? 0] ??
      []
    // Sort once per dialog open/list change (not on every render).
    return [...raw].sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999))
  }, [showImageDialog, sourceProduct, activeTargetTld, targetData, productImages])

  const resetProductImage = (tld: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      updated[tld] = {
        ...updated[tld],
        productImage: updated[tld].originalProductImage,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || updated[tld].visibility !== updated[tld].originalVisibility || updated[tld].orderChanged
      }
      return updated
    })
  }

  const removeImage = (tld: string, imageId: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newRemovedIds = new Set(updated[tld].removedImageIds)
      newRemovedIds.add(imageId)
      
      updated[tld] = {
        ...updated[tld],
        removedImageIds: newRemovedIds,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || newRemovedIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const restoreImage = (tld: string, imageId: string) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newRemovedIds = new Set(updated[tld].removedImageIds)
      newRemovedIds.delete(imageId)
      
      updated[tld] = {
        ...updated[tld],
        removedImageIds: newRemovedIds,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || newRemovedIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage)
      }
      
      return updated
    })
  }

  const moveImage = (tld: string, fromIdx: number, toIdx: number) => {
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newImages = [...updated[tld].images]
      const [movedImage] = newImages.splice(fromIdx, 1)
      newImages.splice(toIdx, 0, movedImage)
      
      // Update sort_order for all images
      newImages.forEach((img, idx) => {
        img.sort_order = idx
      })
      
      const imageOrderChanged = newImages.some((img, idx) => updated[tld].originalImageOrder[idx] !== idx)
      
      updated[tld] = {
        ...updated[tld],
        images: newImages,
        imageOrderChanged,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || imageOrderChanged || updated[tld].orderChanged
      }
      
      return updated
    })
    setIsDirty(true)
  }

  const resetImageOrder = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct || !sourceProduct.images) return
    
    const sourceImages: ProductImage[] = sourceProduct.images.map((img: any) => ({
      ...img,
      id: String(img.id)
    }))
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      updated[tld] = {
        ...updated[tld],
        images: [...sourceImages],
        imageOrderChanged: false,
        dirty: updated[tld].dirtyFields.size > 0 || updated[tld].dirtyVariants.size > 0 || updated[tld].removedImageIds.size > 0 || !isSameImageInfo(updated[tld].productImage, updated[tld].originalProductImage) || updated[tld].orderChanged
      }
      
      return updated
    })
  }

  const resetField = async (tld: string, langCode: string, field: keyof ProductContent) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const resetKey = `${tld}:${langCode}:${field}`
    setResettingField(resetKey)

    // Small delay for UX (show loading state)
    await new Promise(resolve => setTimeout(resolve, 100))

    // Reset content editor state if resetting content field
    if (field === 'content') {
      if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
      contentEditorReadyRef.current[tld][langCode] = false
    }

    // Get the ORIGINAL translated/copied value and metadata from when page loaded
    const originalValue = originalTranslatedContentRef.current[tld]?.[langCode]?.[field] || ''
    const originalOrigin = originalTranslationMetaRef.current[tld]?.[langCode]?.[field] as TranslationOrigin

    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev

      const fieldKey = `${langCode}.${field}`
      const newDirtyFields = new Set(updated[tld].dirtyFields)
      newDirtyFields.delete(fieldKey)

      // Restore ORIGINAL metadata (not current metadata)
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
  }

  const resetLanguage = async (tld: string, langCode: string) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const resetKey = `${tld}:${langCode}:all`
    setResettingField(resetKey)

    // Small delay for UX (show loading state)
    await new Promise(resolve => setTimeout(resolve, 100))

    if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
    contentEditorReadyRef.current[tld][langCode] = false

    // Get ORIGINAL translated/copied values and metadata for all fields
    const translatableFields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']
    const originalContent = originalTranslatedContentRef.current[tld]?.[langCode] || {}
    const originalMeta = originalTranslationMetaRef.current[tld]?.[langCode] || {}

    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newDirtyFields = new Set(
        Array.from(updated[tld].dirtyFields).filter(f => !f.startsWith(`${langCode}.`))
      )

      // Build content from original translated values
      const newContent: ProductContent = {
        title: originalContent.title || '',
        fulltitle: originalContent.fulltitle || '',
        description: originalContent.description || '',
        content: originalContent.content || ''
      }

      // Restore ORIGINAL metadata (not current metadata)
      const newLangMeta: any = {}
      translatableFields.forEach(field => {
        newLangMeta[field] = originalMeta[field] || 'translated'
      })

      // Update initial content ref for content field
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
  }

  const resetVariant = (tld: string, variantIndex: number) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const variant = updated[tld].variants[variantIndex]
      if (!variant) return prev
      
      const key = getVariantKey(variant)
      // New variant: remove it
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
      
      const sourceVariant = sourceProduct.variants.find(v => v.variant_id === variant.variant_id)
      if (!sourceVariant) return prev
      
      const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
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
            sourceVariant.content_by_language?.[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: sourceVariant.content_by_language?.[sourceDefaultLang]?.title || '' }
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
  }

  const resetAllVariants = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    const targetLanguages = details.shops[tld]?.languages ?? []
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      const newVariants = sourceProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language?.[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language?.[sourceDefaultLang]?.title || '' }
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
      
      return updated
    })
  }

  const resetShop = (tld: string) => {
    if (!details || !selectedSourceProductId) return
    
    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return
    
    const targetLanguages = details.shops[tld]?.languages ?? []
    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    
    setTargetData(prev => {
      const updated = { ...prev }
      if (!updated[tld]) return prev
      
      // Reset all language content from original translated/copied cache
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
        
        // Reset content editor state
        if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
        contentEditorReadyRef.current[tld][lang.code] = false
        
        // Reset initial content ref for content field
        if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
        initialContentRef.current[tld][lang.code] = originalContent.content || ''
      })
      
      // Reset variants to original source variants
      const resetVariants = sourceProduct.variants.map(v => ({
        ...v,
        sku: v.sku || '',
        originalSku: v.sku || '',
        originalPrice: v.price_excl,
        originalTitle: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            v.content_by_language?.[sourceDefaultLang]?.title || ''
          ])
        ),
        content_by_language: Object.fromEntries(
          targetLanguages.map(lang => [
            lang.code,
            { title: v.content_by_language?.[sourceDefaultLang]?.title || '' }
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
    
    // Reset isDirty if no other shops have changes
    const anyDirty = Object.entries(targetData).some(([shopTld, td]) => {
      if (shopTld === tld) return false // Skip the shop we just reset
      return td.dirty || td.dirtyFields.size > 0 || td.dirtyVariants.size > 0 || td.removedImageIds.size > 0
    })
    setIsDirty(anyDirty)
  }

  const retranslateField = async (tld: string, langCode: string, field: keyof ProductContent) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    const sourceContent = sourceProduct.content_by_language?.[sourceDefaultLang] || {}
    
    // Can't re-translate copied content (same language)
    if (langCode === sourceDefaultLang) {
      alert('Cannot re-translate content in the same language as source.')
      return
    }

    const retranslateKey = `${tld}:${langCode}:${field}`
    setRetranslatingField(retranslateKey)

    // Reset content editor state if re-translating content field
    if (field === 'content') {
      if (!contentEditorReadyRef.current[tld]) contentEditorReadyRef.current[tld] = {}
      contentEditorReadyRef.current[tld][langCode] = false
    }

    try {
      // Re-translate: Always call API fresh (bypass memo - pass undefined to force API call)
      const { value, origin } = await getBaseValueForField(
        sourceContent,
        sourceDefaultLang,
        langCode,
        field as TranslatableField,
        undefined, // No memo - force fresh API call for re-translation
        tld
      )
      
      // Store the fresh translation in memo for future use (shop-specific key)
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

        // Mark as translated
        const newTranslationMeta = {
          ...updated[tld].translationMeta,
          [langCode]: {
            ...updated[tld].translationMeta?.[langCode],
            [field]: 'translated' as const
          }
        }

        if (field === 'content') {
          if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
          initialContentRef.current[tld][langCode] = value
        }

        // Update original refs with new translation
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
        originalTranslationMetaRef.current[tld][langCode][field] = 'translated'

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
  }

  const retranslateLanguage = async (tld: string, langCode: string) => {
    if (!details || !selectedSourceProductId) return

    const sourceProduct = details.source.find(p => p.product_id === selectedSourceProductId)
    if (!sourceProduct) return

    const sourceDefaultLang = details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code || 'nl'
    
    // Can't re-translate copied content (same language)
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
      // Re-translate: Always call API fresh (bypass memo - pass undefined to force API call)
      // Use batch translation - ONE API call instead of 4
      const results = await getBaseValuesForLanguage(
        sourceContent,
        sourceDefaultLang,
        langCode,
        translatableFields,
        undefined, // No memo - force fresh API call for re-translation
        tld
      )
      
      // Store the fresh translations in memo for future use (shop-specific keys)
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

        // Build new content and metadata
        const newContent: ProductContent = {}
        const newLangMeta: any = {}
        
        translatableFields.forEach((field) => {
          const { value } = results[field]
          newContent[field] = value
          newLangMeta[field] = 'translated'
        })

        // Update initial content ref for content field
        if (!initialContentRef.current[tld]) initialContentRef.current[tld] = {}
        initialContentRef.current[tld][langCode] = newContent.content || ''

        // Update original refs with new translations
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
  }

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
        onDiscard={navigateBack}
      />

      <CreateProductConfirmationDialog
        open={showCreateConfirmation}
        onOpenChange={setShowCreateConfirmation}
        content={updateConfirmationContent}
        onConfirm={handleConfirmUpdate}
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
              <div>
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
              </div>

              {sortedTargetShops.map(tld => (
                <TabsContent key={tld} value={tld} className="mt-0">
                  <TargetPanel
                    mode="edit"
                    sourceProduct={sourceProduct}
                    shopTld={tld}
                    shopName={details.shops?.[tld]?.name ?? details.targets[tld]?.[0]?.shop_name ?? tld}
                    baseUrl={details.shops?.[tld]?.base_url ?? details.targets[tld]?.[0]?.base_url ?? ''}
                    languages={details.shops[tld]?.languages ?? []}
                    data={targetData[tld]}
                    activeLanguage={activeLanguages[tld] || ''}
                    imagesLink={sourceProduct.images_link}
                    sourceProductId={sourceProduct.product_id}
                    sourceShopTld={sourceProduct.shop_tld}
                    sourceDefaultLang={details.shops[sourceProduct.shop_tld]?.languages?.find(l => l.is_default)?.code}
                    resettingField={resettingField}
                    retranslatingField={retranslatingField}
                    error={targetErrors[tld]}
                    sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
                    onLanguageChange={(lang) => setActiveLanguages(prev => ({ ...prev, [tld]: lang }))}
                    onUpdateField={(lang, field, value) => updateField(tld, lang, field, value)}
                    onResetField={(lang, field) => resetField(tld, lang, field)}
                    onResetLanguage={(lang) => resetLanguage(tld, lang)}
                    onRetranslateField={(lang, field) => retranslateField(tld, lang, field)}
                    onRetranslateLanguage={(lang) => retranslateLanguage(tld, lang)}
                    onResetShop={() => resetShop(tld)}
                    onUpdateVariant={(idx, field, val) => updateVariant(tld, idx, field, val)}
                    onUpdateVariantTitle={(idx, lang, title) => updateVariantTitle(tld, idx, lang, title)}
                    onAddVariant={() => addVariant(tld)}
                    onRemoveVariant={(idx) => removeVariant(tld, idx)}
                    onMoveVariant={(from, to) => moveVariant(tld, from, to)}
                    onResetVariant={(idx) => resetVariant(tld, idx)}
                    onResetAllVariants={() => resetAllVariants(tld)}
                    onSelectVariantImage={(idx) => {
                      setSelectingImageForVariant(idx)
                      setSelectingProductImage(false)
                      setShowImageDialog(true)
                    }}
                    onSelectProductImage={() => {
                      const imgs = targetData[tld]?.images ?? []
                      if (imgs.length <= 1) return
                      setSelectingProductImage(true)
                      setSelectingImageForVariant(null)
                      setShowImageDialog(true)
                    }}
                    onUpdateVisibility={(visibility) => updateVisibility(tld, visibility)}
                    onResetVisibility={() => resetVisibility(tld)}
                    onResetProductImage={() => resetProductImage(tld)}
                  />
                </TabsContent>
              ))}
            </div>
          </div>
        </Tabs>
      ) : (
        <div className="w-full p-4 sm:p-6">
          <ProductHeader
            onBack={handleBack}
            identifier={{ label: 'Preview Edit - SKU', value: sku }}
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
            <TargetPanel
              mode="edit"
              sourceProduct={sourceProduct}
              shopTld={sortedTargetShops[0]}
              shopName={details.shops?.[sortedTargetShops[0]]?.name ?? details.targets[sortedTargetShops[0]]?.[0]?.shop_name ?? sortedTargetShops[0]}
              baseUrl={details.shops?.[sortedTargetShops[0]]?.base_url ?? details.targets[sortedTargetShops[0]]?.[0]?.base_url ?? ''}
              languages={details.shops[sortedTargetShops[0]]?.languages ?? []}
              data={targetData[sortedTargetShops[0]]}
              activeLanguage={activeLanguages[sortedTargetShops[0]] || ''}
              imagesLink={sourceProduct?.images_link}
              sourceProductId={sourceProduct?.product_id ?? 0}
              sourceShopTld={sourceProduct?.shop_tld}
              sourceDefaultLang={details.shops[sourceProduct?.shop_tld || 'nl']?.languages?.find(l => l.is_default)?.code}
              resettingField={resettingField}
              retranslatingField={retranslatingField}
              error={targetErrors[sortedTargetShops[0]]}
              sourceImages={productImages[sourceProduct?.product_id ?? 0] ?? []}
              onLanguageChange={(lang) => setActiveLanguages(prev => ({ ...prev, [sortedTargetShops[0]]: lang }))}
              onUpdateField={(lang, field, value) => updateField(sortedTargetShops[0], lang, field, value)}
              onResetField={(lang, field) => resetField(sortedTargetShops[0], lang, field)}
              onResetLanguage={(lang) => resetLanguage(sortedTargetShops[0], lang)}
              onRetranslateField={(lang, field) => retranslateField(sortedTargetShops[0], lang, field)}
              onRetranslateLanguage={(lang) => retranslateLanguage(sortedTargetShops[0], lang)}
              onResetShop={() => resetShop(sortedTargetShops[0])}
              onUpdateVariant={(idx, field, val) => updateVariant(sortedTargetShops[0], idx, field, val)}
              onUpdateVariantTitle={(idx, lang, title) => updateVariantTitle(sortedTargetShops[0], idx, lang, title)}
              onAddVariant={() => addVariant(sortedTargetShops[0])}
              onRemoveVariant={(idx) => removeVariant(sortedTargetShops[0], idx)}
              onMoveVariant={(from, to) => moveVariant(sortedTargetShops[0], from, to)}
              onResetVariant={(idx) => resetVariant(sortedTargetShops[0], idx)}
              onResetAllVariants={() => resetAllVariants(sortedTargetShops[0])}
              onSelectVariantImage={(idx) => {
                setSelectingImageForVariant(idx)
                setSelectingProductImage(false)
                setShowImageDialog(true)
              }}
              onSelectProductImage={() => {
                const imgs = targetData[sortedTargetShops[0]]?.images ?? []
                if (imgs.length <= 1) return
                setSelectingProductImage(true)
                setSelectingImageForVariant(null)
                setShowImageDialog(true)
              }}
              onUpdateVisibility={(visibility) => updateVisibility(sortedTargetShops[0], visibility)}
              onResetVisibility={() => resetVisibility(sortedTargetShops[0])}
              onResetProductImage={() => resetProductImage(sortedTargetShops[0])}
            />
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
        showNoImageOption={!selectingProductImage}
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

          {/* Action buttons */}
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
              disabled={updating || updateSuccess[activeTargetTld]}
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

