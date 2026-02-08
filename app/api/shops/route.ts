import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
        { status: 500 }
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
    console.error('Unexpected error fetching shops:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
