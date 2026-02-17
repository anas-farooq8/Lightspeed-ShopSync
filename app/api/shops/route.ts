import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Shops API
 *
 * Method: GET
 * Path: /api/shops
 *
 * Description:
 * - Returns the list of shops used in the application (id, name, TLD, role).
 *
 * Auth:
 * - Not required (relies on database security policies).
 *
 * Query parameters:
 * - None.
 *
 * Responses:
 * - 200: `{ shops: [...] }` with transformed shop data.
 * - 500: Internal server error.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch all shops (sorting done in UI)
    const { data: shops, error } = await supabase
      .from('shops')
      .select('id, name, tld, role')

    if (error) {
      console.error('Error fetching shops:', error)
      return NextResponse.json(
        { error: 'Failed to fetch shops', details: error.message },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    // Transform to match expected format (shop_id, shop_name for sync operations)
    const transformedShops = (shops || []).map(shop => ({
      shop_id: shop.id,
      shop_name: shop.name,
      tld: shop.tld,
      role: shop.role,
    }))

    return NextResponse.json({ shops: transformedShops })
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error fetching shops:',
    })
  }
}
