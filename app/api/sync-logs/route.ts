import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { SyncLog } from '@/types/variant'

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch sync logs joined with shop info, ordered by most recent first
    const { data, error } = await supabase
      .from('sync_logs')
      .select(`
        *,
        shops (
          name,
          tld
        )
      `)
      .order('started_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching sync logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch sync logs' },
        { status: 500 }
      )
    }

    // Transform the data to match SyncLog interface
    const syncLogs: SyncLog[] = (data || []).map((log: any) => ({
      id: log.id,
      shop_id: log.shop_id,
      shop_name: log.shops?.name || 'Unknown',
      shop_tld: log.shops?.tld || 'unknown',
      started_at: log.started_at,
      completed_at: log.completed_at,
      duration_seconds: log.duration_seconds,
      status: log.status,
      error_message: log.error_message,
      products_fetched: log.products_fetched || 0,
      variants_fetched: log.variants_fetched || 0,
      products_synced: log.products_synced || 0,
      variants_synced: log.variants_synced || 0,
      products_deleted: log.products_deleted || 0,
      variants_deleted: log.variants_deleted || 0,
      variants_filtered: log.variants_filtered || 0,
      created_at: log.created_at,
      updated_at: log.updated_at,
    }))

    return NextResponse.json({ syncLogs })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
