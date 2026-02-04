import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import type { ProductSyncStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Pagination (updated to 100 per page)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '100')

    // Filters
    const operation = searchParams.get('operation') || 'create' // create, edit, null_sku
    const missingIn = searchParams.get('missingIn') || 'be' // be, de, all (for create)
    const search = searchParams.get('search') || ''
    const onlyDuplicates = searchParams.get('onlyDuplicates') === 'true'
    
    // Sorting
    const sortBy = searchParams.get('sortBy') || 'title' // title, sku, variants, price
    const sortOrder = searchParams.get('sortOrder') || 'asc' // asc, desc

    // NULL SKU operation - view doesn't include NULL SKUs
    // TODO: Implement separate handling for NULL SKU products
    if (operation === 'null_sku') {
      return NextResponse.json({
        products: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
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
      p_page: page,
      p_page_size: pageSize
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
