/**
 * Update Product Service (Simplified)
 *
 * Per UPDATE-SERVICE-ARCHITECTURE.md:
 * - Product image: cannot be altered directly; first image by order becomes product image
 * - Variant image: only from existing target images (API creates duplicate – limitation)
 * - New source images: append only, no product/variant selection
 *
 * Flow:
 * 1. Product: only update changed fields per language (visibility + content), for ALL languages
 * 2. Delete removed images
 * 3. Delete removed variants
 * 4. Variants (4a update existing + title sync to other langs, 4b create new, 4c create images)
 * 5. Fetch + derive for DB sync
 */

import { LightspeedAPIClient } from './lightspeed-api'
import { downloadImage, clearImageCache } from './image-handler'

export interface UpdateVariantInfo {
  /** Lightspeed variant ID for existing variants; null for new (added from source) */
  variant_id: number | null
  sku: string
  is_default: boolean
  sort_order: number
  price_excl: number
  image: { src: string; thumb?: string; title?: string } | null
  content_by_language: Record<string, { title?: string }>
}

export interface UpdateImageInfo {
  src: string
  thumb?: string
  title?: string
  sort_order: number
  id: string
  /** True when image was added from source (not yet in target) */
  addedFromSource?: boolean
}

export interface CurrentImageInfo {
  id: number
  sortOrder: number
  src: string
  thumb?: string
  title?: string
}

export interface UpdateProductInput {
  targetClient: LightspeedAPIClient
  productId: number
  defaultLanguage: string
  targetLanguages: string[]

  /** Current state from DB/API */
  currentVisibility: string
  currentContentByLanguage: Record<string, { title?: string; fulltitle?: string; description?: string; content?: string }>
  currentVariants: Array<{
    lightspeed_variant_id: number
    sku: string
    is_default: boolean
    sort_order: number
    price_excl: number
    image: { src?: string; thumb?: string; title?: string } | null
    content_by_language?: Record<string, { title?: string }>
  }>
  currentImages: CurrentImageInfo[]

  /** Intended state from editor */
  intendedVisibility: string
  intendedContentByLanguage: Record<string, { title?: string; fulltitle?: string; description?: string; content?: string }>
  intendedVariants: UpdateVariantInfo[]
  intendedImages: UpdateImageInfo[]
}

/** Image for DB: { src, thumb, title } from Lightspeed API */
export type ProductImageForDb = { src: string; thumb?: string; title?: string } | null

/** Variant image from Lightspeed API */
export type VariantImageForDb = { src: string; thumb?: string; title?: string }

export interface UpdateProductResult {
  success: boolean
  skipped?: boolean
  productId?: number
  updatedVariants?: number[]
  createdVariantsForDb?: Array<{ variantId: number; sku: string; index: number }>
  deletedVariants?: number[]
  /** Product image from API - for DB sync */
  productImageForDb?: ProductImageForDb
  /** Variant images from API - variantId -> image or null (for updated variants) */
  updatedVariantImages?: Record<number, VariantImageForDb | null>
  /** Variant images from API - index -> image (for created variants) */
  createdVariantImages?: Record<number, VariantImageForDb>
  /** For DB sync optimization: only update what changed */
  productChanged?: boolean
  contentChangedByLanguage?: Record<string, boolean>
  hasImageChanges?: boolean
  error?: string
  details?: unknown
}

function sanitizeVariantTitle(title: string | undefined | null, sku: string): string {
  const trimmed = (title ?? '').toString().trim()
  return trimmed.length > 0 ? trimmed : sku || 'Variant'
}

function isSameImage(a: { src?: string } | null, b: { src?: string } | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (a.src ?? '') === (b.src ?? '')
}

/** Build filename for image upload from title and extension. */
function imageFilename(title: string | undefined, extension: string): string {
  return (title?.trim() || 'image') + '.' + extension
}

/** Extract { src, thumb, title } from API response. */
function toImageForDb(res: unknown): { src: string; thumb?: string; title?: string } | null {
  if (res === null || res === undefined || res === false) return null
  if (typeof res !== 'object' || !('src' in res) || typeof (res as { src?: unknown }).src !== 'string') return null
  const obj = res as { src: string; thumb?: string; title?: string }
  return { src: obj.src, thumb: obj.thumb, title: obj.title }
}

