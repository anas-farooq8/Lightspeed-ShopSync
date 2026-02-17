import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Dashboard Statistics API
 *
 * Method: GET
 * Path: /api/stats
 *
 * Description:
 * - Returns per-shop dashboard KPIs for the synchronization dashboard.
 *
 * Auth:
 * - Not required (relies on database security policies).
 *
 * Query parameters:
 * - None.
 *
 * Responses:
 * - 200: Array of `DashboardKpi` records.
 * - 500: Internal server error.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Call the RPC function to get per-shop KPIs
    const { data, error } = await supabase.rpc('get_dashboard_kpis')

    if (error) {
      console.error('Error fetching stats:', error)
      return NextResponse.json(
        { error: 'Failed to fetch statistics' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in stats route:',
    })
  }
}
