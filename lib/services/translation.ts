/**
 * Translation service using Google Cloud Translation API v3.
 * Uses Translation LLM model. Plain fields (title, fulltitle, description) use text/plain;
 * rich content uses text/html. No extra formatting on the response.
 */

import { TranslationServiceClient } from '@google-cloud/translate'

export interface TranslationItem {
  sourceLang: string
  targetLang: string
  field: string
  text: string
}

export interface TranslationResult extends TranslationItem {
  translatedText: string
}

function mimeTypeForItemField(field: string): 'text/html' | 'text/plain' {
  return field === 'content' ? 'text/html' : 'text/plain'
}

function splitLangPairKey(key: string): [string, string] {
  const i = key.indexOf(':')
  if (i <= 0 || i === key.length - 1) {
    throw new Error(`Invalid translation group key: ${key}`)
  }
  return [key.slice(0, i), key.slice(i + 1)]
}

function getClient(): TranslationServiceClient {
  const projectId = process.env.GOOGLE_PROJECT_ID
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
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
    auth_provider_x509_cert_url:
      process.env.GOOGLE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    universe_domain: process.env.GOOGLE_UNIVERSE_DOMAIN || 'googleapis.com',
  }

  return new TranslationServiceClient({ projectId, credentials })
}

async function callTranslateApi(
  client: TranslationServiceClient,
  items: TranslationItem[],
  sourceLang: string,
  targetLang: string,
  mimeType: 'text/html' | 'text/plain'
): Promise<string[]> {
  if (items.length === 0) return []

  const projectId = process.env.GOOGLE_PROJECT_ID!
  const parent = `projects/${projectId}/locations/global`

  const [response] = await client.translateText({
    parent,
    contents: items.map((i) => i.text),
    mimeType,
    sourceLanguageCode: sourceLang,
    targetLanguageCode: targetLang,
    model: `${parent}/models/general/translation-llm`,
  })

  if (!response.translations?.length) {
    throw new Error('Invalid response from Google Translation API')
  }

  return response.translations.map((t) => t.translatedText || '')
}

export async function translateBatch(items: TranslationItem[]): Promise<TranslationResult[]> {
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
    const [sourceLang, targetLang] = splitLangPairKey(key)
    const htmlItems = groupItems.filter((i) => mimeTypeForItemField(i.field) === 'text/html')
    const plainItems = groupItems.filter((i) => mimeTypeForItemField(i.field) === 'text/plain')

    const htmlOut =
      htmlItems.length > 0
        ? await callTranslateApi(client, htmlItems, sourceLang, targetLang, 'text/html')
        : []
    const plainOut =
      plainItems.length > 0
        ? await callTranslateApi(client, plainItems, sourceLang, targetLang, 'text/plain')
        : []

    let hi = 0
    let pi = 0
    const merged = groupItems.map((item) => {
      if (mimeTypeForItemField(item.field) === 'text/html') {
        return htmlOut[hi++]!
      }
      return plainOut[pi++]!
    })

    results.set(key, merged)
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
