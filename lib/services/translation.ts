/**
 * Translation service using Google Cloud Translation API v3.
 * Uses Translation LLM model. Pass text as-is. Decode HTML entities for plain text fields.
 */

import { TranslationServiceClient } from '@google-cloud/translate'
import he from 'he'

export interface TranslationItem {
  sourceLang: string
  targetLang: string
  field: string
  text: string
}

export interface TranslationResult extends TranslationItem {
  translatedText: string
}

const PLAIN_FIELDS = ['title', 'fulltitle', 'description']

/** For plain text: convert newlines to <br> so Google preserves them when using text/html */
function preserveNewlinesForSend(text: string, field: string): string {
  return PLAIN_FIELDS.includes(field) ? text.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>') : text
}

/** For plain text: decode entities then restore <br> to \r\n */
function cleanPlainText(text: string, field: string): string {
  if (!PLAIN_FIELDS.includes(field)) return text
  return he.decode(text).replace(/<br\s*\/?>/gi, '\r\n')
}

function getClient(): TranslationServiceClient {
  const projectId = process.env.GOOGLE_PROJECT_ID
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY

  console.log('[getClient] Environment variables status:', {
    hasProjectId: !!projectId,
    hasClientEmail: !!clientEmail,
    hasPrivateKey: !!privateKey,
    projectId: projectId ? `${projectId.substring(0, 10)}...` : 'missing'
  })

  if (!projectId || !clientEmail || !privateKey) {
    console.error('[getClient] Missing credentials:', {
      projectId: !!projectId,
      clientEmail: !!clientEmail,
      privateKey: !!privateKey
    })
    throw new Error('Set GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY')
  }

  const credentials: Record<string, unknown> = {
    type: process.env.GOOGLE_TYPE || 'service_account',
    project_id: projectId,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: privateKey.replace(/\\n/g, '\n'),
    client_email: clientEmail,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com',
  }

  console.log('[getClient] Creating TranslationServiceClient...')
  return new TranslationServiceClient({ projectId, credentials })
}

