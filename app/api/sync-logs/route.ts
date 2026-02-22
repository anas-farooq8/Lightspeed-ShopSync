import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sortShopsSourceFirstThenByTld } from '@/lib/utils'
import type { SyncLog } from '@/types/database'
import { HTTP_STATUS, handleRouteError } from '@/lib/api'

const DATES_PER_PAGE = 20

/**
 * Sync Logs API
 *
 * Method: GET
 * Path: /api/sync-logs
 *
 * Description:
 * - Returns paginated synchronization logs grouped by date, with per-run metrics.
 *
 * Auth:
 * - Not required (relies on database security policies).
 *
 * Query parameters:
 * - page: Page number (1-based, default 1).
 * - shop: Shop TLD filter or "all".
 * - status: "running" | "success" | "error" or "all".
 *
 * Responses:
 * - 200: Paginated sync logs with pagination metadata and shop list.
 * - 400: Invalid query parameters.
 * - 500: Internal server error.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPage = Number.parseInt(searchParams.get('page') || '1', 10)
    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
    const shopFilter = searchParams.get('shop') || 'all'
    const statusFilter = searchParams.get('status') || 'all'
    
    const supabase = await createClient()

    // Fetch all shops (small dataset - 2-5 rows)
    const { data: shopsData } = await supabase
      .from('shops')
      .select('id, tld, role')

    const shops = sortShopsSourceFirstThenByTld(
      (shopsData || []).map((shop: any) => ({
        tld: shop.tld,
        role: shop.role
      }))
    )

    // Resolve shop_id for filtering
    let shopId: string | null = null
    if (shopFilter !== 'all') {
      const shop = shopsData?.find((s: any) => s.tld === shopFilter)
      if (!shop) {
        return NextResponse.json({ 
          syncLogs: [], 
          totalDates: 0,
          totalPages: 0,
          currentPage: page,
          shops
        })
      }
      shopId = shop.id
    }

    // Calculate offset
    const offset = (page - 1) * DATES_PER_PAGE
    
    // Build filter conditions for the RPC call
    const filters: any = {
      p_limit: DATES_PER_PAGE,
      p_offset: offset
    }
    
    if (shopId) {
      filters.p_shop_id = shopId
    }
    
    if (statusFilter !== 'all') {
      filters.p_status = statusFilter
    }

    // Call the database function to get paginated dates and total count
    const { data: paginationData, error: paginationError } = await supabase
      .rpc('get_sync_log_dates_paginated', filters)

    if (paginationError) {
      console.error('Error fetching pagination data:', paginationError)
      return NextResponse.json(
        { error: 'Failed to fetch sync logs' },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    if (!paginationData || paginationData.length === 0) {
      return NextResponse.json({ 
        syncLogs: [], 
        totalDates: 0,
        totalPages: 0,
        currentPage: page,
        shops
      })
    }

    // Extract pagination metadata and dates
    const totalDates = paginationData[0]?.total_count || 0
    const totalPages = Math.ceil(totalDates / DATES_PER_PAGE)
    const pageDates = paginationData.map((row: any) => row.log_date)

    // Fetch full logs for these dates (exclude created_at)
    let logsQuery = supabase
      .from('sync_logs')
      .select(`
        id,
        shop_id,
        started_at,
        completed_at,
        duration_seconds,
        status,
        error_message,
        products_fetched,
        variants_fetched,
        products_synced,
        variants_synced,
        products_deleted,
        variants_deleted,
        variants_filtered,
        shops (
          name,
          tld,
          role,
          base_url
        )
      `)
      .gte('started_at', `${pageDates[pageDates.length - 1]}T00:00:00Z`)
      .lte('started_at', `${pageDates[0]}T23:59:59.999Z`)

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
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    // Transform the data to match SyncLog interface
    const syncLogs: SyncLog[] = (data || []).map((log: any) => ({
      id: log.id,
      shop_id: log.shop_id,
      shop_name: log.shops?.name || 'Unknown',
      shop_tld: log.shops?.tld || 'unknown',
      shop_role: log.shops?.role || 'unknown',
      shop_base_url: log.shops?.base_url || null,
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
    }))

    return NextResponse.json({ 
      syncLogs,
      totalDates,
      totalPages,
      currentPage: page,
      shops
    })
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API] Unexpected error in sync-logs route:',
      publicMessage: 'An unexpected error occurred',
    })
  }
}