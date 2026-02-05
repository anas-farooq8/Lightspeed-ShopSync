import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Product Details API Endpoint
 * 
 * Fetches comprehensive product data for ALL products matching a SKU (source + targets).
 * Handles duplicates in both source and target shops.
 * Also supports product-ID-only requests for null SKU products.
 * 
 * Query Parameters:
 * - sku: SKU to search for (optional if productId is provided)
 * - productId: Product ID to search for (optional if sku is provided, but one must be present)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const sku = searchParams.get('sku')
    const productId = searchParams.get('productId')

    if (!sku && !productId) {
      return NextResponse.json(
        { error: 'Missing sku or productId parameter' },
        { status: 400 }
      )
    }

    let data, error

    // If productId is provided without SKU, use product-ID-based lookup
    if (!sku && productId) {
      const result = await supabase.rpc('get_product_details_by_product_id', {
        p_product_id: parseInt(productId)
      })
      data = result.data
      error = result.error
      
      if (error) {
        console.error('Error fetching product details:', error)
        return NextResponse.json(
          { error: 'Failed to fetch product details', details: error.message },
          { status: 500 }
        )
      }

      if (!data) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      // Return the simplified data directly
      return NextResponse.json(data)
    } else {
      // Call optimized RPC function for product details by SKU
      const result = await supabase.rpc('get_product_details_by_sku', {
        p_sku: sku!,
        p_preferred_product_id: productId ? parseInt(productId) : null
      })
      data = result.data
      error = result.error
      
      if (error) {
        console.error('Error fetching product details:', error)
        return NextResponse.json(
          { error: 'Failed to fetch product details', details: error.message },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(data[0])
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
