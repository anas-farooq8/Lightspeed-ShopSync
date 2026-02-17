/**
 * POST /api/translate
 *
 * Batch translation endpoint. Caching is runtime-only on the client
 * (translation memo in page state, like product images — gone on refresh/navigate).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { translateBatch, TranslationItem } from '@/lib/services/translation'

export const dynamic = 'force-dynamic'

interface TranslateRequestBody {
  items: TranslationItem[]
}

export async function POST(request: NextRequest) {
  try {
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

    const body: TranslateRequestBody = await request.json()

    if (!body.items || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: 'Invalid request: items array is required' },
        { status: 400 }
      )
    }

    if (body.items.length === 0) {
      return NextResponse.json([])
    }

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

    const results = await translateBatch(body.items)

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
