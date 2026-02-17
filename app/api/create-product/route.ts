/**
 * Create Product API Endpoint
 * POST /api/create-product
 * 
 * Creates a new product in the target Lightspeed shop
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLightspeedClient } from '@/lib/services/lightspeed-api'
import { createProduct, type VariantInfo, type ImageInfo } from '@/lib/services/create-product'
import { syncCreatedProductToDb } from '@/lib/services/sync-created-product-to-db'

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
    variants: VariantInfo[]
    images: ImageInfo[]
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: CreateProductRequest = await request.json()
    const { targetShopTld, shopId, sourceProductData } = body

    // Validate request
    if (!targetShopTld || !shopId || !sourceProductData) {
      return NextResponse.json(
        { error: 'Missing required fields: targetShopTld, shopId, sourceProductData' },
        { status: 400 }
      )
    }

    console.log('[API] Creating product for target shop:', targetShopTld)

    // Get default language from content
    const availableLanguages = Object.keys(sourceProductData.content_by_language)
    if (availableLanguages.length === 0) {
      return NextResponse.json(
        { error: 'No content languages provided' },
        { status: 400 }
      )
    }

    // First language with content is considered default
    const defaultLanguage = availableLanguages[0]
    
    console.log('[API] Default language:', defaultLanguage)
    console.log('[API] All languages:', availableLanguages.join(', '))

    // Get Lightspeed API client
    const lightspeedClient = getLightspeedClient(targetShopTld)

    // Create the product
    const result = await createProduct({
      targetClient: lightspeedClient,
      defaultLanguage,
      targetLanguages: availableLanguages,
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
        { status: 500 }
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
    console.error('[API] Unexpected error:', error)
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
