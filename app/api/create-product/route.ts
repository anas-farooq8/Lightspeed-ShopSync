import { NextRequest, NextResponse } from 'next/server'
import { getLightspeedClient } from '@/lib/services/lightspeed-api'
import { createProduct } from '@/lib/services/create-product'
import { syncCreatedProductToDb } from '@/lib/services/sync-created-product-to-db'
import { HTTP_STATUS, handleRouteError, isRequireUserFailure, requireUser } from '@/lib/api'
import type { Language } from '@/types/product'

/**
 * Create Product API
 *
 * Method: POST
 * Path: /api/create-product
 *
 * Description:
 * - Creates a new product in the target Lightspeed shop and syncs it to the local database.
 *
 * Auth:
 * - Required (Supabase user session).
 *
 * Request body:
 * - targetShopTld: string
 * - shopId: string
 * - sourceProductData: { visibility, content_by_language, variants, images }
 * - targetShopLanguages: Language[] (target shop's language configuration from product-details API)
 *
 * Responses:
 * - 200: Product created (with optional warning if DB sync failed).
 * - 400: Validation error (missing required fields or content).
 * - 401: Unauthorized (no valid Supabase user).
 * - 500: Internal server error.
 */

interface CreateProductRequest {
  targetShopTld: string
  shopId: string
  sourceProductData: {
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

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const auth = await requireUser()

    if (isRequireUserFailure(auth)) {
      return auth.response
    }

    const { supabase } = auth

    // Parse request body
    const body: CreateProductRequest = await request.json()
    const { targetShopTld, shopId, sourceProductData, targetShopLanguages } = body

    // Validate request
    if (!targetShopTld || !shopId || !sourceProductData) {
      return NextResponse.json(
        { error: 'Missing required fields: targetShopTld, shopId, sourceProductData' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    if (!targetShopLanguages || targetShopLanguages.length === 0) {
      return NextResponse.json(
        { error: 'Missing target shop languages configuration' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    console.log('[API] Creating product for target shop:', targetShopTld)

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
    const availableLanguages = Object.keys(sourceProductData.content_by_language)
    const missingLanguages = targetLanguageCodes.filter((lang: string) => !availableLanguages.includes(lang))
    
    if (missingLanguages.length > 0) {
      console.warn('[API] Missing content for languages:', missingLanguages.join(', '))
    }
    
    console.log('[API] Default language:', defaultLanguage)
    console.log('[API] Target languages:', targetLanguageCodes.join(', '))

    // Get Lightspeed API client
    const lightspeedClient = getLightspeedClient(targetShopTld)

    // Create the product
    const result = await createProduct({
      targetClient: lightspeedClient,
      defaultLanguage,
      targetLanguages: targetLanguageCodes,
      visibility: sourceProductData.visibility,
      content_by_language: sourceProductData.content_by_language,
      variants: sourceProductData.variants,
      images: sourceProductData.images,
    })

    if (!result.success) {
      console.error('[API] Product creation failed:', result.error)
      return NextResponse.json(
        { 
          error: result.error || 'Failed to create product',
          details: result.details 
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    console.log('[API] ✓ Product created successfully:', result.productId)

    // Sync to database
    if (result.createdVariantsForDb) {
      try {
        await syncCreatedProductToDb({
          supabase,
          shopId,
          productId: result.productId!,
          defaultLanguage,
          visibility: sourceProductData.visibility,
          contentByLanguage: sourceProductData.content_by_language,
          variants: sourceProductData.variants,
          createdVariantsForDb: result.createdVariantsForDb,
          images: sourceProductData.images,
        })
        console.log('[API] ✓ Product synced to database')
      } catch (dbError) {
        console.error('[API] Database sync failed (product was created in Lightspeed):', dbError)
        return NextResponse.json(
          {
            success: true,
            productId: result.productId,
            createdVariants: result.createdVariants,
            warning: 'Product created in Lightspeed but database sync failed. Run full sync to update.',
            message: `Product created successfully in target shop`,
          },
          { status: 200 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      productId: result.productId,
      createdVariants: result.createdVariants,
      message: `Product created successfully in target shop`,
    })

  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in create-product route:',
      includeErrorMessage: true,
    })
  }
}
