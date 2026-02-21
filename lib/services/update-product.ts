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
 * 4. Create new images & variants
 * 5. Fetch
 * 6. Update sortOrders (existing only for product image; all for order)
 * 7. Multi-language
 * 8. Derive, return for DB sync
 */

import { LightspeedAPIClient } from './lightspeed-api'
import { downloadImage, clearImageCache } from './image-handler'
import { sortBySortOrder } from '@/lib/utils'

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

    // Product image swap: first existing image in intended order differs from current first
    const currentFirstImage = sortBySortOrder(currentImages)[0]
    const intendedOrderForSkip = sortBySortOrder(intendedImages)
    const firstExistingInIntended = intendedOrderForSkip.find((ii) => {
      const id = parseImageId(ii)
      return id != null && currentImageIds.has(id)
    })
    const intendedFirstId = firstExistingInIntended ? parseImageId(firstExistingInIntended) : null
    const hasProductImageChange =
      currentFirstImage != null && intendedFirstId != null && currentFirstImage.id !== intendedFirstId

    const hasVariantChanges =
      toDeleteVariants.length > 0 ||
      intendedExisting.some((iv) => {
        const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
        return cv != null && variantHasChanges(cv, iv, targetLanguages)
      }) ||
      intendedNew.length > 0

    if (!productChanged && !hasImageChanges && !hasVariantChanges && !hasProductImageChange) {
      console.log('[UPDATE] No changes detected, skipping API calls')
      return { success: true, skipped: true, productId }
    }

    console.log('[UPDATE] Applying changes:', {
      product: productChanged,
      images: { toDelete: toDeleteImages.length, hasNew: hasNewImages, productImageChange: hasProductImageChange },
      variants: { toDelete: toDeleteVariants.length, toUpdate: intendedExisting.length, toCreate: intendedNew.length },
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

    // ─── Step 4: Create new product images & variants (sorted like create) ──
    const newImageCount = intendedImages.filter((ii) => isNewImage(ii, currentImages)).length
    console.log(`[UPDATE] Step 4: Create new images & variants (${newImageCount} new image(s) to create)`)
    const sortedImages = sortBySortOrder(intendedImages)
    const createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }> = []
    const processedVariantIndices = new Set<number>()
    /** New product image ids from createProductImage (for sortOrder update) */
    const newProductImageIdsBySrc = new Map<string, number>()

    for (const image of sortedImages) {
      if (!isNewImage(image, currentImages)) continue

      const variantsForImage = intendedVariants
        .filter((v) => v.image?.src === image.src)
        .sort((a, b) => (a.is_default ? 0 : 1) - (b.is_default ? 0 : 1))

      if (variantsForImage.length > 0) {
        const imageData = await downloadImage(image.src)
        const filename = imageFilename(image.title, imageData.extension)

        for (const iv of variantsForImage) {
          const idx = intendedVariants.indexOf(iv)
          if (iv.variant_id != null && currentVariantIds.has(iv.variant_id)) {
            await targetClient.updateVariant(iv.variant_id, {
              variant: {
                sku: iv.sku,
                articleCode: iv.sku,
                isDefault: iv.is_default,
                sortOrder: idx + 1,
                priceExcl: iv.price_excl,
                title: sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku),
                image: { attachment: imageData.base64, filename },
              },
            }, defaultLanguage)
            variantIdMap.set(idx, iv.variant_id)
            processedVariantIndices.add(idx)
            console.log(`[UPDATE] ✓ Updated variant ${iv.variant_id} with image`)
          } else {
            const res = await targetClient.createVariant({
              variant: {
                product: productId,
                isDefault: iv.is_default,
                sortOrder: idx + 1,
                sku: iv.sku,
                articleCode: iv.sku,
                priceExcl: iv.price_excl,
                title: sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku),
                image: { attachment: imageData.base64, filename },
              },
            }, defaultLanguage)
            const newId = res.variant.id
            variantIdMap.set(idx, newId)
            createdVariantsForDb.push({ variantId: newId, sku: iv.sku, index: idx })
            processedVariantIndices.add(idx)
            console.log(`[UPDATE] ✓ Created variant ${newId} (${iv.sku}) with image`)
          }
        }
      } else {
        const imageData = await downloadImage(image.src)
        const createRes = await targetClient.createProductImage(productId, {
          productImage: {
            attachment: imageData.base64,
            filename: imageFilename(image.title, imageData.extension),
          },
        }, defaultLanguage)
        newProductImageIdsBySrc.set(image.src, createRes.productImage.id)
        console.log(`[UPDATE] ✓ Created product image (id: ${createRes.productImage.id})`)
      }
    }

    // Update existing variants (field changes, no new image from loop)
    for (const iv of intendedExisting) {
      const idx = intendedVariants.indexOf(iv)
      if (processedVariantIndices.has(idx)) continue

      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      if (!cv || !variantHasChanges(cv, iv, targetLanguages)) continue

      const payload: Parameters<typeof targetClient.updateVariant>[1] = {
        variant: {
          sku: iv.sku,
          articleCode: iv.sku,
          isDefault: iv.is_default,
          sortOrder: idx + 1,
          priceExcl: iv.price_excl,
          title: sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku),
        },
      }
      if (iv.image?.src) {
        const imageData = await downloadImage(iv.image.src)
        payload.variant!.image = {
          attachment: imageData.base64,
          filename: imageFilename(iv.image.title, imageData.extension),
        }
      }
      await targetClient.updateVariant(iv.variant_id!, payload, defaultLanguage)
      variantIdMap.set(idx, iv.variant_id!)
      console.log(`[UPDATE] ✓ Updated variant ${iv.variant_id}`)
    }

    // Create new variants (no image)
    for (const iv of intendedNew) {
      const idx = intendedVariants.indexOf(iv)
      if (processedVariantIndices.has(idx)) continue

      const title = sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku)
      const res = await targetClient.createVariant({
        variant: {
          product: productId,
          isDefault: iv.is_default,
          sortOrder: idx + 1,
          sku: iv.sku,
          articleCode: iv.sku,
          priceExcl: iv.price_excl,
          title,
        },
      }, defaultLanguage)
      const newId = res.variant.id
      variantIdMap.set(idx, newId)
      createdVariantsForDb.push({ variantId: newId, sku: iv.sku, index: idx })
      console.log(`[UPDATE] ✓ Created variant ${newId} (${iv.sku})`)
    }

    clearImageCache()

    // ─── Step 5: Fetch (for sortOrder update and DB sync) ───────────────────
    console.log('[UPDATE] Step 5: Fetching product images and variants...')
    const [productImagesRes, variantsRes] = await Promise.all([
      targetClient.getProductImages(productId, defaultLanguage),
      targetClient.getVariants(productId, defaultLanguage),
    ])
    console.log(`[UPDATE] ✓ Fetched ${productImagesRes.length} images, ${(variantsRes.variants ?? []).length} variants`)

    // ─── Step 5b: Product image swap (at most 2 calls) ──
    // Only way to change order = select product image. Swap: new first ↔ old first. S = 0 or 2.
    const intendedOrder = sortBySortOrder(intendedImages)
    const remainingCurrentIds = new Set(
      currentImages.filter((ci) => !toDeleteImages.some((d) => d.id === ci.id)).map((ci) => ci.id)
    )

    function resolveProductImageId(ii: UpdateImageInfo): number | null {
      const numericId = parseImageId(ii)
      if (numericId != null && remainingCurrentIds.has(numericId)) return numericId
      if (newProductImageIdsBySrc.has(ii.src)) return newProductImageIdsBySrc.get(ii.src)!
      const variantsUsingImage = intendedVariants.filter((v) => v.image?.src === ii.src)
      if (variantsUsingImage.length > 0) {
        const firstVariantIdx = intendedVariants.indexOf(variantsUsingImage[0])
        const variantId = variantIdMap.get(firstVariantIdx)
        if (variantId) {
          const fv = (variantsRes.variants ?? []).find((v) => v.id === variantId)
          const variantImageSrc =
            fv?.image && typeof fv.image === 'object' && 'src' in fv.image
              ? (fv.image as { src: string }).src
              : null
          if (variantImageSrc) {
            const match = productImagesRes.find((pi) => pi.src === variantImageSrc)
            if (match) return match.id
          }
        }
      }
      return null
    }

    const isExisting = (ii: UpdateImageInfo) => {
      const id = parseImageId(ii)
      return id != null && remainingCurrentIds.has(id)
    }
    const firstExistingIndex = intendedOrder.findIndex(isExisting)
    const firstIntended = intendedOrder[0]
    const newFirstId = firstIntended ? resolveProductImageId(firstIntended) : null
    const currentFirst = productImagesRes.find((p) => p.sortOrder === 1)

    let firstProductImageId: number | null = newFirstId ?? currentFirst?.id ?? null

    if (newFirstId != null && currentFirst != null && newFirstId !== currentFirst.id) {
      await targetClient.updateProductImage(
        productId,
        newFirstId,
        { productImage: { sortOrder: 1 } },
        defaultLanguage
      )
      await targetClient.updateProductImage(
        productId,
        currentFirst.id,
        { productImage: { sortOrder: 2 } },
        defaultLanguage
      )
      console.log(`[UPDATE] ✓ Product image swap: id=${newFirstId} -> 1, id=${currentFirst.id} -> 2`)
    } else if (newFirstId != null && !currentFirst && firstExistingIndex < 0) {
      await targetClient.updateProductImage(
        productId,
        newFirstId,
        { productImage: { sortOrder: 1 } },
        defaultLanguage
      )
      console.log(`[UPDATE] ✓ Set product image: id=${newFirstId} -> 1`)
    } else {
      console.log('[UPDATE] Step 5b: SortOrders – no swap needed, skipped')
    }

    // ─── Step 6b: Multi-language (product content + variant titles for additional languages) ──
    const additionalLanguages = targetLanguages.filter((l) => l !== defaultLanguage)
    if (additionalLanguages.length === 0) {
      console.log('[UPDATE] Step 6: Multi-language – no additional languages, skipped')
    } else {
      console.log('[UPDATE] Multi-language: updating additional languages:', additionalLanguages)
      for (const lang of additionalLanguages) {
        const langContent = intendedContentByLanguage[lang]
        if (!langContent) {
          console.warn(`[UPDATE] No content for language ${lang}, skipping`)
          continue
        }
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
        for (const [index, variantId] of variantIdMap) {
          const iv = intendedVariants[index]
          if (!iv) continue
          const variantLangTitle = sanitizeVariantTitle(iv.content_by_language[lang]?.title, iv.sku)
          await targetClient.updateVariant(variantId, { variant: { title: variantLangTitle } }, lang)
        }
        console.log(`[UPDATE] ✓ Variants updated for ${lang}`)
      }
    }

    // ─── Step 7: Derive productImageForDb, variantImagesForDb (same as create)
    const fetchedVariants = variantsRes.variants ?? []
    const variantImagesForDb: Record<number, VariantImageForDb> = {}

    for (const [index, variantId] of variantIdMap) {
      const fv = fetchedVariants.find((v) => v.id === variantId)
      const img = toImageForDb(fv?.image)
      if (img) {
        variantImagesForDb[variantId] = img
      }
    }

    let productImageForDb: ProductImageForDb = null
    // We set firstProductImageId to sortOrder=1 in step 5b - use it directly
    if (firstProductImageId != null) {
      const img = productImagesRes.find((p) => p.id === firstProductImageId)
      productImageForDb = toImageForDb(img)
    }
    if (!productImageForDb) {
      const firstImage = intendedOrder[0]
      const variantsUsingFirst = firstImage
        ? intendedVariants
            .filter((v) => v.image?.src === firstImage.src)
            .sort((a, b) => (a.is_default ? 0 : 1) - (b.is_default ? 0 : 1))
        : []
      if (variantsUsingFirst.length > 0) {
        const firstVariantIndex = intendedVariants.indexOf(variantsUsingFirst[0])
        const variantId = variantIdMap.get(firstVariantIndex)
        if (variantId) {
          productImageForDb = variantImagesForDb[variantId] ?? null
        }
      }
    }
    if (!productImageForDb) {
      const firstImage = intendedOrder[0]
      const firstImageTitle = (firstImage?.title ?? '').trim().toLowerCase()
      const sortOrder1Images = productImagesRes.filter((img) => img.sortOrder === 1)
      const productImg =
        sortOrder1Images.find((img) => (img.title ?? '').trim().toLowerCase() === firstImageTitle) ??
        sortOrder1Images[0] ??
        productImagesRes[0]
      productImageForDb = toImageForDb(productImg)
    }

    console.log('[UPDATE] ✓✓✓ Update complete')

    const toUpdate = intendedExisting.filter((iv) => {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      return cv != null && variantHasChanges(cv, iv, targetLanguages)
    })

    // Build updatedVariantImages (variantId -> image) and createdVariantImages (index -> image) for sync
    const updatedVariantImages: Record<number, VariantImageForDb> = {}
    const createdVariantImages: Record<number, VariantImageForDb> = {}
    for (const vid of toUpdate.map((v) => v.variant_id!)) {
      const img = variantImagesForDb[vid]
      if (img) updatedVariantImages[vid] = img
    }
    for (const { variantId, index } of createdVariantsForDb) {
      const img = variantImagesForDb[variantId]
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
