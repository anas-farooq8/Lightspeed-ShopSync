import { NextRequest, NextResponse } from 'next/server'
import { getLightspeedClient } from '@/lib/services/lightspeed-api'
import { updateProduct, type UpdateVariantInfo } from '@/lib/services/update-product'
import { syncUpdatedProductToDb } from '@/lib/services/sync-updated-product-to-db'
import { insertProductOperationLog } from '@/lib/services/product-operation-log'
import { HTTP_STATUS, handleRouteError, isRequireUserFailure, requireUser } from '@/lib/api'
import { getDefaultLanguageCode } from '@/lib/utils'
import type { Language } from '@/types/product'

/**
 * Update Product API
 *
 * Method: PUT
 * Path: /api/update-product
 *
 * Description:
 * - Updates an existing product in the target Lightspeed shop and syncs it to the local database.
 * - Uses currentState from the request (product-details) instead of loading from DB.
 *
 * Auth:
 * - Required (Supabase user session).
 *
 * Request body:
 * - targetShopTld: string
 * - shopId: string
 * - productId: number (Lightspeed product ID from product-details target)
 * - updateProductData: { visibility, content_by_language, variants, images }
 * - currentState: { visibility, content_by_language, variants } from product-details
 * - targetShopLanguages: Language[] (target shop's language configuration)
 *
 * Responses:
 * - 200: Product updated (with optional warning if DB sync failed).
 * - 400: Validation error (missing required fields or content).
 * - 401: Unauthorized (no valid Supabase user).
 * - 500: Internal server error.
 */

interface CurrentStateVariant {
  lightspeed_variant_id: number
  sku: string
  is_default: boolean
  sort_order: number
  price_excl: number
  image: { src?: string; thumb?: string; title?: string } | null
  content_by_language?: Record<string, { title?: string }>
}

type VariantForMap = {
  variant_id?: number | null
  sku: string
  is_default: boolean
  sort_order: number
  price_excl: number
  image: { src?: string; thumb?: string; title?: string } | null
  content_by_language?: Record<string, { title?: string }>
}

function mapVariantToIntended(v: VariantForMap, sortOrder?: number): UpdateVariantInfo {
  return {
    variant_id: v.variant_id ?? null,
    sku: v.sku,
    is_default: v.is_default,
    sort_order: sortOrder ?? v.sort_order,
    price_excl: v.price_excl,
    image: v.image as UpdateVariantInfo['image'],
    content_by_language: v.content_by_language ?? {},
  }
}

interface UpdateProductRequest {
  targetShopTld: string
  shopId: string
  productId: number
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
  /** Current state from product-details (avoids DB load) */
  currentState: {
    visibility: string
    content_by_language: Record<string, {
      title?: string
      fulltitle?: string
      description?: string
      content?: string
    }>
    variants: CurrentStateVariant[]
  }
  /** Target shop's language configuration from product-details API */
  targetShopLanguages: Language[]
  /** Human-readable changes for product_operation_logs */
  changes?: string[]
  /** True when product image src differs from original (matches dialog detection) */
  productImageChanged?: boolean
  /** True when user explicitly reordered product images */
  imageOrderChanged?: boolean
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser()

    if (isRequireUserFailure(auth)) {
      return auth.response
    }

    const { supabase } = auth

    const body: UpdateProductRequest = await request.json()
    const { targetShopTld, shopId, productId, updateProductData, currentState, targetShopLanguages, changes, productImageChanged, imageOrderChanged } = body

