import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Product Details API Endpoint
 * 
 * Fetches comprehensive product data for ALL products matching a SKU (source + targets).
 * Handles duplicates in both source and target shops.
 * 
 * Query Parameters:
 * - sku: SKU to search for (required)
 * - productId: Optional specific product ID to focus on (for source duplicates)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const sku = searchParams.get('sku')
    const productId = searchParams.get('productId')

    if (!sku) {
      return NextResponse.json(
        { error: 'Missing sku parameter' },
        { status: 400 }
      )
    }

    // Call optimized RPC function for product details by SKU
    const { data, error } = await supabase.rpc('get_product_details_by_sku', {
      p_sku: sku,
      p_preferred_product_id: productId ? parseInt(productId) : null
    })

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
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
