import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { ProductSyncStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Pagination (fixed at 100 per page, not accepting from URL)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = 100 // Fixed at 100, used for response metadata

    // Filters
    const operation = searchParams.get('operation') || 'create' // create, edit, null_sku
    const missingIn = searchParams.get('missingIn') || 'all' // all (default), or specific shop TLD (for create)
    const shopTld = searchParams.get('shopTld') || '' // For null_sku operation
    const search = searchParams.get('search') || ''
    const onlyDuplicates = searchParams.get('onlyDuplicates') === 'true'
    
    // Sorting
    const sortBy = searchParams.get('sortBy') || 'title' // title, sku, variants, price, created
    const sortOrder = searchParams.get('sortOrder') || 'asc' // asc, desc

    // NULL SKU operation - uses separate RPC function
    if (operation === 'null_sku') {
      const { data, error } = await supabase.rpc('get_null_sku_products', {
        p_shop_tld: shopTld || null,
        p_search: search || null,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_page: page
        // p_page_size defaults to 100 in RPC function
      })

      if (error) {
        console.error('Error fetching null SKU products:', error)
        return NextResponse.json(
          { error: 'Failed to fetch products', details: error.message },
          { status: 500 }
        )
      }

      // Extract pagination metadata
      const totalCount = data && data.length > 0 ? data[0].total_count : 0
      const totalPages = data && data.length > 0 ? data[0].total_pages : 0

      // Transform data: remove pagination metadata
      const products = (data || []).map(({ total_count, total_pages, ...product }: any) => product)

      return NextResponse.json({
        products,
        pagination: {
          page,
          pageSize,
          total: totalCount,
          totalPages,
        },
      })
    }

    // Call optimized RPC function for CREATE and EDIT operations
    const { data, error } = await supabase.rpc('get_sync_operations', {
      p_operation: operation,
      p_missing_in: operation === 'create' ? missingIn : null,
      p_search: search || null,
      p_only_duplicates: onlyDuplicates,
      p_sort_by: sortBy,
      p_sort_order: sortOrder,
      p_page: page
      // p_page_size defaults to 100 in RPC function
    })

    if (error) {
      console.error('Error fetching sync operations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch products', details: error.message },
        { status: 500 }
      )
    }

    // Extract pagination metadata from first row (all rows have same values)
    const totalCount = data && data.length > 0 ? data[0].total_count : 0
    const totalPages = data && data.length > 0 ? data[0].total_pages : 0

    // Transform data: remove pagination metadata from product objects
    const products = (data || []).map(({ total_count, total_pages, ...product }: any) => product)

    return NextResponse.json({
      products,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
      },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