    if (!targetShopTld || !shopId || !updateProductData || !currentState) {
      return NextResponse.json(
        { error: 'Missing required fields: targetShopTld, shopId, productId, updateProductData, currentState' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    if (typeof productId !== 'number') {
      return NextResponse.json(
        { error: 'productId must be a number (Lightspeed product ID)' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    if (!targetShopLanguages || targetShopLanguages.length === 0) {
      return NextResponse.json(
        { error: 'Missing target shop languages configuration' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    console.log('[API] Updating product for target shop:', targetShopTld, 'productId:', productId, 'productImageChanged:', productImageChanged, 'imageOrderChanged:', imageOrderChanged)

    const defaultLanguage = getDefaultLanguageCode(targetShopLanguages)
    if (!defaultLanguage) {
      return NextResponse.json(
        { error: 'Could not determine default language for target shop' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    const targetLanguageCodes = targetShopLanguages.map((lang: Language) => lang.code)
    const availableLanguages = Object.keys(updateProductData.content_by_language)
    const missingLanguages = targetLanguageCodes.filter((lang: string) => !availableLanguages.includes(lang))

    if (missingLanguages.length > 0) {
      console.warn('[API] Missing content for languages:', missingLanguages.join(', '))
    }

    const targetClient = getLightspeedClient(targetShopTld)

    // Fetch current product images from Lightspeed (needed for diff: delete, detect new)
    let currentImages: Array<{ id: number; sortOrder: number; src: string; thumb?: string; title?: string }> = []
    try {
      currentImages = await targetClient.getProductImages(productId, defaultLanguage)
    } catch (imgErr) {
      console.warn('[API] Could not fetch current product images:', imgErr)
    }

    const result = await updateProduct({
      targetClient,
      productId,
      defaultLanguage,
      targetLanguages: targetLanguageCodes,
      currentVisibility: currentState.visibility,
      currentContentByLanguage: currentState.content_by_language,
      currentVariants: currentState.variants,
      currentImages,
      intendedVisibility: updateProductData.visibility,
      intendedContentByLanguage: updateProductData.content_by_language,
      intendedVariants: updateProductData.variants.map((v) => mapVariantToIntended(v)),
      intendedImages: updateProductData.images.map((img) => ({
        src: img.src,
        thumb: img.thumb,
        title: img.title,
        sort_order: img.sort_order,
        id: img.id,
        addedFromSource: img.addedFromSource,
      })),
      productImageChanged: productImageChanged ?? false,
      imageOrderChanged: imageOrderChanged ?? false,
    })

    if (!result.success) {
      const productTitle = Object.values(currentState.content_by_language || {}).find((c) => c.title?.trim())?.title?.trim()
      const defaultSku = currentState.variants?.find((v) => v.is_default)?.sku ?? currentState.variants?.[0]?.sku
      const firstImg = updateProductData.images?.[0]
      const productImage = firstImg ? { src: firstImg.src, thumb: firstImg.thumb, title: firstImg.title } : undefined
      await insertProductOperationLog({
        supabase,
        shopId,
        lightspeedProductId: productId,
        operationType: 'edit',
        status: 'error',
        errorMessage: result.error || 'Failed to update product',
        details: { changes: changes ?? [], productTitle, defaultSku, productImage },
      }).catch(() => {})
      return NextResponse.json(
        { error: result.error || 'Failed to update product' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        productId,
        skipped: true,
        message: 'No changes detected, nothing to update',
      })
    }

    const changesForLog = changes ?? []

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
                  sort_order: iv.sort_order,
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
        productId,
        defaultLanguage,
        visibility: updateProductData.visibility,
        contentByLanguage: updateProductData.content_by_language,
        intendedVariants: variants.map((v) => mapVariantToIntended(v)),
        intendedImages: updateProductData.images,
        createdVariantsForDb: result.createdVariantsForDb ?? [],
        deletedVariantIds: result.deletedVariants ?? [],
        updatedVariants: updatedVariantsList as Array<{ variantId: number; variant: import('@/lib/services/update-product').UpdateVariantInfo }>,
        productImageForDb: result.productImageForDb,
        updatedVariantImages: result.updatedVariantImages,
        createdVariantImages: result.createdVariantImages,
        changes: changesForLog,
      })
      console.log('[API] ✓ Product update synced to database')
    } catch (dbError) {
      console.error('[API] Database sync failed (product was updated in Lightspeed):', dbError)
      await insertProductOperationLog({
        supabase,
        shopId,
        lightspeedProductId: productId,
        operationType: 'edit',
        status: 'success',
        details: { changes: changesForLog },
      })
      return NextResponse.json(
        {
          success: true,
          productId,
          warning: 'Product updated in Lightspeed but database sync failed. Run full sync to update.',
          message: 'Product updated successfully in target shop',
        },
        { status: 200 }
      )
    }

    return NextResponse.json({
      success: true,
      productId,
      message: 'Product updated successfully in target shop',
    })
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in update-product route:',
      includeErrorMessage: true,
    })
  }
}
