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
 * Normalize text before hashing to ensure consistent cache hits
 * NOTE: This is only for cache key generation, NOT for the actual text sent to Google
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\s+/g, ' ') // Normalize multiple spaces (only for hashing)
    .replace(/<p>\s*<\/p>/g, '') // Remove empty paragraphs
}

/**
 * Generate SHA-256 hash of normalized text
 */
function hashText(text: string): string {
  const normalized = normalizeText(text)
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')
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
 * Prepare text for translation by preserving newlines
 * Converts plain text newlines to <br> tags so Google Translate preserves them
 */
function prepareTextForTranslation(text: string): string {
  // Check if text already contains HTML tags
  const hasHtmlTags = /<[^>]+>/g.test(text)
  
  if (hasHtmlTags) {
    // Already HTML, return as-is (Quill content, etc.)
    return text
  }
  
  // Plain text: convert newlines to <br> tags to preserve line breaks
  // Replace \r\n or \n with <br> but preserve the structure
  return text.replace(/\r?\n/g, '<br>')
}

/**
 * Clean up translated text by removing artifacts
 * Removes extra spaces around <br> tags that Google might add
 */
function cleanTranslatedText(text: string, originalWasPlainText: boolean): string {
  if (!originalWasPlainText) {
    // Was already HTML, return as-is
    return text
  }
  
  // Clean up <br> tags - remove extra spaces Google might add
  return text
    .replace(/\s*<br\s*\/?>\s*/gi, '<br>') // Normalize <br> tags
    .replace(/<br>\s*<br>/gi, '<br><br>') // Preserve double line breaks
}

/**
 * Translate text using Google Cloud Translation API
 * Returns translated text or throws error
 */
async function translateWithGoogle(
  texts: string[],
  targetLang: string,
  sourceLang: string = 'nl'
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY

  if (!apiKey) {
    throw new Error('GOOGLE_TRANSLATE_API_KEY is not configured')
  }

  // Track which texts were plain text vs HTML
  const plainTextFlags = texts.map(text => !/<[^>]+>/g.test(text))
  
  // Prepare texts for translation (convert newlines to <br> for plain text)
  const preparedTexts = texts.map(text => prepareTextForTranslation(text))

  // Google Cloud Translation API endpoint
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: preparedTexts,
        target: targetLang,
        source: sourceLang,
        format: 'html', // Preserve HTML formatting (including our <br> tags)
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Google Translation API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    
    if (!data.data?.translations) {
      throw new Error('Invalid response from Google Translation API')
    }

    // Clean up translated texts
    return data.data.translations.map((t: any, index: number) => 
      cleanTranslatedText(t.translatedText, plainTextFlags[index])
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
      // Extract texts to translate
      const textsToTranslate = groupItems.map((item) => item.text)
      
      // Call Google Translation API
      console.log(
        `⏳ Translating ${textsToTranslate.length} texts: ${sourceLang} → ${targetLang}`
      )
      const translatedTexts = await translateWithGoogle(
        textsToTranslate,
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
    `✓ Translation complete: ${cacheHits.length} cache hits, ${cacheMisses.length} API calls`
  )

  return allResults
}

/**
 * Clear translation cache for a specific session
 * Called when user navigates away or refreshes
 */
export function clearTranslationCache(sessionId?: string): void {
  if (sessionId) {
    // Clear only entries for this session
    let cleared = 0
    for (const [key, value] of translationCache.entries()) {
      if (value.sessionId === sessionId) {
        translationCache.delete(key)
        cleared++
      }
    }
    console.log(`✓ Cleared translation cache for session (${cleared} entries)`)
  } else {
    // Clear entire cache
    const size = translationCache.size
    translationCache.clear()
    console.log(`✓ Cleared entire translation cache (${size} entries)`)
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return {
    size: translationCache.size,
    entries: Array.from(translationCache.keys()).slice(0, 10), // First 10 keys
  }
}