/** Parse image id to number (handles string ids from frontend). */
function parseImageId(ii: UpdateImageInfo): number | null {
  const id = typeof ii.id === 'string' ? parseInt(ii.id, 10) : ii.id
  return !Number.isNaN(id) && id != null ? id : null
}

/** Check if intended image is new (added from source). */
function isNewImage(ii: UpdateImageInfo, currentImages: CurrentImageInfo[]): boolean {
  if (ii.addedFromSource) return true
  const id = parseImageId(ii)
  return id == null || !currentImages.some((ci) => ci.id === id)
}

/** Check if variant has changes compared to current. */
function variantHasChanges(
  cv: { sku: string; is_default: boolean; sort_order: number; price_excl: number; image: { src?: string } | null; content_by_language?: Record<string, { title?: string }> },
  iv: UpdateVariantInfo,
  targetLanguages: string[]
): boolean {
  return (
    cv.sku !== iv.sku ||
    cv.is_default !== iv.is_default ||
    cv.sort_order !== iv.sort_order ||
    cv.price_excl !== iv.price_excl ||
    !isSameImage(cv.image, iv.image) ||
    targetLanguages.some(
      (lang) => (cv.content_by_language?.[lang]?.title ?? '') !== (iv.content_by_language[lang]?.title ?? '')
    )
  )
}

