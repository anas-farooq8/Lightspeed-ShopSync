/**
 * POST /api/translate
 * 
 * Batch translation endpoint with in-memory caching
 * Accepts multiple translation items and returns translated texts
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { translateBatch, TranslationItem } from '@/lib/services/translation'

export const dynamic = 'force-dynamic'

interface TranslateRequestBody {
  items: TranslationItem[]
  sessionId: string
  shopTld?: string // Optional: for shop-specific override (re-translations)
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body: TranslateRequestBody = await request.json()
    
    if (!body.items || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: 'Invalid request: items array is required' },
        { status: 400 }
      )
    }

    if (!body.sessionId || typeof body.sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: sessionId is required' },
        { status: 400 }
      )
    }

    if (body.items.length === 0) {
      return NextResponse.json([])
    }

    // Validate items
    for (const item of body.items) {
      if (!item.sourceLang || !item.targetLang || !item.field || item.text === undefined) {
        return NextResponse.json(
          {
            error: 'Invalid item: sourceLang, targetLang, field, and text are required',
          },
          { status: 400 }
        )
      }
    }

    // Process translations with hybrid caching (Option 3)
    // Initial translations: shared cache (shopTld = undefined)
    // Re-translations: shop-specific override (shopTld provided)
    const results = await translateBatch(body.items, body.sessionId, body.shopTld)

    return NextResponse.json(results)
  } catch (error) {
    console.error('Translation API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}
