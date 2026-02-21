/**
 * Sync updated product to Supabase database
 *
 * After successfully updating a product in Lightspeed, updates the local
 * database to reflect: product fields, product_content, variant adds/updates/deletes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sortBySortOrder } from '@/lib/utils'
import type { UpdateVariantInfo, UpdateImageInfo, VariantImageForDb } from './update-product'

const LIGHTSPEED_API_BASE = 'https://api.webshopapp.com'

interface SyncUpdatedProductInput {
  supabase: SupabaseClient
  shopId: string
  productId: number
  defaultLanguage: string
  visibility: string
  contentByLanguage: Record<string, {
    title?: string
    fulltitle?: string
    description?: string
    content?: string
  }>
  /** Final variant list after update (for determining product image from variants) */
  intendedVariants: UpdateVariantInfo[]
  intendedImages: UpdateImageInfo[]
  createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }>
  deletedVariantIds: number[]
  updatedVariants: Array<{ variantId: number; variant: UpdateVariantInfo }>
  /** Variant images from API - variantId -> image (for updated variants) */
  updatedVariantImages?: Record<number, VariantImageForDb>
  /** Variant images from API - index -> image (for created variants) */
  createdVariantImages?: Record<number, VariantImageForDb>
}

/**
 * Sync product update to database:
 * - Update product (visibility, image, ls_updated_at)
 * - Update product_content
 * - Delete removed variants (cascades to variant_content)
 * - Update changed variants and variant_content
 * - Insert new variants and variant_content
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
    updatedVariantImages,
    createdVariantImages,
  } = input

  const now = new Date().toISOString()

  // Product image: first image in intended order (sort_order 1)
  const sortedImages = sortBySortOrder(intendedImages)
  const productImage = sortedImages[0]
    ? { src: sortedImages[0].src, thumb: sortedImages[0].thumb, title: sortedImages[0].title }
    : intendedVariants[0]?.image
      ? { src: intendedVariants[0].image!.src, thumb: intendedVariants[0].image!.thumb, title: intendedVariants[0].image!.title }
      : null

  const hasImages = intendedImages.length > 0 || intendedVariants.some((v) => v.image)
  const imagesLink = hasImages
    ? `${LIGHTSPEED_API_BASE}/${defaultLanguage}/products/${productId}/images.json`
    : null

  // 1. Update product
  const { error: productError } = await supabase
    .from('products')
    .update({
      visibility,
      image: productImage,
      images_link: imagesLink,
      ls_updated_at: now,
    })
    .eq('shop_id', shopId)
    .eq('lightspeed_product_id', productId)

  if (productError) {
    console.error('[DB] Failed to update product:', productError)
    throw new Error(`Failed to sync product: ${productError.message}`)
  }

  // 2. Update product_content
  for (const [langCode, content] of Object.entries(contentByLanguage)) {
    const { error: contentError } = await supabase
      .from('product_content')
      .update({
        title: content.title ?? null,
        fulltitle: content.fulltitle ?? null,
        description: content.description ?? null,
        content: content.content ?? null,
      })
      .eq('shop_id', shopId)
      .eq('lightspeed_product_id', productId)
      .eq('language_code', langCode)

    if (contentError) {
      console.error('[DB] Failed to update product content:', contentError)
      throw new Error(`Failed to sync product content: ${contentError.message}`)
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

  // 4. Update changed variants
  for (const { variantId, variant } of updatedVariants) {
    const variantImage = updatedVariantImages?.[variantId] ?? variant.image
    console.log(`[DEBUG] sync-updated variant ${variantId} (${variant.sku}): using ${updatedVariantImages?.[variantId] ? 'API response' : 'intended'}`)
    const { error: variantError } = await supabase
      .from('variants')
      .update({
        sku: variant.sku,
        is_default: variant.is_default,
        sort_order: variant.sort_order,
        price_excl: variant.price_excl,
        image: variantImage,
      })
      .eq('shop_id', shopId)
      .eq('lightspeed_variant_id', variantId)

    if (variantError) {
      console.error('[DB] Failed to update variant:', variantError)
      throw new Error(`Failed to sync variant: ${variantError.message}`)
    }

    for (const langCode of Object.keys(contentByLanguage)) {
      const title = variant.content_by_language?.[langCode]?.title ?? variant.sku
      const { error: vcError } = await supabase
        .from('variant_content')
        .upsert(
          {
            shop_id: shopId,
            lightspeed_variant_id: variantId,
            language_code: langCode,
            title: title || variant.sku,
          },
          { onConflict: 'shop_id,lightspeed_variant_id,language_code' }
        )

      if (vcError) {
        console.error('[DB] Failed to update variant content:', vcError)
        throw new Error(`Failed to sync variant content: ${vcError.message}`)
      }
    }
  }

  // 5. Insert new variants
  for (const { variantId, index } of createdVariantsForDb) {
    const variant = intendedVariants[index]
    if (!variant) continue

    const variantImage = createdVariantImages?.[index] ?? null
    console.log(`[DEBUG] sync-updated new variant index=${index} (${variant.sku}): using ${createdVariantImages?.[index] ? 'API response' : 'null (no fallback)'}`)
    const { error: variantError } = await supabase.from('variants').insert({
      shop_id: shopId,
      lightspeed_variant_id: variantId,
      lightspeed_product_id: productId,
      sku: variant.sku,
      is_default: variant.is_default,
      sort_order: variant.sort_order,
      price_excl: variant.price_excl,
      image: variantImage,
    })

    if (variantError) {
      console.error('[DB] Failed to insert variant:', variantError)
      throw new Error(`Failed to sync variant: ${variantError.message}`)
    }

    const variantContentRows = Object.keys(contentByLanguage).map((langCode) => ({
      shop_id: shopId,
      lightspeed_variant_id: variantId,
      language_code: langCode,
      title: variant.content_by_language?.[langCode]?.title ?? variant.sku ?? '',
    }))

    const { error: variantContentError } = await supabase
      .from('variant_content')
      .insert(variantContentRows)

    if (variantContentError) {
      console.error('[DB] Failed to insert variant content:', variantContentError)
      throw new Error(`Failed to sync variant content: ${variantContentError.message}`)
    }
  }

  console.log('[DB] ✓ Product update synced to database')
}
