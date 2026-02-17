/**
 * Translation service using Google Cloud Translation API.
 * No server-side cache: reuse is handled in the page via a runtime-only
 * translation memo (like product images / targetData — gone on refresh/navigate).
 */

// Translation request/response types
export interface TranslationItem {
  sourceLang: string
  targetLang: string
  field: string
  text: string
}

export interface TranslationResult extends TranslationItem {
  translatedText: string
}

/**
 * Prepare text for translation by converting plain newlines to HTML breaks
 * Google Translate preserves <br> tags but not plain \n newlines
 */
function prepareTextForTranslation(text: string, field: string): string {
  // content field is already HTML (from Quill editor)
  // Only remove \r\n between tags (not other spaces which are part of content)
  if (field === 'content') {
    return text.replace(/>\r?\n\s*</g, '><').trim()
  }
  
  // For plain text fields (title, fulltitle, description):
  // Convert newlines to <br> so Google preserves them
  return text.replace(/\r?\n/g, '<br>')
}

/**
 * Clean translated text by restoring newlines for plain text fields
 */
function cleanTranslatedText(text: string, field: string): string {
  // content field: restore \r\n between tags and remove Google's added spaces
  if (field === 'content') {
    return text
      // Remove space after opening block-level tags (p, h1-h6, li, ul, ol, div)
      .replace(/(<(?:p|h[1-6]|li|ul|ol|div)(?:\s[^>]*)?>)\s+/gi, '$1')
      // Remove space before punctuation that comes right after closing inline tags
      .replace(/(<\/(?:a|strong|em|span|b|i|u)>)\s+([.,;:!?])/gi, '$1$2')
      // Add \r\n between tags for formatting
      .replace(/></g, '>\r\n<')
      .trim()
  }
  
  // For plain text fields: convert <br> back to \r\n (same as source format)
  // Also trim any extra spaces that Google might have added at line starts
  return text
    .replace(/<br\s*\/?>/gi, '\n')      // First normalize to \n
    .split('\n')
    .map(line => line.trim())           // Trim spaces from each line
    .join('\r\n')                       // Join with \r\n for consistency with source
}

/**
 * Translate text using Google Cloud Translation API
 * Returns translated text or throws error
 * 
 * Google Translate API batching:
 * - Our API receives multiple items in a single request
 * - We send ALL texts to Google in ONE API call (batch request)
 * - Google processes them together and returns all translations
 * - This is much more efficient than making separate API calls per field
 */
async function translateWithGoogle(
  items: TranslationItem[],
  targetLang: string,
  sourceLang: string = 'nl'
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY

  if (!apiKey) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY is not configured in .env file')
  }

  // Prepare texts: convert plain newlines to <br> for plain text fields
  const preparedTexts = items.map(item => prepareTextForTranslation(item.text, item.field))

  // Google Cloud Translation API endpoint
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
      headers['Referer'] = appUrl
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        q: preparedTexts,
        target: targetLang,
        source: sourceLang,
        format: 'html',
      }),
    })

    if (!response.ok) {
      let errorDetails = ''
      try {
        const errorData = await response.json()
        errorDetails = errorData.error?.message || JSON.stringify(errorData)
      } catch {
        errorDetails = await response.text()
      }
      
      throw new Error(`Google Translation API error (${response.status}): ${errorDetails}`)
    }

    const data = await response.json()
    
    if (!data.data?.translations) {
      throw new Error('Invalid response from Google Translation API')
    }

    // Clean texts: convert <br> back to newlines for plain text fields
    return data.data.translations.map((t: any, index: number) => 
      cleanTranslatedText(t.translatedText, items[index].field)
    )
  } catch (error) {
    console.error('Translation error:', error)
    throw error
  }
}

/**
 * Translate a batch of items via Google. No server cache; page holds
 * runtime-only memo (cleared on refresh/navigate like targetData / productImages).
 */
export async function translateBatch(items: TranslationItem[]): Promise<TranslationResult[]> {
  if (items.length === 0) {
    return []
  }

  const emptyResults: TranslationResult[] = []
  const toTranslate: TranslationItem[] = []
  const missIndexMap = new Map<number, number>()

  items.forEach((item, index) => {
    if (!item.text || item.text.trim() === '') {
      emptyResults.push({ ...item, translatedText: '' })
      return
    }
    missIndexMap.set(index, toTranslate.length)
    toTranslate.push(item)
  })

  if (toTranslate.length === 0) {
    return emptyResults
  }

  const batchGroups = new Map<string, TranslationItem[]>()
  const toTranslateOrder: { groupKey: string; indexInGroup: number }[] = []
  toTranslate.forEach((item) => {
    const groupKey = `${item.sourceLang}:${item.targetLang}`
    const group = batchGroups.get(groupKey) || []
    const indexInGroup = group.length
    group.push(item)
    batchGroups.set(groupKey, group)
    toTranslateOrder.push({ groupKey, indexInGroup })
  })

  const groupResults = new Map<string, string[]>()
  for (const [groupKey, groupItems] of batchGroups.entries()) {
    const [sourceLang, targetLang] = groupKey.split(':')
    console.log(`⏳ Translating ${groupItems.length} texts: ${sourceLang} → ${targetLang}`)
    const translatedTexts = await translateWithGoogle(groupItems, targetLang, sourceLang)
    groupResults.set(groupKey, translatedTexts)
  }

  const translatedResults: TranslationResult[] = toTranslateOrder.map(({ groupKey, indexInGroup }, i) => ({
    ...toTranslate[i],
    translatedText: groupResults.get(groupKey)![indexInGroup] || '',
  }))

  const allResults: TranslationResult[] = []
  let emptyIdx = 0
  items.forEach((item, index) => {
    if (!item.text || item.text.trim() === '') {
      allResults.push(emptyResults[emptyIdx++])
    } else {
      allResults.push(translatedResults[missIndexMap.get(index)!])
    }
  })

  return allResults
}
