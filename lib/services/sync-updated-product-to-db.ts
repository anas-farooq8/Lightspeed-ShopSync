/**
 * Sync updated product to Supabase database
 *
 * After successfully updating a product in Lightspeed, updates the local
 * database to reflect only the changes that were made.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { UpdateVariantInfo, UpdateImageInfo, VariantImageForDb, ProductImageForDb } from './update-product'
import { LIGHTSPEED_API_BASE } from './lightspeed-api'
import { insertProductOperationLog } from './product-operation-log'

type ContentByLanguage = Record<string, { title?: string; fulltitle?: string; description?: string; content?: string }>

interface CurrentVariantForDiff {
  lightspeed_variant_id: number
  sku: string
  is_default: boolean
  sort_order: number
  price_excl: number
  image: { src?: string } | null
  content_by_language?: Record<string, { title?: string }>
}

function buildVariantContentRows(
  shopId: string,
  variantId: number,
  variant: UpdateVariantInfo,
  langCodes: string[]
): Array<{ shop_id: string; lightspeed_variant_id: number; language_code: string; title: string }> {
  return langCodes.map((langCode) => ({
    shop_id: shopId,
    lightspeed_variant_id: variantId,
    language_code: langCode,
    title: variant.content_by_language?.[langCode]?.title ?? variant.sku ?? '',
  }))
}

interface SyncUpdatedProductInput {
  supabase: SupabaseClient
  shopId: string
  productId: number
  defaultLanguage: string
  visibility: string
  contentByLanguage: ContentByLanguage
  intendedVariants: UpdateVariantInfo[]
  intendedImages: UpdateImageInfo[]
  createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }>
  deletedVariantIds: number[]
  updatedVariants: Array<{ variantId: number; variant: UpdateVariantInfo }>
  /** Product image from API only - no fallback */
  productImageForDb?: ProductImageForDb
  /** Variant images from API - variantId -> image or null (for updated variants) */
  updatedVariantImages?: Record<number, VariantImageForDb | null>
  /** Variant images from API - index -> image (for created variants) */
  createdVariantImages?: Record<number, VariantImageForDb>
  /** For optimization: only update what changed */
  productChanged?: boolean
  contentChangedByLanguage?: Record<string, boolean>
  hasImageChanges?: boolean
  /** Current variants (before update) - for diffing variant fields and variant_content */
  currentVariants?: CurrentVariantForDiff[]
  /** Human-readable changes for product_operation_logs */
  changes?: string[]
}

/**
 * Sync product update to database – only updates changed fields.
 */
