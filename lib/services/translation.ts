/**
 * Translation service using Google Cloud Translation API
 * with in-memory caching for performance optimization
 */

import crypto from 'crypto'

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

interface CacheEntry {
  translatedText: string
  timestamp: number
  sessionId: string
}

// In-memory translation cache (per session)
// Key format: {sessionId}:{sourceLang}:{targetLang}:{field}:{contentHash}
const translationCache = new Map<string, CacheEntry>()

/**
 * Generate SHA-256 hash of text content
 * Uses the text as-is to ensure exact matching
 */
function hashText(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Generate cache key from translation parameters
 * Option 3 (Hybrid): Supports both shared and shop-specific cache
 * 
 * @param sessionId - Unique session identifier
 * @param sourceLang - Source language code
 * @param targetLang - Target language code
 * @param field - Field name
 * @param contentHash - Hash of content
 * @param shopTld - Optional shop TLD for shop-specific override
 */
function getCacheKey(
  sessionId: string,
  sourceLang: string,
  targetLang: string,
  field: string,
  contentHash: string,
  shopTld?: string
): string {
  // Shop-specific override key (for re-translations)
  if (shopTld) {
    return `${sessionId}:${shopTld}:${sourceLang}:${targetLang}:${field}:${contentHash}`
  }
  // Shared cache key (for initial translations)
  return `${sessionId}:${sourceLang}:${targetLang}:${field}:${contentHash}`
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
 * Process translation batch with caching (Hybrid Strategy - Option 3)
 * Returns translations for all items (from cache or API)
 * 
 * Cache lookup priority:
 * 1. Check shop-specific override (if shopTld provided)
 * 2. Fall back to shared cache
 * 3. Call API if no cache hit
 * 
 * @param items - Array of items to translate
 * @param sessionId - Unique session identifier (cleared on page refresh/navigation)
 * @param shopTld - Optional shop TLD for shop-specific override
 */
export async function translateBatch(
  items: TranslationItem[],
  sessionId: string,
  shopTld?: string
): Promise<TranslationResult[]> {
  if (items.length === 0) {
    return []
  }

  // Step 1: Check cache and separate hits from misses
  const cacheHits: TranslationResult[] = []
  const cacheMisses: TranslationItem[] = []
  const missIndexMap = new Map<number, number>() // Original index -> miss index

  items.forEach((item, index) => {
    // Skip empty text
    if (!item.text || item.text.trim() === '') {
      cacheHits.push({
        ...item,
        translatedText: '',
      })
      return
    }

    const contentHash = hashText(item.text)
    
    // Try shop-specific override first (if shopTld provided)
    let cached: CacheEntry | undefined
    if (shopTld) {
      const shopKey = getCacheKey(sessionId, item.sourceLang, item.targetLang, item.field, contentHash, shopTld)
      cached = translationCache.get(shopKey)
    }
    
    // Fall back to shared cache
    if (!cached) {
      const sharedKey = getCacheKey(sessionId, item.sourceLang, item.targetLang, item.field, contentHash)
      cached = translationCache.get(sharedKey)
    }
    
    if (cached) {
      // Cache hit
      cacheHits.push({
        ...item,
        translatedText: cached.translatedText,
      })
    } else {
      // Cache miss
      missIndexMap.set(index, cacheMisses.length)
      cacheMisses.push(item)
    }
  })

  // Step 2: If all cache hits, return immediately
  if (cacheMisses.length === 0) {
    console.log(`✓ Translation cache: ${cacheHits.length} hits, 0 misses`)
    return cacheHits
  }

  // Step 3: Group cache misses by (sourceLang, targetLang) for batch translation
  const batchGroups = new Map<string, TranslationItem[]>()
  
  cacheMisses.forEach((item) => {
    const key = `${item.sourceLang}:${item.targetLang}`
    const group = batchGroups.get(key) || []
    group.push(item)
    batchGroups.set(key, group)
  })

  // Step 4: Translate each batch group
  const translatedResults: TranslationResult[] = []
  
  for (const [groupKey, groupItems] of batchGroups.entries()) {
    const [sourceLang, targetLang] = groupKey.split(':')
    
    try {
      // Call Google Translation API with full items (need field info for newline handling)
      console.log(
        `⏳ Translating ${groupItems.length} texts: ${sourceLang} → ${targetLang}`
      )
      const translatedTexts = await translateWithGoogle(
        groupItems,
        targetLang,
        sourceLang
      )

      // Step 5: Store in cache and build results
      groupItems.forEach((item, index) => {
        const translatedText = translatedTexts[index] || ''
        const contentHash = hashText(item.text)
        
        // For re-translations with shopTld: store in shop-specific override
        // For initial translations: store in shared cache
        const cacheKey = getCacheKey(
          sessionId,
          item.sourceLang,
          item.targetLang,
          item.field,
          contentHash,
          shopTld // Will be undefined for initial translations, defined for re-translations
        )

        // Store in cache with session ID
        translationCache.set(cacheKey, {
          translatedText,
          timestamp: Date.now(),
          sessionId,
        })

        translatedResults.push({
          ...item,
          translatedText,
        })
      })

      console.log(`✓ Translated ${translatedTexts.length} texts successfully`)
    } catch (error) {
      console.error(`Failed to translate batch ${groupKey}:`, error)
      
      // Throw error instead of returning fallback - let caller handle it
      throw error
    }
  }

  // Step 6: Merge cache hits and newly translated results in original order
  const allResults: TranslationResult[] = []
  let cacheHitIndex = 0
  let missResultIndex = 0

  items.forEach((item, index) => {
    if (missIndexMap.has(index)) {
      allResults.push(translatedResults[missResultIndex++])
    } else {
      allResults.push(cacheHits[cacheHitIndex++])
    }
  })

  console.log(
    `✓ Translation complete: ${cacheHits.length} from cache, ${cacheMisses.length} items translated via ${batchGroups.size} Google API ${batchGroups.size === 1 ? 'call' : 'calls'}`
  )

  return allResults
}
