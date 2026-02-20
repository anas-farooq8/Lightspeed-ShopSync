import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Sync Operations API
 *
 * Method: GET
 * Path: /api/sync-operations
 *
 * Description:
 * - Returns paginated products and their sync status for create/edit/null-SKU operations.
 *
 * Auth:
 * - Not required (relies on database security policies).
 *
 * Query parameters:
 * - page: Page number (1-based, default 1).
 * - pageSize: Page size (1–1000, default 100).
 * - operation: "create" | "edit" | "null_sku" (default "create").
 * - missingIn: Target shop filter for create/edit operations.
 * - shopTld: Shop TLD filter for null_sku operation.
 * - search: Free-text search across products.
 * - onlyDuplicates: "true" to restrict to duplicated SKUs.
 * - sortBy: "product_id" | "title" | "sku" | "variants" | "price" | "created".
 * - sortOrder: "asc" | "desc".
 *
 * Responses:
 * - 200: Paginated list of products and metadata.
 * - 400: Invalid query parameters.
 * - 500: Internal server error.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Pagination - pageSize from URL (50 for mobile, 100 default), 1-1000
    const rawPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const rawRequestedSize = Number.parseInt(searchParams.get('pageSize') || '100', 10)
    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
    const requestedSize = Number.isNaN(rawRequestedSize) ? 100 : rawRequestedSize
    const pageSize = Math.min(1000, Math.max(1, requestedSize))

    // Filters
    const operation = searchParams.get('operation') || 'create' // create, edit, null_sku
    // Frontend sends "missingIn" for both create (missing in shop) and edit (exists in shop)
    const missingIn = searchParams.get('missingIn') || 'all'
    const shopTld = searchParams.get('shopTld') || '' // For null_sku operation
    const search = searchParams.get('search') || ''
    const onlyDuplicates = searchParams.get('onlyDuplicates') === 'true'
    
    // Sorting
    const sortBy = searchParams.get('sortBy') || 'title' // title, sku, variants, price, created
    const sortOrder = searchParams.get('sortOrder') || 'asc' // asc, desc

    const allowedOperations = new Set(['create', 'edit', 'null_sku'])
    if (!allowedOperations.has(operation)) {
      return NextResponse.json(
        { error: 'Invalid operation parameter' },
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    // NULL SKU operation - uses separate RPC function
    if (operation === 'null_sku') {
      const { data, error } = await supabase.rpc('get_null_sku_products', {
        p_shop_tld: shopTld || null,
        p_search: search || null,
        p_sort_by: sortBy,
        p_sort_order: sortOrder,
        p_page: page,
        p_page_size: pageSize,
      })

      if (error) {
        console.error('Error fetching null SKU products:', error)
        return NextResponse.json(
          { error: 'Failed to fetch products', details: error.message },
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
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
      p_missing_in: (operation === 'create' || operation === 'edit') ? missingIn : null,
      p_search: search || null,
      p_only_duplicates: onlyDuplicates,
      p_sort_by: sortBy,
      p_sort_order: sortOrder,
      p_page: page,
      p_page_size: pageSize,
    })

    if (error) {
      console.error('Error fetching sync operations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch products', details: error.message },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
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
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in sync-operations route:',
    })
  }
}
