import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Last Sync API
 *
 * Method: GET
 * Path: /api/last-sync
 *
 * Description:
 * - Returns last synchronization information per shop (timestamps and basic stats).
 *
 * Auth:
 * - Not required (relies on database security policies).
 *
 * Query parameters:
 * - None.
 *
 * Responses:
 * - 200: Array of per-shop last-sync records.
 * - 500: Internal server error.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Call the RPC function to get last sync info per shop
    const { data, error } = await supabase.rpc('get_last_sync_info')

    if (error) {
      console.error('Error fetching last sync info:', error)
      return NextResponse.json(
        { error: 'Failed to fetch last sync information' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    return NextResponse.json(data || [])
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in last-sync route:',
    })
  }
}
