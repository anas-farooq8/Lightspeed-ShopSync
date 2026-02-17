import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Product Details API
 *
 * Method: GET
 * Path: /api/product-details
 *
 * Description:
 * - Fetches comprehensive product data for all products matching a SKU across source and target shops.
 * - Handles duplicates in both source and target shops.
 * - Supports product-ID-only requests for null-SKU products.
 *
 * Auth:
 * - Not required (relies on database security policies).
 *
 * Query parameters:
 * - sku: SKU to search for (optional if productId is provided).
 * - productId: Product ID to search for (optional if sku is provided, but one must be present).
 *
 * Responses:
 * - 200: Product details for the requested product.
 * - 400: Missing or invalid query parameters.
 * - 404: Product not found.
 * - 500: Internal server error.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const sku = searchParams.get('sku')
    const productIdParam = searchParams.get('productId')

    if (!sku && !productIdParam) {
      return NextResponse.json(
        { error: 'Missing sku or productId parameter' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    const productId = productIdParam ? Number.parseInt(productIdParam, 10) : null

    if (productIdParam && (productId === null || Number.isNaN(productId))) {
      return NextResponse.json(
        { error: 'Invalid productId parameter' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    let data, error

    // If productId is provided without SKU, use product-ID-based lookup
    if (!sku && productId !== null) {
      const result = await supabase.rpc('get_product_details_by_product_id', {
        p_product_id: productId
      })
      data = result.data
      error = result.error
      
      if (error) {
        console.error('Error fetching product details:', error)
        return NextResponse.json(
          { error: 'Failed to fetch product details', details: error.message },
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
        )
      }

      if (!data) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: HTTP_STATUS.NOT_FOUND }
        )
      }

      // Return the simplified data directly
      return NextResponse.json(data)
    } else {
      // Call optimized RPC function for product details by SKU
      const result = await supabase.rpc('get_product_details_by_sku', {
        p_sku: sku!,
        p_preferred_product_id: productId
      })
      data = result.data
      error = result.error
      
      if (error) {
        console.error('Error fetching product details:', error)
        return NextResponse.json(
          { error: 'Failed to fetch product details', details: error.message },
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
        )
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: HTTP_STATUS.NOT_FOUND }
        )
      }

      return NextResponse.json(data[0])
    }
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in product-details route:',
    })
  }
}
