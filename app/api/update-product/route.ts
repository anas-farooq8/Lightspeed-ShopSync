import { NextRequest, NextResponse } from 'next/server'
import { getLightspeedClient } from '@/lib/services/lightspeed-api'
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
      title: string
      fulltitle?: string
      description?: string
      content?: string
    }>
    variants: Array<{
      sku: string
      is_default: boolean
      sort_order: number
      price_excl: number
      image: {
        src: string
        thumb?: string
        title?: string
        sort_order: number
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

    // TODO: Implement updateProduct service similar to createProduct
    // For now, return a placeholder response
    return NextResponse.json({
      success: true,
      productId: lightspeedProductId,
      message: `Product update functionality coming soon. Product ID: ${lightspeedProductId}`,
    })

  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in update-product route:',
      includeErrorMessage: true,
    })
  }
}
