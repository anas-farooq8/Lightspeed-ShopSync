import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sortShopsSourceFirstThenByTld } from '@/lib/utils'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

const ITEMS_PER_PAGE = 50

/**
 * Product Operation Logs API
 *
 * Method: GET
 * Path: /api/product-operation-logs
 *
 * Description:
 * - Returns paginated create/edit product operation logs with enriched data.
 * - Joins with shops and products to show current title, image, default_sku.
 * - Supports page-based pagination (50 per page) and filters.
 *
 * Query parameters:
 * - page: Page number (1-based, default 1)
 * - shop: Shop TLD filter or "all"
 * - operation_type: 'create' | 'edit' (optional)
 * - status: 'success' | 'error' (optional)
 *
 * Responses:
 * - 200: { data, totalCount, totalPages, currentPage, shops }
 * - 500: Internal server error.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
    const shopFilter = searchParams.get('shop') || 'all'
    const operationType = searchParams.get('operation_type') || null
    const status = searchParams.get('status') || null

    const supabase = await createClient()

    // Fetch shops for filter dropdown
    const { data: shopsData } = await supabase
      .from('shops')
      .select('id, tld, role')

    const shops = sortShopsSourceFirstThenByTld(
      (shopsData || []).map((shop: { id: string; tld: string; role: string }) => ({
        id: shop.id,
        tld: shop.tld,
        role: shop.role,
      }))
    )

    // Resolve shop_id from TLD filter
    let shopId: string | null = null
    if (shopFilter !== 'all') {
      const shop = shopsData?.find((s: { tld: string }) => s.tld === shopFilter)
      if (!shop) {
        return NextResponse.json({
          data: [],
          totalCount: 0,
          totalPages: 0,
          currentPage: page,
          shops: shops.map((s) => ({ tld: s.tld, role: s.role })),
        })
      }
      shopId = (shop as { id: string }).id
    }

    const offset = (page - 1) * ITEMS_PER_PAGE

    const { data, error } = await supabase.rpc('get_product_operation_logs', {
      p_limit: ITEMS_PER_PAGE,
      p_offset: offset,
      p_shop_id: shopId,
      p_operation_type: operationType,
      p_status: status,
    })

    if (error) {
      console.error('Error fetching product operation logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch product operation logs' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    const result = data as { data?: unknown[]; total_count?: number } | null
    const logs = Array.isArray(result?.data) ? result.data : []
    const totalCount = typeof result?.total_count === 'number' ? result.total_count : 0
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    return NextResponse.json({
      data: logs,
      totalCount,
      totalPages,
      currentPage: page,
      shops: shops.map((s) => ({ tld: s.tld, role: s.role })),
    })
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in product-operation-logs route:',
    })
  }
}
