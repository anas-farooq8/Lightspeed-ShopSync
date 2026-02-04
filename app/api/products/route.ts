import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    
    // Parse query parameters
    const search = searchParams.get('search') || ''
    const filter = searchParams.get('filter') || 'all'
    const sort = searchParams.get('sort') || 'created_at_desc'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    
    // Calculate offset based on page
    const offset = (page - 1) * limit

    const supabase = await createClient()
    
    // Start building the query
    let query = supabase
      .from('product_sync_status')
      .select('*', { count: 'exact' })
    
    // Apply search filter
    if (search) {
      query = query.or(`default_sku.ilike.%${search}%,product_title.ilike.%${search}%`)
    }
    
    // Apply status filters
    switch (filter) {
      case 'missing_de':
        query = query.eq('de_status', 'not_exists')
        break
      case 'missing_be':
        query = query.eq('be_status', 'not_exists')
        break
      case 'missing_both':
        query = query
          .eq('de_status', 'not_exists')
          .eq('be_status', 'not_exists')
        break
      case 'exists_both':
        query = query
          .in('de_status', ['exists_single', 'exists_multiple'])
          .in('be_status', ['exists_single', 'exists_multiple'])
        break
      case 'has_duplicates':
        query = query.or('has_nl_duplicates.eq.true,de_status.eq.exists_multiple,be_status.eq.exists_multiple')
        break
      case 'nl_duplicates':
        query = query.eq('has_nl_duplicates', true)
        break
      case 'de_multiple':
        query = query.eq('de_status', 'exists_multiple')
        break
      case 'be_multiple':
        query = query.eq('be_status', 'exists_multiple')
        break
      case 'needs_attention':
        query = query.or('has_nl_duplicates.eq.true,de_status.eq.exists_multiple,be_status.eq.exists_multiple')
        break
      // 'all' - no filter
    }
    
    // Apply sorting
    switch (sort) {
      case 'created_at_desc':
        query = query.order('ls_created_at', { ascending: false })
        break
      case 'created_at_asc':
        query = query.order('ls_created_at', { ascending: true })
        break
      case 'sku_asc':
        query = query.order('default_sku', { ascending: true })
        break
      case 'sku_desc':
        query = query.order('default_sku', { ascending: false })
        break
      default:
        query = query.order('ls_updated_at', { ascending: false })
    }
    
    // Apply pagination
    query = query.range(offset, offset + limit - 1)
    
    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching products:', error)
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      )
    }

    // Calculate total pages
    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({
      products: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