async function callTranslateApi(
  client: TranslationServiceClient,
  items: TranslationItem[],
  sourceLang: string,
  targetLang: string
): Promise<string[]> {
  console.log('[callTranslateApi] Called with:', {
    sourceLang,
    targetLang,
    itemCount: items.length,
    items: items.map(i => ({ field: i.field, textLength: i.text?.length }))
  })
  
  // Validate environment variables
  const projectId = process.env.GOOGLE_PROJECT_ID
  if (!projectId) {
    console.error('[callTranslateApi] GOOGLE_PROJECT_ID not set')
    throw new Error('GOOGLE_PROJECT_ID environment variable is not set')
  }
  
  // Validate language codes
  if (!sourceLang || typeof sourceLang !== 'string' || sourceLang.trim() === '') {
    console.error('[callTranslateApi] Invalid source language:', sourceLang)
    throw new Error(`Invalid source language code: ${sourceLang}`)
  }
  if (!targetLang || typeof targetLang !== 'string' || targetLang.trim() === '') {
    console.error('[callTranslateApi] Invalid target language:', targetLang)
    throw new Error(`Invalid target language code: ${targetLang}`)
  }
  
  const parent = `projects/${projectId}/locations/global`
  
  const contents = items.map((i) => preserveNewlinesForSend(i.text, i.field))
  console.log('[callTranslateApi] Prepared contents:', contents.map((c, i) => ({ 
    field: items[i].field, 
    length: c.length, 
    preview: c.substring(0, 50) 
  })))

  console.log('[callTranslateApi] About to call Google API with:', {
    parent,
    mimeType: 'text/html',
    sourceLanguageCode: sourceLang,
    targetLanguageCode: targetLang,
    model: `${parent}/models/general/translation-llm`,
    contentCount: contents.length
  })

  let response
  try {
    [response] = await client.translateText({
      parent,
      contents,
      mimeType: 'text/html',
      sourceLanguageCode: sourceLang,
      targetLanguageCode: targetLang,
      model: `${parent}/models/general/translation-llm`,
    })
    console.log('[callTranslateApi] Google API call successful')
  } catch (googleError: any) {
    console.error('[callTranslateApi] Google API error - Full error object:', JSON.stringify(googleError, null, 2))
    console.error('[callTranslateApi] Google API error details:', {
      message: googleError?.message,
      code: googleError?.code,
      details: googleError?.details,
      statusDetails: googleError?.statusDetails,
      metadata: googleError?.metadata,
      name: googleError?.name,
      cause: googleError?.cause,
      error: googleError?.error,
      // Try to get gRPC status code
      grpcCode: (googleError as any)?.code,
      grpcMessage: (googleError as any)?.message,
      // Check prototype chain
      toString: googleError?.toString(),
    })
    
    // Try to extract meaningful error
    let errorMsg = 'Google Translation API error'
    
    // Common gRPC error codes
    const grpcStatusMessages: Record<number, string> = {
      1: 'Request cancelled',
      2: 'Unknown error',
      3: 'Invalid argument',
      4: 'Deadline exceeded',
      5: 'Not found',
      6: 'Already exists',
      7: 'Permission denied - Check if Translation API is enabled and service account has proper IAM roles',
      8: 'Resource exhausted - Quota exceeded',
      9: 'Failed precondition',
      10: 'Aborted',
      11: 'Out of range',
      12: 'Not implemented',
      13: 'Internal error',
      14: 'Service unavailable',
      15: 'Data loss',
      16: 'Unauthenticated - Invalid credentials'
    }
    
    if (typeof googleError?.code === 'number' && grpcStatusMessages[googleError.code]) {
      errorMsg = `${grpcStatusMessages[googleError.code]} (gRPC code: ${googleError.code})`
    } else if (googleError?.message && googleError.message !== 'undefined undefined: undefined') {
      errorMsg = googleError.message
    } else if (googleError?.details) {
      errorMsg = googleError.details
    }
    
    console.error('[callTranslateApi] Parsed error message:', errorMsg)
    throw new Error(`Google Translation failed: ${errorMsg}`)
  }

  if (!response.translations?.length) {
    console.error('[callTranslateApi] Invalid response from Google:', response)
    throw new Error('Invalid response from Google Translation API')
  }

  const cleanedResults = response.translations.map((t, i) => {
    const text = t.translatedText || ''
    const cleanedText = cleanPlainText(text, items[i].field)
    return cleanedText
  })
  
  console.log('[callTranslateApi] Success:', cleanedResults.map((r, i) => ({ 
    field: items[i].field, 
    length: r.length 
  })))
  
  return cleanedResults
}

export async function translateBatch(items: TranslationItem[]): Promise<TranslationResult[]> {
  console.log('[translateBatch] Called with:', { 
    itemCount: items.length,
    items: items.map(i => ({ 
      sourceLang: i.sourceLang, 
      targetLang: i.targetLang, 
      field: i.field, 
      textLength: i.text?.length 
    }))
  })
  
  if (items.length === 0) return []

  const empty: TranslationResult[] = []
  const toTranslate: TranslationItem[] = []

  for (const item of items) {
    if (!item.text?.trim()) {
      empty.push({ ...item, translatedText: '' })
    } else {
      toTranslate.push(item)
    }
  }

  if (toTranslate.length === 0) return empty

  // Group by (sourceLang, targetLang) only - text/html for all = 1 request per language pair
  const groups = new Map<string, TranslationItem[]>()
  const order: { key: string; idx: number }[] = []

  for (const item of toTranslate) {
    const key = `${item.sourceLang}:${item.targetLang}`
    const g = groups.get(key) ?? []
    order.push({ key, idx: g.length })
    g.push(item)
    groups.set(key, g)
  }

  const client = getClient()
  const results = new Map<string, string[]>()

  for (const [key, groupItems] of groups) {
    const [sourceLang, targetLang] = key.split(':')
    console.log('[translateBatch] Calling callTranslateApi for group:', { 
      key, 
      sourceLang, 
      targetLang, 
      itemCount: groupItems.length 
    })
    results.set(key, await callTranslateApi(client, groupItems, sourceLang, targetLang))
  }

  const translated: TranslationResult[] = toTranslate.map((item, i) => {
    const { key, idx } = order[i]!
    return { ...item, translatedText: results.get(key)![idx] ?? '' }
  })

  let emptyIdx = 0
  let translatedIdx = 0
  return items.map((item) =>
    !item.text?.trim() ? empty[emptyIdx++]! : translated[translatedIdx++]!
  )
}
