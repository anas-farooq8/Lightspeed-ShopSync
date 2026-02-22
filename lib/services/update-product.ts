/**
 * Update Product Service (Simplified)
 *
 * Per UPDATE-SERVICE-ARCHITECTURE.md:
 * - Product image: only from existing target images (swap = sortOrder update)
 * - Variant image: only from existing target images (API creates duplicate – limitation)
 * - New source images: append only, no product/variant selection
 *
 * Flow:
 * 1. Product: visibility & content (default)
 * 2. Delete removed images
 * 3. Delete removed variants
 * 4. Create new images & variants (4a update, 4b create variants, 4c create images)
 * 5. Multi-language
 * 6. Product image swap (using diff data)
 * 7. Fetch + derive for DB sync
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
  /** True when product image src differs from original (matches dialog) */
  productImageChanged?: boolean
  /** True when user explicitly reordered product images */
  imageOrderChanged?: boolean
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
  /** Variant images from API - variantId -> image (for updated variants) */
  updatedVariantImages?: Record<number, VariantImageForDb>
  /** Variant images from API - index -> image (for created variants) */
  createdVariantImages?: Record<number, VariantImageForDb>
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
    productImageChanged = false,
    imageOrderChanged = false,
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

    // Product image: trust frontend only. Dialog detection (productImageChanged | imageOrderChanged)
    // is the source of truth. Do NOT require intendedFirstId – when user deletes the product image,
    // intendedImages may be empty so intendedFirstId would be null, but we still have a change.
    const hasProductImageChange = productImageChanged || imageOrderChanged

    const variantsWithChanges = intendedExisting.filter((iv) => {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      return cv != null && variantHasChanges(cv, iv, targetLanguages)
    })
    const hasVariantChanges =
      toDeleteVariants.length > 0 || variantsWithChanges.length > 0 || intendedNew.length > 0

    if (!productChanged && !hasImageChanges && !hasVariantChanges && !hasProductImageChange) {
      console.log('[UPDATE] No changes detected, skipping API calls')
      return { success: true, skipped: true, productId }
    }

    console.log('[UPDATE] Applying changes:', {
      product: productChanged,
      images: { toDelete: toDeleteImages.length, hasNew: hasNewImages, productImageChange: hasProductImageChange },
      variants: { toDelete: toDeleteVariants.length, toUpdate: variantsWithChanges.length, toCreate: intendedNew.length },
    })

    const variantIdMap = new Map<number, number>() // intended index -> variantId
    for (const iv of intendedExisting) {
      const idx = intendedVariants.indexOf(iv)
      if (iv.variant_id != null) variantIdMap.set(idx, iv.variant_id)
    }

    // ─── Step 1: Product visibility & content (default language only) ───────
    if (productChanged) {
      const defaultContent = intendedContentByLanguage[defaultLanguage]
      if (defaultContent) {
        await targetClient.updateProduct(
          productId,
          {
            product: {
              visibility: intendedVisibility,
              title: defaultContent.title,
              fulltitle: defaultContent.fulltitle,
              description: defaultContent.description,
              content: defaultContent.content,
            },
          },
          defaultLanguage
        )
        console.log(`[UPDATE] ✓ Product updated for default language: ${defaultLanguage}`)
      }
    } else {
      console.log('[UPDATE] Step 1: Product – no changes, skipped')
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

    // ─── Step 4a: Update existing variants (fields + image from existing target) ─
    const createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }> = []
    console.log(`[UPDATE] Step 4a: Update existing variants (${variantsWithChanges.length} with changes)`)
    for (const iv of intendedExisting) {
      const idx = intendedVariants.indexOf(iv)

      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      if (!cv || !variantHasChanges(cv, iv, targetLanguages)) continue

      const payload: Parameters<typeof targetClient.updateVariant>[1] = {
        variant: {
          sku: iv.sku,
          articleCode: iv.sku,
          isDefault: iv.is_default,
          sortOrder: iv.sort_order,
          priceExcl: iv.price_excl,
          title: sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku),
        },
      }
      // Include image only when it changed – otherwise Lightspeed creates a duplicate.
      const imageChanged = !isSameImage(cv.image, iv.image)
      if (imageChanged && iv.image?.src) {
        const imageData = await downloadImage(iv.image.src)
        payload.variant!.image = {
          attachment: imageData.base64,
          filename: imageFilename(iv.image.title, imageData.extension),
        }
      } else if (imageChanged && !iv.image?.src) {
        // Clearing variant image: pass null so API removes the image (type allows null to clear)
        payload.variant!.image = null
      }
      await targetClient.updateVariant(iv.variant_id!, payload, defaultLanguage)
      variantIdMap.set(idx, iv.variant_id!)
      console.log(`[UPDATE] ✓ Updated variant ${iv.variant_id}`)
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
    const newImageCount = intendedImages.filter((ii) => isNewImage(ii, currentImages)).length
    console.log(`[UPDATE] Step 4c: Create new images (${newImageCount}) – append only`)
    const newImages = intendedImages.filter((ii) => isNewImage(ii, currentImages))
    const newImageIdBySrc = new Map<string, number>()
    for (const image of newImages) {
      const imageData = await downloadImage(image.src)
      const res = await targetClient.createProductImage(productId, {
        productImage: {
          attachment: imageData.base64,
          filename: imageFilename(image.title, imageData.extension),
        },
      }, defaultLanguage)
      const src = image.src ?? ''
      if (src && res.productImage?.id != null) newImageIdBySrc.set(src, res.productImage.id)
      console.log(`[UPDATE] ✓ Created product image: "${image.title}" id=${res.productImage?.id}`)
    }

    // ─── Step 5: Multi-language (product content + variant titles for additional languages) ─
    const additionalLanguages = targetLanguages.filter((l) => l !== defaultLanguage)
    if (additionalLanguages.length === 0) {
      console.log('[UPDATE] Step 5: Multi-language – no additional languages, skipped')
    } else {
      for (const lang of additionalLanguages) {
        const langContent = intendedContentByLanguage[lang]
        if (!langContent) {
          console.warn(`[UPDATE] No content for language ${lang}, skipping`)
          continue
        }
        const currentLang = currentContentByLanguage[lang]
        const productLangChanged =
          (currentLang?.title ?? '') !== (langContent.title ?? '') ||
          (currentLang?.fulltitle ?? '') !== (langContent.fulltitle ?? '') ||
          (currentLang?.description ?? '') !== (langContent.description ?? '') ||
          (currentLang?.content ?? '') !== (langContent.content ?? '')
        if (productLangChanged) {
          await targetClient.updateProduct(
            productId,
            {
              product: {
                title: langContent.title,
                fulltitle: langContent.fulltitle,
                description: langContent.description,
                content: langContent.content,
              },
            },
            lang
          )
          console.log(`[UPDATE] ✓ Product updated for ${lang}`)
        }
        const variantsToUpdate: Array<{ variantId: number; title: string }> = []
        for (const [index, variantId] of variantIdMap) {
          const iv = intendedVariants[index]
          const cv = currentVariants.find((c) => c.lightspeed_variant_id === variantId)
          if (!iv) continue
          const intendedTitle = sanitizeVariantTitle(iv.content_by_language[lang]?.title, iv.sku)
          const currentTitle = sanitizeVariantTitle(cv?.content_by_language?.[lang]?.title, iv.sku)
          if (intendedTitle !== currentTitle) {
            variantsToUpdate.push({ variantId, title: intendedTitle })
          }
        }
        for (const { variantId, title } of variantsToUpdate) {
          await targetClient.updateVariant(variantId, { variant: { title } }, lang)
        }
        if (productLangChanged || variantsToUpdate.length > 0) {
          console.log(`[UPDATE] ✓ Language ${lang}: product=${productLangChanged}, variants=${variantsToUpdate.length}`)
        }
      }
    }

    // Clear image cache (like create-product)
    clearImageCache()

    // ─── Step 6: Product image reorder (no duplicates – avoids Lightspeed id tiebreaker) ─
    // When multiple images have sortOrder 1, Lightspeed picks by id. We reorder ALL images
    // to match intended order (1, 2, 3, ...) so only the intended first has sortOrder 1.
    // Includes both existing and newly created images (6 old + 2 new = reorder all 8).
    const remainingCurrentIds = new Set(
      currentImages.filter((ci) => !toDeleteImages.some((d) => d.id === ci.id)).map((ci) => ci.id)
    )
    const orderedIntended: Array<{ id: number }> = []
    for (const ii of intendedImages) {
      const existingId = parseImageId(ii)
      const id = existingId != null && remainingCurrentIds.has(existingId)
        ? existingId
        : newImageIdBySrc.get(ii.src ?? '')
      if (id != null) orderedIntended.push({ id })
    }

    // sortOrder reorder temporarily disabled
    // if (hasProductImageChange && orderedIntended.length > 0) {
    //   const currentById = new Map(currentImages.map((ci) => [ci.id, ci]))
    //   for (let i = 0; i < orderedIntended.length; i++) {
    //     const { id } = orderedIntended[i]
    //     const newSortOrder = i + 1
    //     const current = currentById.get(id)
    //     if (current == null || current.sortOrder !== newSortOrder) {
    //       await targetClient.updateProductImage(productId, id, { productImage: { sortOrder: newSortOrder } }, defaultLanguage)
    //       console.log(`[UPDATE] ✓ Product image reorder: id=${id} -> ${newSortOrder}`)
    //     }
    //   }
    // } else {
    //   console.log('[UPDATE] Step 6: Product image – no reorder needed, skipped')
    // }
    console.log('[UPDATE] Step 6: Product image reorder – disabled (sortOrder changes commented out)')

    // ─── Step 7: Fetch + derive for DB sync ──────────────────────────────────
    console.log('[UPDATE] Step 7: Fetching product and variants...')
    const [productRes, variantsRes] = await Promise.all([
      targetClient.getProduct(productId, defaultLanguage),
      targetClient.getVariants(productId, defaultLanguage),
    ])
    const fetchedVariants = variantsRes.variants ?? []
    const rawProductImage = productRes?.product?.image
    console.log(`[UPDATE] ✓ Fetched product, ${fetchedVariants.length} variants`)
    console.log(`[UPDATE] DEBUG product.image:`, rawProductImage === null ? 'null' : rawProductImage === false ? 'false (API no-image)' : rawProductImage)

    // Derive productImageForDb, variantImagesForDb (same as create) ─
    const variantImagesByVariantId: Record<number, VariantImageForDb> = {}
    for (const [index, variantId] of variantIdMap) {
      const fv = fetchedVariants.find((v) => v.id === variantId)
      const img = toImageForDb(fv?.image)
      if (img) variantImagesByVariantId[variantId] = img
    }

    // Product image: from product.image (like create-product)
    const productImageForDb = toImageForDb(productRes.product.image)

    console.log('[UPDATE] ✓✓✓ Update complete')

    const toUpdate = intendedExisting.filter((iv) => {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      return cv != null && variantHasChanges(cv, iv, targetLanguages)
    })

    const updatedVariantImages: Record<number, VariantImageForDb> = {}
    const createdVariantImages: Record<number, VariantImageForDb> = {}
    for (const vid of toUpdate.map((v) => v.variant_id!)) {
      const img = variantImagesByVariantId[vid]
      if (img) updatedVariantImages[vid] = img
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