export async function syncUpdatedProductToDb(input: SyncUpdatedProductInput): Promise<void> {
  const {
    supabase,
    shopId,
    productId,
    defaultLanguage,
    visibility,
    contentByLanguage,
    intendedVariants,
    intendedImages,
    createdVariantsForDb,
    deletedVariantIds,
    updatedVariants,
    productImageForDb,
    updatedVariantImages,
    createdVariantImages,
    productChanged = true,
    contentChangedByLanguage,
    hasImageChanges = false,
    currentVariants = [],
    changes = [],
  } = input

  const now = new Date().toISOString()

  const hasImages = intendedImages.length > 0 || intendedVariants.some((v) => v.image)
  const imagesLink = hasImages
    ? `${LIGHTSPEED_API_BASE}/${defaultLanguage}/products/${productId}/images.json`
    : null

  const productUpdate: Record<string, unknown> = { ls_updated_at: now }
  if (productChanged) {
    productUpdate.visibility = visibility
    productUpdate.images_link = imagesLink
  } else if (hasImageChanges) {
    productUpdate.images_link = imagesLink
  }
  if (productImageForDb !== undefined) {
    productUpdate.image = productImageForDb ?? null
  }

  const { error: productError } = await supabase
    .from('products')
    .update(productUpdate)
    .eq('shop_id', shopId)
    .eq('lightspeed_product_id', productId)

  if (productError) {
    console.error('[DB] Failed to update product:', productError)
    throw new Error(`Failed to sync product: ${productError.message}`)
  }

  // 2. Update product_content – only changed languages (batch upsert)
  const langsToUpdate = contentChangedByLanguage
    ? Object.entries(contentChangedByLanguage)
        .filter(([, changed]) => changed)
        .map(([lang]) => lang)
    : Object.keys(contentByLanguage)

  if (langsToUpdate.length > 0) {
    const productContentRows = langsToUpdate
      .map((langCode) => {
        const content = contentByLanguage[langCode]
        if (!content) return null
        return {
          shop_id: shopId,
          lightspeed_product_id: productId,
          language_code: langCode,
          title: content.title ?? null,
          fulltitle: content.fulltitle ?? null,
          description: content.description ?? null,
          content: content.content ?? null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (productContentRows.length > 0) {
      const { error: contentError } = await supabase
        .from('product_content')
        .upsert(productContentRows, { onConflict: 'shop_id,lightspeed_product_id,language_code' })

      if (contentError) {
        console.error('[DB] Failed to update product content:', contentError)
        throw new Error(`Failed to sync product content: ${contentError.message}`)
      }
    }
  }

  // 3. Delete removed variants (cascades to variant_content)
  if (deletedVariantIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('variants')
      .delete()
      .eq('shop_id', shopId)
      .in('lightspeed_variant_id', deletedVariantIds)

    if (deleteError) {
      console.error('[DB] Failed to delete variants:', deleteError)
      throw new Error(`Failed to sync variants (delete): ${deleteError.message}`)
    }
  }

  // 4. Update changed variants – only changed fields
  const variantContentRowsToUpsert: Array<{ shop_id: string; lightspeed_variant_id: number; language_code: string; title: string }> = []

  for (const { variantId, variant } of updatedVariants) {
    const cv = currentVariants.find((c) => c.lightspeed_variant_id === variantId)

    const variantUpdate: Record<string, unknown> = {}
    if (!cv || cv.sku !== variant.sku) variantUpdate.sku = variant.sku
    if (!cv || cv.is_default !== variant.is_default) variantUpdate.is_default = variant.is_default
    if (!cv || cv.sort_order !== variant.sort_order) variantUpdate.sort_order = variant.sort_order
    if (!cv || cv.price_excl !== variant.price_excl) variantUpdate.price_excl = variant.price_excl
    if (updatedVariantImages?.[variantId] !== undefined) {
      variantUpdate.image = updatedVariantImages[variantId] ?? null
    }

    if (Object.keys(variantUpdate).length > 0) {
      const { error: variantError } = await supabase
        .from('variants')
        .update(variantUpdate)
        .eq('shop_id', shopId)
        .eq('lightspeed_variant_id', variantId)

      if (variantError) {
        console.error('[DB] Failed to update variant:', variantError)
        throw new Error(`Failed to sync variant: ${variantError.message}`)
      }
    }

    // Variant content – only changed languages (collect for batch upsert)
    const langCodes = Object.keys(contentByLanguage)
    const vcLangsToUpdate = cv
      ? langCodes.filter(
          (lang) =>
            (cv.content_by_language?.[lang]?.title ?? '') !== (variant.content_by_language?.[lang]?.title ?? '')
        )
      : langCodes

    if (vcLangsToUpdate.length > 0) {
      const vcRows = buildVariantContentRows(shopId, variantId, variant, vcLangsToUpdate)
      for (const row of vcRows) {
        variantContentRowsToUpsert.push({ ...row, title: row.title || variant.sku })
      }
    }
  }

  if (variantContentRowsToUpsert.length > 0) {
    const { error: vcError } = await supabase
      .from('variant_content')
      .upsert(variantContentRowsToUpsert, { onConflict: 'shop_id,lightspeed_variant_id,language_code' })

    if (vcError) {
      console.error('[DB] Failed to update variant content:', vcError)
      throw new Error(`Failed to sync variant content: ${vcError.message}`)
    }
  }

  // 5. Insert new variants (batch, like sync-created-product-to-db)
  if (createdVariantsForDb.length > 0) {
    const variantRows = createdVariantsForDb
      .map(({ variantId, index }) => {
        const variant = intendedVariants[index]
        if (!variant) return null
        const variantImage = createdVariantImages?.[index] ?? null
        return {
          shop_id: shopId,
          lightspeed_variant_id: variantId,
          lightspeed_product_id: productId,
          sku: variant.sku,
          is_default: variant.is_default,
          sort_order: variant.sort_order,
          price_excl: variant.price_excl,
          image: variantImage,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (variantRows.length > 0) {
      const { error: variantError } = await supabase.from('variants').insert(variantRows)
      if (variantError) {
        console.error('[DB] Failed to insert variants:', variantError)
        throw new Error(`Failed to sync variants: ${variantError.message}`)
      }
    }

    const allVariantContentRows: Array<{
      shop_id: string
      lightspeed_variant_id: number
      language_code: string
      title: string
    }> = []
    for (const { variantId, index } of createdVariantsForDb) {
      const variant = intendedVariants[index]
      if (!variant) continue
      for (const langCode of Object.keys(contentByLanguage)) {
        const title = variant.content_by_language?.[langCode]?.title ?? variant.sku
        allVariantContentRows.push({
          shop_id: shopId,
          lightspeed_variant_id: variantId,
          language_code: langCode,
          title: title || variant.sku,
        })
      }
    }
    if (allVariantContentRows.length > 0) {
      const { error: variantContentError } = await supabase
        .from('variant_content')
        .insert(allVariantContentRows)
      if (variantContentError) {
        console.error('[DB] Failed to insert variant content:', variantContentError)
        throw new Error(`Failed to sync variant content: ${variantContentError.message}`)
      }
    }
  }

  console.log('[DB] ✓ Product update synced to database')

  await insertProductOperationLog({
    supabase,
    shopId,
    lightspeedProductId: productId,
    operationType: 'edit',
    status: 'success',
    details: { changes },
  })
}