export async function updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
  const {
    targetClient,
    productId,
    defaultLanguage,
    targetLanguages,
    currentVisibility,
    currentContentByLanguage,
    currentVariants,
    currentImages,
    intendedVisibility,
    intendedContentByLanguage,
    intendedVariants,
    intendedImages,
  } = input

  try {
    // ─── Compute diffs ────────────────────────────────────────────────────
    const productChanged =
      currentVisibility !== intendedVisibility ||
      targetLanguages.some(
        (lang) =>
          currentContentByLanguage[lang]?.title !== intendedContentByLanguage[lang]?.title ||
          currentContentByLanguage[lang]?.fulltitle !== intendedContentByLanguage[lang]?.fulltitle ||
          currentContentByLanguage[lang]?.description !== intendedContentByLanguage[lang]?.description ||
          currentContentByLanguage[lang]?.content !== intendedContentByLanguage[lang]?.content
      )

    const currentVariantIds = new Set(currentVariants.map((v) => v.lightspeed_variant_id))
    const intendedExisting = intendedVariants.filter((v) => v.variant_id != null && currentVariantIds.has(v.variant_id))
    const intendedNew = intendedVariants.filter((v) => v.variant_id == null || !currentVariantIds.has(v.variant_id))
    const toDeleteVariants = currentVariants.filter(
      (cv) => !intendedVariants.some((iv) => iv.variant_id === cv.lightspeed_variant_id)
    )

    const currentImageIds = new Set(currentImages.map((ci) => ci.id))
    const toDeleteImages = currentImages.filter((ci) =>
      !intendedImages.some((ii) => parseImageId(ii) === ci.id)
    )

    const hasNewImages = intendedImages.some((ii) => isNewImage(ii, currentImages))
    const hasImageChanges = toDeleteImages.length > 0 || hasNewImages

    const variantsWithChanges = intendedExisting.filter((iv) => {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      return cv != null && variantHasChanges(cv, iv, targetLanguages)
    })
    const hasVariantChanges =
      toDeleteVariants.length > 0 || variantsWithChanges.length > 0 || intendedNew.length > 0

    if (!productChanged && !hasImageChanges && !hasVariantChanges) {
      console.log('[UPDATE] No changes detected, skipping API calls')
      return { success: true, skipped: true, productId }
    }

    console.log('[UPDATE] Applying changes:', {
      product: productChanged,
      images: { toDelete: toDeleteImages.length, hasNew: hasNewImages },
      variants: { toDelete: toDeleteVariants.length, toUpdate: variantsWithChanges.length, toCreate: intendedNew.length },
    })

    const variantIdMap = new Map<number, number>() // intended index -> variantId
    for (const iv of intendedExisting) {
      const idx = intendedVariants.indexOf(iv)
      if (iv.variant_id != null) variantIdMap.set(idx, iv.variant_id)
    }

    // ─── Step 1: Product – only update changed fields, for ALL languages ─
    // Per-language: if any field changed for that lang, update product with only those fields.
    // Visibility: product-level; include in default-lang call if changed.
    const visibilityChanged = currentVisibility !== intendedVisibility
    for (const lang of targetLanguages) {
      const langContent = intendedContentByLanguage[lang]
      if (!langContent) {
        console.warn(`[UPDATE] Product: lang=${lang}, no content, skipping`)
        continue
      }
      const cur = currentContentByLanguage[lang]
      const payload: Record<string, unknown> = {}
      if (lang === defaultLanguage && visibilityChanged) payload.visibility = intendedVisibility
      if ((cur?.title ?? '') !== (langContent.title ?? '')) payload.title = langContent.title
      if ((cur?.fulltitle ?? '') !== (langContent.fulltitle ?? '')) payload.fulltitle = langContent.fulltitle
      if ((cur?.description ?? '') !== (langContent.description ?? '')) payload.description = langContent.description
      if ((cur?.content ?? '') !== (langContent.content ?? '')) payload.content = langContent.content
      const fields = Object.keys(payload)
      if (fields.length > 0) {
        console.log(`[UPDATE] Product: lang=${lang}, fields=${fields.join(',')}, calling updateProduct`)
        await targetClient.updateProduct(productId, { product: payload }, lang)
        console.log(`[UPDATE] ✓ Product updated: lang=${lang}, fields=${fields.join(',')}`)
      } else {
        console.log(`[UPDATE] Product: lang=${lang}, no changes, skipped`)
      }
    }

    // ─── Step 2: Delete removed product images ─────────────────────────────
    if (toDeleteImages.length > 0) {
      for (const img of toDeleteImages) {
        await targetClient.deleteProductImage(productId, img.id, defaultLanguage)
        console.log(`[UPDATE] ✓ Deleted product image: ${img.id}`)
      }
    } else {
      console.log('[UPDATE] Step 2: Delete images – none to delete, skipped')
    }

    // ─── Step 3: Delete removed variants ───────────────────────────────────
    if (toDeleteVariants.length > 0) {
      for (const v of toDeleteVariants) {
        await targetClient.deleteVariant(v.lightspeed_variant_id, defaultLanguage)
        console.log(`[UPDATE] ✓ Deleted variant: ${v.lightspeed_variant_id}`)
      }
    } else {
      console.log('[UPDATE] Step 3: Delete variants – none to delete, skipped')
    }

    // ─── Step 4a: Update existing variants – only changed fields + title sync to other langs ─
    const createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }> = []
    const additionalLanguages = targetLanguages.filter((l) => l !== defaultLanguage)
    const variantTitleChanged = (iv: UpdateVariantInfo, cv: { content_by_language?: Record<string, { title?: string }> } | undefined) =>
      targetLanguages.some((lang) =>
        (cv?.content_by_language?.[lang]?.title ?? '') !== (iv.content_by_language[lang]?.title ?? '')
      )
    console.log(`[UPDATE] Step 4a: Update existing variants (${variantsWithChanges.length} with changes)`)
    for (const iv of intendedExisting) {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      if (!cv || !variantHasChanges(cv, iv, targetLanguages)) continue

      const payload: Parameters<typeof targetClient.updateVariant>[1] = { variant: {} }
      if (cv.sku !== iv.sku) {
        payload.variant!.sku = iv.sku
        payload.variant!.articleCode = iv.sku
      }
      // Only update isDefault when setting to true – Lightspeed auto-unsets the previous default
      if (cv.is_default !== iv.is_default && iv.is_default) payload.variant!.isDefault = true
      if (cv.sort_order !== iv.sort_order) payload.variant!.sortOrder = iv.sort_order
      if (cv.price_excl !== iv.price_excl) payload.variant!.priceExcl = iv.price_excl
      const defaultTitle = sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku)
      const currentDefaultTitle = sanitizeVariantTitle(cv.content_by_language?.[defaultLanguage]?.title, iv.sku)
      if (currentDefaultTitle !== defaultTitle) payload.variant!.title = defaultTitle

      const imageChanged = !isSameImage(cv.image, iv.image)
      if (imageChanged && iv.image?.src) {
        const imageData = await downloadImage(iv.image.src)
        const filename = imageFilename(iv.image.title, imageData.extension)
        payload.variant!.image = {
          attachment: imageData.base64,
          filename,
        }
        console.log(`[UPDATE] Variant: variantId=${iv.variant_id}, attaching image: filename="${filename}", src="${iv.image.src?.slice(0, 60)}...", base64Len=${imageData.base64.length}`)
      } else if (imageChanged && !iv.image?.src) {
        // Skip updateVariant when variant's image is one we're deleting – Lightspeed auto-clears it
        const variantImageSrc = cv.image?.src
        const imageBeingDeleted = variantImageSrc && toDeleteImages.some((d) => d.src === variantImageSrc)
        if (imageBeingDeleted) {
          console.log(`[UPDATE] Variant: variantId=${iv.variant_id}, image removed by product image delete – skip updateVariant (Lightspeed auto-clears)`)
        } else {
          payload.variant!.image = null
        }
      }

      const fields = Object.keys(payload.variant!)
      if (fields.length > 0) {
        const payloadLog = { ...payload.variant }
        if (payloadLog.image && typeof payloadLog.image === 'object' && 'attachment' in payloadLog.image) {
          payloadLog.image = { ...payloadLog.image, attachment: `[base64 ${(payloadLog.image as { attachment: string }).attachment.length} chars]` }
        }
        console.log(`[UPDATE] Variant: lang=${defaultLanguage}, variantId=${iv.variant_id}, fields=${fields.join(',')}, payload=${JSON.stringify(payloadLog)}`)
        const res = await targetClient.updateVariant(iv.variant_id!, payload, defaultLanguage)
        const v = (res as { variant?: { priceExcl?: unknown; image?: unknown } }).variant
        console.log(`[UPDATE] ✓ Variant updated: lang=${defaultLanguage}, variantId=${iv.variant_id}, API returned priceExcl=${v?.priceExcl}, image=${v?.image === false ? 'false' : !!v?.image}`)
      }
      const idx = intendedVariants.indexOf(iv)
      variantIdMap.set(idx, iv.variant_id!)

      // Title sync to other languages (when title changed)
      // Always use default title – when user edits default, propagate to all other langs
      if (variantTitleChanged(iv, cv)) {
        const titleToSync = sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku)
        for (const lang of additionalLanguages) {
          const title = titleToSync
          console.log(`[UPDATE] Variant: lang=${lang}, variantId=${iv.variant_id}, field=title (sync), title="${title}", calling updateVariant`)
          const res = await targetClient.updateVariant(iv.variant_id!, { variant: { title } }, lang)
          const v = (res as { variant?: { title?: string } }).variant
          console.log(`[UPDATE] ✓ Variant updated: lang=${lang}, variantId=${iv.variant_id}, API returned title=${JSON.stringify(v?.title?.slice(0, 30))}`)
        }
      }
    }

    // ─── Step 4b: Create new variants (image from existing target only) ─
    // Frontend validates: only existing target images can be picked for variants.
    console.log(`[UPDATE] Step 4b: Create new variants (${intendedNew.length})`)
    for (const iv of intendedNew) {
      const idx = intendedVariants.indexOf(iv)

      const title = sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku)
      const variantPayload: Parameters<typeof targetClient.createVariant>[0] = {
        variant: {
          product: productId,
          isDefault: iv.is_default,
          sortOrder: iv.sort_order,
          sku: iv.sku,
          articleCode: iv.sku,
          priceExcl: iv.price_excl,
          title,
        },
      }
      if (iv.image?.src) {
        const imageData = await downloadImage(iv.image.src)
        variantPayload.variant.image = {
          attachment: imageData.base64,
          filename: imageFilename(iv.image.title, imageData.extension),
        }
      }
      const res = await targetClient.createVariant(variantPayload, defaultLanguage)
      const newId = res.variant.id
      variantIdMap.set(idx, newId)
      createdVariantsForDb.push({ variantId: newId, sku: iv.sku, index: idx })
      console.log(`[UPDATE] ✓ Created variant ${newId} (${iv.sku}), sortOrder: ${iv.sort_order}`)
    }

    // ─── Step 4c: Create new product images (from source) ────────────────────
    // New images are NOT attachable to product or variants. Just append via createProductImage.
    // Order: created in the order they appear in intendedImages (which is sorted by sort_order).
    const newImageCount = intendedImages.filter((ii) => isNewImage(ii, currentImages)).length
    console.log(`[UPDATE] Step 4c: Create new images (${newImageCount}) – order follows intendedImages (sort_order)`)
    const newImages = intendedImages.filter((ii) => isNewImage(ii, currentImages))
    for (const image of newImages) {
      const imageData = await downloadImage(image.src)
      const res = await targetClient.createProductImage(productId, {
        productImage: {
          attachment: imageData.base64,
          filename: imageFilename(image.title, imageData.extension),
        },
      }, defaultLanguage)
      console.log(`[UPDATE] ✓ Created product image: "${image.title}" id=${res.productImage?.id}`)
    }

    // Clear image cache (like create-product)
    clearImageCache()

    // ─── Step 5: Fetch + derive for DB sync (only when needed) ─────────────────
    const needsProductImage = hasImageChanges
    const needsVariantImages = variantsWithChanges.length > 0 || intendedNew.length > 0

    let productImageForDb: ProductImageForDb | undefined
    const variantImagesByVariantId: Record<number, VariantImageForDb> = {}

    if (needsProductImage) {
      console.log('[UPDATE] Step 5a: Fetching product (image changed)...')
      const productRes = await targetClient.getProduct(productId, defaultLanguage)
      productImageForDb = toImageForDb(productRes?.product?.image)
      console.log(`[UPDATE] ✓ Fetched product`)
    } else {
      productImageForDb = undefined
      console.log('[UPDATE] Step 5a: Product image – no change, skip (DB keeps existing)')
    }

    if (needsVariantImages) {
      console.log('[UPDATE] Step 5b: Fetching variants (variants changed)...')
      const variantsRes = await targetClient.getVariants(productId, defaultLanguage)
      const fetchedVariants = variantsRes.variants ?? []
      for (const [index, variantId] of variantIdMap) {
        const fv = fetchedVariants.find((v) => v.id === variantId)
        const img = toImageForDb(fv?.image)
        if (img) variantImagesByVariantId[variantId] = img
      }
      console.log(`[UPDATE] ✓ Fetched ${fetchedVariants.length} variants`)
    } else {
      console.log('[UPDATE] Step 5b: Variants – no change, skipped fetch')
    }

    console.log('[UPDATE] ✓✓✓ Update complete')

    const toUpdate = intendedExisting.filter((iv) => {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      return cv != null && variantHasChanges(cv, iv, targetLanguages)
    })

    const contentChangedByLanguage: Record<string, boolean> = {}
    for (const lang of targetLanguages) {
      const cur = currentContentByLanguage[lang]
      const intended = intendedContentByLanguage[lang]
      contentChangedByLanguage[lang] =
        (cur?.title ?? '') !== (intended?.title ?? '') ||
        (cur?.fulltitle ?? '') !== (intended?.fulltitle ?? '') ||
        (cur?.description ?? '') !== (intended?.description ?? '') ||
        (cur?.content ?? '') !== (intended?.content ?? '')
    }

    const updatedVariantImages: Record<number, VariantImageForDb | null> = {}
    const createdVariantImages: Record<number, VariantImageForDb> = {}
    for (const vid of toUpdate.map((v) => v.variant_id!)) {
      const img = variantImagesByVariantId[vid]
      updatedVariantImages[vid] = img ?? null
    }
    for (const { variantId, index } of createdVariantsForDb) {
      const img = variantImagesByVariantId[variantId]
      if (img) createdVariantImages[index] = img
    }

    return {
      success: true,
      productId,
      updatedVariants: toUpdate.map((v) => v.variant_id!),
      createdVariantsForDb,
      deletedVariants: toDeleteVariants.map((v) => v.lightspeed_variant_id),
      productImageForDb,
      updatedVariantImages: Object.keys(updatedVariantImages).length > 0 ? updatedVariantImages : undefined,
      createdVariantImages: Object.keys(createdVariantImages).length > 0 ? createdVariantImages : undefined,
      productChanged,
      contentChangedByLanguage,
      hasImageChanges,
    }
  } catch (error) {
    console.error('[UPDATE] ✗✗✗ Update failed:', error)
    clearImageCache()
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error,
    }
  }
}
