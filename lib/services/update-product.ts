/**
 * Update Product Service
 *
 * Diff-based update: only calls Lightspeed API for fields that changed.
 * - Product: visibility, title, fulltitle, description, content (per language)
 * - Variants: delete removed, update changed, create new (from source)
 *
 * Variant delete: we only delete the variant record; no image deletion.
 * Variant image: only update when user picks a new image (base64). If user removes image, leave as-is.
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
}

export interface UpdateProductInput {
  targetClient: LightspeedAPIClient
  productId: number
  defaultLanguage: string
  targetLanguages: string[]

  /** Current state from DB */
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

  /** Intended state from editor */
  intendedVisibility: string
  intendedContentByLanguage: Record<string, { title?: string; fulltitle?: string; description?: string; content?: string }>
  intendedVariants: UpdateVariantInfo[]
}

export interface UpdateProductResult {
  success: boolean
  skipped?: boolean
  productId?: number
  updatedVariants?: number[]
  createdVariantsForDb?: Array<{ variantId: number; sku: string; index: number }>
  deletedVariants?: number[]
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

export async function updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
  const {
    targetClient,
    productId,
    defaultLanguage,
    targetLanguages,
    currentVisibility,
    currentContentByLanguage,
    currentVariants,
    intendedVisibility,
    intendedContentByLanguage,
    intendedVariants,
  } = input

  try {
    // ─── Compute diff ─────────────────────────────────────────────────────
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
    const toDelete = currentVariants.filter(
      (cv) => !intendedVariants.some((iv) => iv.variant_id === cv.lightspeed_variant_id)
    )

    const toUpdate = intendedExisting.filter((iv) => {
      const cv = currentVariants.find((c) => c.lightspeed_variant_id === iv.variant_id!)
      if (!cv) return false
      return (
        cv.sku !== iv.sku ||
        cv.is_default !== iv.is_default ||
        cv.sort_order !== iv.sort_order ||
        cv.price_excl !== iv.price_excl ||
        !isSameImage(cv.image, iv.image) ||
        targetLanguages.some(
          (lang) =>
            (cv.content_by_language?.[lang]?.title ?? '') !== (iv.content_by_language[lang]?.title ?? '')
        )
      )
    })

    const hasVariantChanges = toDelete.length > 0 || toUpdate.length > 0 || intendedNew.length > 0

    if (!productChanged && !hasVariantChanges) {
      console.log('[UPDATE] No changes detected, skipping API calls')
      return { success: true, skipped: true, productId }
    }

    console.log('[UPDATE] Applying changes:', {
      product: productChanged,
      variants: { toDelete: toDelete.length, toUpdate: toUpdate.length, toCreate: intendedNew.length },
    })

    // ─── 1. Update product fields (visibility, content) ────────────────────
    if (productChanged) {
      for (const lang of targetLanguages) {
        const content = intendedContentByLanguage[lang]
        if (!content) continue

        await targetClient.updateProduct(
          productId,
          {
            product: {
              ...(lang === defaultLanguage ? { visibility: intendedVisibility } : {}),
              title: content.title,
              fulltitle: content.fulltitle,
              description: content.description,
              content: content.content,
            },
          },
          lang
        )
        console.log(`[UPDATE] ✓ Product updated for language: ${lang}`)
      }
    }

    // ─── 2. Delete variants ─────────────────────────────────────────────────
    for (const v of toDelete) {
      await targetClient.deleteVariant(v.lightspeed_variant_id, defaultLanguage)
      console.log(`[UPDATE] ✓ Deleted variant: ${v.lightspeed_variant_id}`)
    }

    // ─── 3. Update variants ─────────────────────────────────────────────────
    for (const iv of toUpdate) {
      const sortOrder = intendedVariants.indexOf(iv) + 1
      const payload: Parameters<typeof targetClient.updateVariant>[1] = {
        variant: {
          sku: iv.sku,
          articleCode: iv.sku,
          isDefault: iv.is_default,
          sortOrder,
          priceExcl: iv.price_excl,
          title: sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku),
        },
      }

      if (iv.image?.src) {
        const imageData = await downloadImage(iv.image.src)
        const filename = (iv.image.title?.trim() || 'image') + '.' + imageData.extension
        payload.variant!.image = { attachment: imageData.base64, filename }
      }

      await targetClient.updateVariant(iv.variant_id!, payload, defaultLanguage)
      console.log(`[UPDATE] ✓ Updated variant: ${iv.variant_id}`)

      for (const lang of targetLanguages.filter((l) => l !== defaultLanguage)) {
        const title = sanitizeVariantTitle(iv.content_by_language[lang]?.title, iv.sku)
        if (title) {
          await targetClient.updateVariant(
            iv.variant_id!,
            { variant: { title } },
            lang
          )
        }
      }
    }

    // ─── 4. Create new variants (from source) ───────────────────────────────
    const createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }> = []
    const sortedNew = [...intendedNew].sort(
      (a, b) => intendedVariants.indexOf(a) - intendedVariants.indexOf(b)
    )

    for (let i = 0; i < sortedNew.length; i++) {
      const iv = sortedNew[i]
      const sortOrder = intendedVariants.indexOf(iv) + 1
      const title = sanitizeVariantTitle(iv.content_by_language[defaultLanguage]?.title, iv.sku)

      const createPayload: Parameters<typeof targetClient.createVariant>[0] = {
        variant: {
          product: productId,
          isDefault: iv.is_default,
          sortOrder,
          sku: iv.sku,
          articleCode: iv.sku,
          priceExcl: iv.price_excl,
          title,
        },
      }

      if (iv.image?.src) {
        const imageData = await downloadImage(iv.image.src)
        const filename = (iv.image.title?.trim() || 'image') + '.' + imageData.extension
        createPayload.variant.image = { attachment: imageData.base64, filename }
      }

      const res = await targetClient.createVariant(createPayload, defaultLanguage)
      const newId = res.variant.id
      createdVariantsForDb.push({ variantId: newId, sku: iv.sku, index: intendedVariants.indexOf(iv) })

      for (const lang of targetLanguages.filter((l) => l !== defaultLanguage)) {
        const langTitle = sanitizeVariantTitle(iv.content_by_language[lang]?.title, iv.sku)
        if (langTitle) {
          await targetClient.updateVariant(newId, { variant: { title: langTitle } }, lang)
        }
      }
      console.log(`[UPDATE] ✓ Created variant: ${newId} (${iv.sku})`)
    }

    clearImageCache()
    console.log('[UPDATE] ✓✓✓ Update complete')

    return {
      success: true,
      productId,
      updatedVariants: toUpdate.map((v) => v.variant_id!),
      createdVariantsForDb,
      deletedVariants: toDelete.map((v) => v.lightspeed_variant_id),
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
