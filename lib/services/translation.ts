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
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\s+/g, ' ') // Normalize multiple spaces
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
 * Includes sessionId to isolate cache per user session
 */
function getCacheKey(
  sessionId: string,
  sourceLang: string,
  targetLang: string,
  field: string,
  contentHash: string
): string {
  return `${sessionId}:${sourceLang}:${targetLang}:${field}:${contentHash}`
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

  // Google Cloud Translation API endpoint
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: texts,
        target: targetLang,
        source: sourceLang,
        format: 'html', // Preserve HTML formatting
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

    return data.data.translations.map((t: any) => t.translatedText)
  } catch (error) {
    console.error('Translation error:', error)
    throw error
  }
}

/**
 * Process translation batch with caching
 * Returns translations for all items (from cache or API)
 * @param items - Array of items to translate
 * @param sessionId - Unique session identifier (cleared on page refresh/navigation)
 */
export async function translateBatch(
  items: TranslationItem[],
  sessionId: string
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
    const cacheKey = getCacheKey(
      sessionId,
      item.sourceLang,
      item.targetLang,
      item.field,
      contentHash
    )

    const cached = translationCache.get(cacheKey)
    
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
        const cacheKey = getCacheKey(
          sessionId,
          item.sourceLang,
          item.targetLang,
          item.field,
          contentHash
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
