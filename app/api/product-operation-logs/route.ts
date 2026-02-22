import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Product Operation Logs API
 *
 * Method: GET
 * Path: /api/product-operation-logs
 *
 * Description:
 * - Returns paginated create/edit product operation logs with enriched data.
 * - Joins with shops and products to show current title, image, default_sku.
 * - Only includes product link when product exists in DB.
 *
 * Query parameters:
 * - limit: number (default 20, max 100)
 * - offset: number (default 0)
 * - shop_id: uuid (optional, filter by target shop)
 * - operation_type: 'create' | 'edit' (optional)
 * - status: 'success' | 'error' (optional)
 *
 * Responses:
 * - 200: Array of product operation log records.
 * - 500: Internal server error.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)), 100)
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const shopId = searchParams.get('shop_id') || null
    const operationType = searchParams.get('operation_type') || null
    const status = searchParams.get('status') || null

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_product_operation_logs', {
      p_limit: limit,
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

    return NextResponse.json(data ?? [])
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in product-operation-logs route:',
    })
  }
}
