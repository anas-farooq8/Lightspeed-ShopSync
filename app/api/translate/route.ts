import { NextResponse } from 'next/server'
import { translateBatch } from '@/lib/services/translation'
import { handleRouteError, requireUser, isRequireUserFailure } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireUser()
  if (isRequireUserFailure(auth)) {
    return auth.response
  }

  try {
    const { items } = await request.json()
    console.log('[API /translate] Received request:', { 
      itemCount: items?.length,
      items: items?.map((i: any) => ({
        sourceLang: i.sourceLang,
        targetLang: i.targetLang,
        field: i.field,
        textLength: i.text?.length
      }))
    })
    
    if (!Array.isArray(items) || items.length === 0) {
      console.error('[API /translate] Invalid items:', items)
      return NextResponse.json({ error: 'No items to translate' }, { status: 400 })
    }

    console.log('[API /translate] Calling translateBatch...')
    const results = await translateBatch(items)
    console.log('[API /translate] translateBatch success:', results)
    return NextResponse.json(results)
  } catch (error) {
    console.error('[API /translate] translateBatch error:', error)
    return handleRouteError(error, {
      logMessage: '[API /translate] Error:',
      includeErrorMessage: true,
      publicMessage: 'Translation failed',
    })
  }
}
