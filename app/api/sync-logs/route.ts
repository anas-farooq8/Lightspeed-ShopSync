import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { SyncLog } from '@/types/database'

const DATES_PER_PAGE = 20

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const shopFilter = searchParams.get('shop') || 'all'
    const statusFilter = searchParams.get('status') || 'all'
    
    const supabase = await createClient()

    // Fetch all shops once (lightweight query - only 2-5 rows)
    const { data: shopsData } = await supabase
      .from('shops')
      .select('id, tld, role')
      .order('role', { ascending: true })
      .order('tld', { ascending: true })

    const shops = (shopsData || []).map((shop: any) => ({
      tld: shop.tld,
      role: shop.role
    }))

    // Resolve shop_id for filtering (shops.id is UUID)
    let shopId: string | null = null
    if (shopFilter !== 'all') {
      const shop = shopsData?.find((s: any) => s.tld === shopFilter)
      shopId = shop?.id ?? null
    }

    // Pagination is by calendar day (unique dates), not by log row count.
    // Fetch only started_at to derive unique dates for the current filters.
    let baseQuery = supabase
      .from('sync_logs')
      .select('started_at')

    // Apply filters to base query
    if (shopId) {
      baseQuery = baseQuery.eq('shop_id', shopId)
    }

    if (statusFilter !== 'all') {
      baseQuery = baseQuery.eq('status', statusFilter)
    }
    
    // Get all unique dates (we need this for pagination metadata)
    const { data: allDatesData } = await baseQuery
      .order('started_at', { ascending: false })

    if (!allDatesData || allDatesData.length === 0) {
      return NextResponse.json({ 
        syncLogs: [], 
        totalDates: 0,
        totalPages: 0,
        currentPage: page,
        shops
      })
    }

    // Extract unique dates
    const uniqueDates = Array.from(
      new Set(
        allDatesData.map(log => 
          new Date(log.started_at).toISOString().split('T')[0]
        )
      )
    )

    const totalDates = uniqueDates.length
    const totalPages = Math.ceil(totalDates / DATES_PER_PAGE)
    const offset = (page - 1) * DATES_PER_PAGE
    
    // Get dates for current page
    const pageDates = uniqueDates.slice(offset, offset + DATES_PER_PAGE)

    if (pageDates.length === 0) {
      return NextResponse.json({ 
        syncLogs: [], 
        totalDates,
        totalPages,
        currentPage: page,
        shops
      })
    }

    // Fetch full logs for these dates
    let logsQuery = supabase
      .from('sync_logs')
      .select(`
        *,
        shops (
          name,
          tld,
          role
        )
      `)
      .gte('started_at', pageDates[pageDates.length - 1] + 'T00:00:00')
      .lte('started_at', pageDates[0] + 'T23:59:59')

    // Apply filters to logs query
    if (shopId) {
      logsQuery = logsQuery.eq('shop_id', shopId)
    }

    if (statusFilter !== 'all') {
      logsQuery = logsQuery.eq('status', statusFilter)
    }

    const { data, error } = await logsQuery.order('started_at', { ascending: false })

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
      shop_role: log.shops?.role || 'unknown',
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
    }))

    return NextResponse.json({ 
      syncLogs,
      totalDates,
      totalPages,
      currentPage: page,
      shops
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
