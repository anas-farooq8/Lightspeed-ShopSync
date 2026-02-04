import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch all shops, ordered by role (source first) then TLD
    const { data: shops, error } = await supabase
      .from('shops')
      .select('id, name, tld, role')
      .order('role', { ascending: false }) // 'target' > 'source' alphabetically, so desc gives source first
      .order('tld', { ascending: true })

    if (error) {
      console.error('Error fetching shops:', error)
      return NextResponse.json(
        { error: 'Failed to fetch shops', details: error.message },
        { status: 500 }
      )
    }

    // Transform to match the expected format
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
