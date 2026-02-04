import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Filters
    const operation = searchParams.get('operation') || 'create' // create, edit, null_sku
    const missingIn = searchParams.get('missingIn') || 'all' // be, de, all (for create)
    const search = searchParams.get('search') || ''

    // Build base query
    let query = supabase
      .from('product_sync_status')
      .select('*', { count: 'exact' })

    // Apply filters based on operation type
    switch (operation) {
      case 'create':
        // For CREATE: only non-null source products
        // Note: Include duplicates - they'll be grouped in UI
        query = query.eq('is_null_sku', false)
        break

      case 'edit':
        // For EDIT: only non-null, products that exist in at least one target
        query = query.eq('is_null_sku', false)
        break

      case 'null_sku':
        // For NULL SKU: only products with null default_sku
        query = query.eq('is_null_sku', true)
        break
    }

    // Search filter (product title or SKU)
    if (search) {
      if (operation === 'null_sku') {
        // For NULL SKU, only search by product title
        query = query.ilike('product_title', `%${search}%`)
      } else {
        query = query.or(`product_title.ilike.%${search}%,default_sku.ilike.%${search}%`)
      }
    }

    // Ordering
    query = query.order('product_title', { ascending: true, nullsFirst: false })

    // Fetch data
    const { data: allData, error } = await query

    if (error) {
      console.error('Error fetching sync operations:', error)
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      )
    }

    // Post-process filtering based on targets JSON and operation
    let filteredData = allData || []
    
    if (operation === 'create') {
      // Filter by missing in specific shops
      filteredData = filteredData.filter(product => {
        const targets = product.targets || {}
        
        if (Object.keys(targets).length === 0) {
          // No targets at all means missing in all shops
          return missingIn === 'all'
        }
        
        if (missingIn === 'all') {
          // Missing in ALL target shops
          return Object.values(targets).every((t: any) => t.status === 'not_exists')
        } else {
          // Missing in specific shop
          return !targets[missingIn] || targets[missingIn].status === 'not_exists'
        }
      })
    } else if (operation === 'edit') {
      // For EDIT: filter to show only products that exist in at least one target
      filteredData = filteredData.filter(product => {
        const targets = product.targets || {}
        if (Object.keys(targets).length === 0) return false
        
        // Must have at least one target with status 'exists_single' or 'exists_multiple'
        return Object.values(targets).some((t: any) => 
          t.status === 'exists_single' || t.status === 'exists_multiple'
        )
      })
    }

    // Apply pagination to filtered data
    const total = filteredData.length
    const paginatedData = filteredData.slice(from, to + 1)

    return NextResponse.json({
      products: paginatedData,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
