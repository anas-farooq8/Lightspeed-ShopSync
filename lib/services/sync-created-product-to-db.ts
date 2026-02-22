/**
 * Sync created product to Supabase database
 *
 * After successfully creating a product in Lightspeed, inserts the new product
 * and variants into our Supabase tables so the sync operations view stays in sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { VariantInfo, ImageInfo, ProductImageForDb } from './create-product'
import { LIGHTSPEED_API_BASE } from './lightspeed-api'
import { insertProductOperationLog } from './product-operation-log'

interface SyncCreatedProductInput {
  supabase: SupabaseClient
  shopId: string
  productId: number
  defaultLanguage: string
  visibility: string
  contentByLanguage: Record<string, {
    title: string
    fulltitle?: string
    description?: string
    content?: string
  }>
  variants: VariantInfo[]
  createdVariantsForDb: Array<{ variantId: number; sku: string; index: number }>
  images: ImageInfo[]
  /** First image created (product or variant) from Lightspeed API - use for product.image */
  productImageForDb?: ProductImageForDb
  /** Variant images from Lightspeed API - index -> { src, thumb, title } */
  variantImagesForDb?: Record<number, { src: string; thumb?: string; title?: string }>
  /** Source product (create only) for product_operation_logs */
  sourceShopId?: string | null
  sourceLightspeedProductId?: number | null
}

/**
 * Insert newly created product and variants into Supabase
 */
export async function syncCreatedProductToDb(input: SyncCreatedProductInput): Promise<void> {
  const {
    supabase,
    shopId,
    productId,
    defaultLanguage,
    visibility,
    contentByLanguage,
    variants,
    createdVariantsForDb,
    images,
    productImageForDb: productImageFromApi,
    variantImagesForDb,
    sourceShopId = null,
    sourceLightspeedProductId = null,
  } = input

  const now = new Date().toISOString()

  // Product image: use first created image from Lightspeed API response (product or variant).
  // If not provided, use null (no fallback).
  const productImageForProduct = productImageFromApi ?? null
  console.log('[DEBUG] sync-created-product: productImageFromApi:', productImageFromApi ? JSON.stringify(productImageFromApi) : 'null')
  console.log('[DEBUG] sync-created-product: variantImagesForDb keys:', variantImagesForDb ? Object.keys(variantImagesForDb) : 'none')

  // images_link: Lightspeed product images API URL. Set when product has images, else null.
  const hasImages = images.length > 0 || variants.some(v => v.image)
  const imagesLink = hasImages
    ? `${LIGHTSPEED_API_BASE}/${defaultLanguage}/products/${productId}/images.json`
    : null

  // Insert product
  const { error: productError } = await supabase.from('products').insert({
    shop_id: shopId,
    lightspeed_product_id: productId,
    visibility,
    image: productImageForProduct,
    images_link: imagesLink,
    ls_created_at: now,
    ls_updated_at: now,
  })

  if (productError) {
    console.error('[DB] Failed to insert product:', productError)
    throw new Error(`Failed to sync product to database: ${productError.message}`)
  }

  // Insert product_content for each language
  const productContentRows = Object.entries(contentByLanguage).map(([langCode, content]) => ({
    shop_id: shopId,
    lightspeed_product_id: productId,
    language_code: langCode,
    title: content.title ?? null,
    fulltitle: content.fulltitle ?? null,
    description: content.description ?? null,
    content: content.content ?? null,
  }))

  const { error: contentError } = await supabase.from('product_content').insert(productContentRows)

  if (contentError) {
    console.error('[DB] Failed to insert product content:', contentError)
    throw new Error(`Failed to sync product content: ${contentError.message}`)
  }

  // Insert variants
  for (const { variantId, index } of createdVariantsForDb) {
    const variant = variants[index]
    if (!variant) continue

    // Use variant image from Lightspeed API response only. No fallback to source - use null when no response.
    const variantImage = variantImagesForDb?.[index] ?? null
    console.log(`[DEBUG] sync variant index=${index} sku=${variant.sku}: using ${variantImagesForDb?.[index] ? 'API response' : 'null (no fallback)'}`)

    const { error: variantError } = await supabase.from('variants').insert({
      shop_id: shopId,
      lightspeed_variant_id: variantId,
      lightspeed_product_id: productId,
      sku: variant.sku,
      is_default: variant.is_default,
      sort_order: variant.sort_order ?? index,
      price_excl: variant.price_excl,
      image: variantImage,
    })

    if (variantError) {
      console.error('[DB] Failed to insert variant:', variantError)
      throw new Error(`Failed to sync variant: ${variantError.message}`)
    }

    // Insert variant_content for each language
    const variantContentRows = Object.keys(contentByLanguage).map((langCode) => {
      const title = variant.content_by_language?.[langCode]?.title ?? variant.sku
      return {
        shop_id: shopId,
        lightspeed_variant_id: variantId,
        language_code: langCode,
        title: title || variant.sku,
      }
    })

    const { error: variantContentError } = await supabase.from('variant_content').insert(variantContentRows)

    if (variantContentError) {
      console.error('[DB] Failed to insert variant content:', variantContentError)
      throw new Error(`Failed to sync variant content: ${variantContentError.message}`)
    }
  }

  console.log('[DB] ✓ Product and variants synced to database')

  // Insert product operation log
  const changes: string[] = []
  if (variants.length > 0) {
    changes.push(`${variants.length} variant${variants.length !== 1 ? 's' : ''}`)
  }
  if (images.length > 0) {
    changes.push(`${images.length} image${images.length !== 1 ? 's' : ''}`)
  }
  await insertProductOperationLog({
    supabase,
    shopId,
    lightspeedProductId: productId,
    operationType: 'create',
    status: 'success',
    details: { changes },
    sourceShopId,
    sourceLightspeedProductId,
  })
}
