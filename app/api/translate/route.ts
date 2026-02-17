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
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items to translate' }, { status: 400 })
    }

    const results = await translateBatch(items)
    return NextResponse.json(results)
  } catch (error) {
    return handleRouteError(error, {
      logMessage: '[API /translate] Error:',
      includeErrorMessage: true,
      publicMessage: 'Translation failed',
    })
  }
}
