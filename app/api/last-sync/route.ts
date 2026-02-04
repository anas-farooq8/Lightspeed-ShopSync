import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()

    // Call the RPC function to get last sync info per shop
    const { data, error } = await supabase.rpc('get_last_sync_info')

    if (error) {
      console.error('Error fetching last sync info:', error)
      return NextResponse.json(
        { error: 'Failed to fetch last sync information' },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
