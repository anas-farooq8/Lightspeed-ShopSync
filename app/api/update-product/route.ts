import { NextRequest, NextResponse } from 'next/server'
import { getLightspeedClient } from '@/lib/services/lightspeed-api'
import { updateProduct } from '@/lib/services/update-product'
import { syncUpdatedProductToDb } from '@/lib/services/sync-updated-product-to-db'
import { HTTP_STATUS, handleRouteError, isRequireUserFailure, requireUser } from '@/lib/api'
import type { Language } from '@/types/product'

/**
 * Update Product API
 *
 * Method: PUT
 * Path: /api/update-product
 *
 * Description:
 * - Updates an existing product in the target Lightspeed shop and syncs it to the local database.
 *
 * Auth:
 * - Required (Supabase user session).
 *
 * Request body:
 * - targetShopTld: string
 * - shopId: string
 * - sku: string (to identify the product)
 * - updateProductData: { visibility, content_by_language, variants, images }
 * - targetShopLanguages: Language[] (target shop's language configuration)
 *
 * Responses:
 * - 200: Product updated (with optional warning if DB sync failed).
 * - 400: Validation error (missing required fields or content).
 * - 401: Unauthorized (no valid Supabase user).
 * - 404: Product not found.
 * - 500: Internal server error.
 */

interface UpdateProductRequest {
  targetShopTld: string
  shopId: string
  sku: string
  updateProductData: {
    visibility: string
    content_by_language: Record<string, {
      title?: string
      fulltitle?: string
      description?: string
      content?: string
    }>
    variants: Array<{
      variant_id?: number | null
      sku: string
      is_default: boolean
      sort_order: number
      price_excl: number
      image: {
        src: string
        thumb?: string
        title?: string
        sort_order?: number
        id?: string
      } | null
      content_by_language: Record<string, { title?: string }>
    }>
    images: Array<{
      src: string
      thumb?: string
      title?: string
      sort_order: number
      id: string
      addedFromSource?: boolean
    }>
  }
  /** Target shop's language configuration from product-details API */
  targetShopLanguages: Language[]
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const auth = await requireUser()

    if (isRequireUserFailure(auth)) {
      return auth.response
    }

    const { supabase } = auth

    // Parse request body
    const body: UpdateProductRequest = await request.json()
    const { targetShopTld, shopId, sku, updateProductData, targetShopLanguages } = body

