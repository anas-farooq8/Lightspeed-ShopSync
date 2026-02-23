import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

const LIMIT = 10

/**
 * Last Product Operations API (Dashboard)
 *
 * Method: GET
 * Path: /api/last-product-operation
 *
 * Description:
 * - Returns the last 10 product operation logs for dashboard display.
 * - Simple query - no pagination or filters.
 * - Uses get_product_operation_logs RPC with limit=10.
 *
 * Responses:
 * - 200: Array of product operation log records (same format as product-operation-logs).
 * - 500: Internal server error.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_product_operation_logs', {
      p_limit: LIMIT,
      p_offset: 0,
      p_shop_id: null,
      p_operation_type: null,
      p_status: null,
    })

    if (error) {
      console.error('Error fetching last product operations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch last product operations' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    const result = data as { data?: unknown[]; total_count?: number } | null
    const logs = Array.isArray(result?.data) ? result.data : []
    return NextResponse.json(logs)
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in last-product-operation route:',
    })
  }
}