    // Validate request
    if (!targetShopTld || !shopId || !sku || !updateProductData) {
      return NextResponse.json(
        { error: 'Missing required fields: targetShopTld, shopId, sku, updateProductData' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    if (!targetShopLanguages || targetShopLanguages.length === 0) {
      return NextResponse.json(
        { error: 'Missing target shop languages configuration' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    console.log('[API] Updating product for target shop:', targetShopTld, 'SKU:', sku)

    // Get default language from target shop configuration
    const defaultLanguageConfig = targetShopLanguages.find((lang: Language) => lang.is_default)
    const defaultLanguage = defaultLanguageConfig?.code || targetShopLanguages[0]?.code
    
    if (!defaultLanguage) {
      return NextResponse.json(
        { error: 'Could not determine default language for target shop' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    // Get all target languages
    const targetLanguageCodes = targetShopLanguages.map((lang: Language) => lang.code)
    
    // Validate that we have content for the required languages
    const availableLanguages = Object.keys(updateProductData.content_by_language)
    const missingLanguages = targetLanguageCodes.filter((lang: string) => !availableLanguages.includes(lang))
    
    if (missingLanguages.length > 0) {
      console.warn('[API] Missing content for languages:', missingLanguages.join(', '))
    }
    
    console.log('[API] Default language:', defaultLanguage)
    console.log('[API] Target languages:', targetLanguageCodes.join(', '))

    // Find the existing product in database by SKU
    const { data: existingVariant, error: variantError } = await supabase
      .from('variants')
      .select('lightspeed_product_id, shop_id')
      .eq('shop_id', shopId)
      .eq('sku', sku)
      .eq('is_default', true)
      .single()

    if (variantError || !existingVariant) {
      console.error('[API] Product not found:', variantError)
      return NextResponse.json(
        { error: 'Product not found in target shop' },
        { status: HTTP_STATUS.NOT_FOUND }
      )
    }

    const lightspeedProductId = existingVariant.lightspeed_product_id

    console.log('[API] Found existing product ID:', lightspeedProductId)

    // Load current state from DB
    const { data: productRow } = await supabase
      .from('products')
      .select('visibility')
      .eq('shop_id', shopId)
      .eq('lightspeed_product_id', lightspeedProductId)
      .single()

    const { data: productContentRows } = await supabase
      .from('product_content')
      .select('language_code, title, fulltitle, description, content')
      .eq('shop_id', shopId)
      .eq('lightspeed_product_id', lightspeedProductId)

    const { data: variantRows } = await supabase
      .from('variants')
      .select('lightspeed_variant_id, sku, is_default, sort_order, price_excl, image')
      .eq('shop_id', shopId)
      .eq('lightspeed_product_id', lightspeedProductId)

    const variantIds = (variantRows ?? []).map((v: { lightspeed_variant_id: number }) => v.lightspeed_variant_id)
    const { data: variantContentRows } = variantIds.length > 0
      ? await supabase
          .from('variant_content')
          .select('lightspeed_variant_id, language_code, title')
          .eq('shop_id', shopId)
          .in('lightspeed_variant_id', variantIds)
      : { data: [] as { lightspeed_variant_id: number; language_code: string; title: string | null }[] }

    const currentContentByLanguage: Record<string, { title?: string; fulltitle?: string; description?: string; content?: string }> = {}
    for (const row of productContentRows ?? []) {
      currentContentByLanguage[row.language_code] = {
        title: row.title ?? undefined,
        fulltitle: row.fulltitle ?? undefined,
        description: row.description ?? undefined,
        content: row.content ?? undefined,
      }
    }

    const variantContentByVariant = new Map<number, Record<string, { title?: string }>>()
    for (const row of variantContentRows ?? []) {
      if (!variantContentByVariant.has(row.lightspeed_variant_id)) {
        variantContentByVariant.set(row.lightspeed_variant_id, {})
      }
      variantContentByVariant.get(row.lightspeed_variant_id)![row.language_code] = { title: row.title ?? undefined }
    }

    const currentVariants = (variantRows ?? []).map((v: {
      lightspeed_variant_id: number
      sku: string | null
      is_default: boolean | null
      sort_order: number | null
      price_excl: number | null
      image: unknown
    }) => ({
      lightspeed_variant_id: v.lightspeed_variant_id,
      sku: v.sku ?? '',
      is_default: v.is_default ?? false,
      sort_order: v.sort_order ?? 0,
      price_excl: Number(v.price_excl ?? 0),
      image: v.image as { src?: string; thumb?: string; title?: string } | null,
      content_by_language: variantContentByVariant.get(v.lightspeed_variant_id) ?? {},
    }))

    const targetClient = getLightspeedClient(targetShopTld)

    // Fetch current product images from Lightspeed (for diff: delete, detect new)
    let currentImages: Array<{ id: number; sortOrder: number; src: string; thumb?: string; title?: string }> = []
    try {
      currentImages = await targetClient.getProductImages(lightspeedProductId, defaultLanguage)
    } catch (imgErr) {
      console.warn('[API] Could not fetch current product images:', imgErr)
    }

    const result = await updateProduct({
      targetClient,
      productId: lightspeedProductId,
      defaultLanguage,
      targetLanguages: targetLanguageCodes,
      currentVisibility: productRow?.visibility ?? 'visible',
      currentContentByLanguage,
      currentVariants,
      currentImages,
      intendedVisibility: updateProductData.visibility,
      intendedContentByLanguage: updateProductData.content_by_language,
      intendedVariants: updateProductData.variants.map((v) => ({
        variant_id: v.variant_id ?? null,
        sku: v.sku,
        is_default: v.is_default,
        sort_order: v.sort_order,
        price_excl: v.price_excl,
        image: v.image,
        content_by_language: v.content_by_language ?? {},
      })),
      intendedImages: updateProductData.images.map((img) => ({
        src: img.src,
        thumb: img.thumb,
        title: img.title,
        sort_order: img.sort_order,
        id: img.id,
        addedFromSource: img.addedFromSource,
      })),
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update product' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        productId: lightspeedProductId,
        skipped: true,
        message: 'No changes detected, nothing to update',
      })
    }

    // Sync to database
    try {
      const variants = updateProductData.variants
      const updatedVariantsList =
        result.updatedVariants?.map((vid: number) => {
          const idx = variants.findIndex((v: { variant_id?: number | null }) => v.variant_id === vid)
          const iv = idx >= 0 ? variants[idx] : null
          return iv
            ? {
                variantId: vid,
                variant: {
                  variant_id: iv.variant_id ?? null,
                  sku: iv.sku,
                  is_default: iv.is_default,
                  sort_order: idx + 1,
                  price_excl: iv.price_excl,
                  image: iv.image,
                  content_by_language: iv.content_by_language ?? {},
                },
              }
            : null
        }).filter(Boolean) ?? []

      await syncUpdatedProductToDb({
        supabase,
        shopId,
        productId: lightspeedProductId,
        defaultLanguage,
        visibility: updateProductData.visibility,
        contentByLanguage: updateProductData.content_by_language,
        intendedVariants: variants.map((v, idx) => ({
          variant_id: v.variant_id ?? null,
          sku: v.sku,
          is_default: v.is_default,
          sort_order: idx + 1,
          price_excl: v.price_excl,
          image: v.image as { src: string; thumb?: string; title?: string } | null,
          content_by_language: v.content_by_language ?? {},
        })),
        intendedImages: updateProductData.images,
        createdVariantsForDb: result.createdVariantsForDb ?? [],
        deletedVariantIds: result.deletedVariants ?? [],
        updatedVariants: updatedVariantsList as Array<{ variantId: number; variant: import('@/lib/services/update-product').UpdateVariantInfo }>,
        productImageForDb: result.productImageForDb,
        updatedVariantImages: result.updatedVariantImages,
        createdVariantImages: result.createdVariantImages,
      })
      console.log('[API] ✓ Product update synced to database')
    } catch (dbError) {
      console.error('[API] Database sync failed (product was updated in Lightspeed):', dbError)
      return NextResponse.json(
        {
          success: true,
          productId: lightspeedProductId,
          warning: 'Product updated in Lightspeed but database sync failed. Run full sync to update.',
          message: 'Product updated successfully in target shop',
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      productId: lightspeedProductId,
      message: 'Product updated successfully in target shop',
    })

  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in update-product route:',
      includeErrorMessage: true,
    })
  }
}
