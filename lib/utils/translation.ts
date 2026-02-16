/**
 * Frontend translation utilities for Preview-Create page
 */

import type {
  ProductContent,
  TranslatableField,
  TranslationOrigin,
  LanguageTranslationMeta,
  TranslationMetaByLang,
} from '@/types/product'
import type { TranslationItem, TranslationResult } from '@/lib/services/translation'

/**
 * Call the translation API with a batch of items
 * @param items - Items to translate
 * @param sessionId - Unique session identifier for cache isolation
 */
export async function callTranslationAPI(
  items: TranslationItem[],
  sessionId: string
): Promise<TranslationResult[]> {
  if (items.length === 0) {
    return []
  }

  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items, sessionId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Translation failed')
    }

    return await response.json()
  } catch (error) {
    console.error('Translation API call failed:', error)
    throw error
  }
}

/**
 * Prepare translation batch for a target shop
 * Returns items to translate and copy results
 */
export function prepareTranslationBatch(
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLanguages: { code: string; is_default: boolean }[]
): {
  translationItems: TranslationItem[]
  copyLanguages: string[]
} {
  const translationItems: TranslationItem[] = []
  const copyLanguages: string[] = []

  const translatableFields: TranslatableField[] = [
    'title',
    'fulltitle',
    'description',
    'content',
  ]

  targetLanguages.forEach((lang) => {
    if (lang.code === sourceDefaultLang) {
      // Same language: copy directly
      copyLanguages.push(lang.code)
    } else {
      // Different language: translate
      translatableFields.forEach((field) => {
        const text = sourceContent?.[field] || ''
        if (text && text.trim() !== '') {
          translationItems.push({
            sourceLang: sourceDefaultLang,
            targetLang: lang.code,
            field,
            text,
          })
        }
      })
    }
  })

  return { translationItems, copyLanguages }
}

/**
 * Apply translation results to content and build metadata
 */
export function applyTranslationResults(
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLanguages: { code: string; is_default: boolean }[],
  translationResults: TranslationResult[]
): {
  content_by_language: Record<string, ProductContent>
  translationMeta: TranslationMetaByLang
} {
  const content_by_language: Record<string, ProductContent> = {}
  const translationMeta: TranslationMetaByLang = {}

  // Create a lookup map for translation results
  const resultMap = new Map<string, string>()
  translationResults.forEach((result) => {
    const key = `${result.targetLang}:${result.field}`
    resultMap.set(key, result.translatedText)
  })

  targetLanguages.forEach((lang) => {
    const langCode = lang.code
    const meta: LanguageTranslationMeta = {}

    if (langCode === sourceDefaultLang) {
      // Copy content directly
      content_by_language[langCode] = {
        title: sourceContent?.title || '',
        fulltitle: sourceContent?.fulltitle || '',
        description: sourceContent?.description || '',
        content: sourceContent?.content || '',
      }

      // Mark as copied
      if (sourceContent?.title) meta.title = 'copied'
      if (sourceContent?.fulltitle) meta.fulltitle = 'copied'
      if (sourceContent?.description) meta.description = 'copied'
      if (sourceContent?.content) meta.content = 'copied'
    } else {
      // Use translated content
      content_by_language[langCode] = {
        title: resultMap.get(`${langCode}:title`) || '',
        fulltitle: resultMap.get(`${langCode}:fulltitle`) || '',
        description: resultMap.get(`${langCode}:description`) || '',
        content: resultMap.get(`${langCode}:content`) || '',
      }

      // Mark as translated (only non-empty fields)
      if (content_by_language[langCode].title) meta.title = 'translated'
      if (content_by_language[langCode].fulltitle) meta.fulltitle = 'translated'
      if (content_by_language[langCode].description) meta.description = 'translated'
      if (content_by_language[langCode].content) meta.content = 'translated'
    }

    translationMeta[langCode] = meta
  })

  return { content_by_language, translationMeta }
}

/**
 * Get base value for a field (used in reset operations)
 * This will either copy from source or re-translate
 */
export async function getBaseValueForField(
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLangCode: string,
  field: TranslatableField,
  sessionId: string
): Promise<{ value: string; origin: TranslationOrigin }> {
  const sourceValue = sourceContent?.[field] || ''

  // If target language matches source, copy directly
  if (targetLangCode === sourceDefaultLang) {
    return {
      value: sourceValue,
      origin: 'copied',
    }
  }

  // If empty source, return empty
  if (!sourceValue || sourceValue.trim() === '') {
    return {
      value: '',
      origin: 'translated',
    }
  }

  // Otherwise, translate
  try {
    const results = await callTranslationAPI([
      {
        sourceLang: sourceDefaultLang,
        targetLang: targetLangCode,
        field,
        text: sourceValue,
      },
    ], sessionId)

    return {
      value: results[0]?.translatedText || sourceValue,
      origin: 'translated',
    }
  } catch (error) {
    console.error('Failed to translate field:', error)
    // Fallback to source value on error
    return {
      value: sourceValue,
      origin: 'translated',
    }
  }
}

/**
 * Deduplicate translation items by (targetLang, field, text)
 * Returns unique items and a map to reconstruct full results
 */
export function deduplicateTranslationItems(
  items: TranslationItem[]
): {
  uniqueItems: TranslationItem[]
  indexMap: number[]
} {
  const seen = new Map<string, number>()
  const uniqueItems: TranslationItem[] = []
  const indexMap: number[] = []

  items.forEach((item, originalIndex) => {
    const key = `${item.targetLang}:${item.field}:${item.text}`
    const existingIndex = seen.get(key)

    if (existingIndex !== undefined) {
      // Already seen, map to existing
      indexMap[originalIndex] = existingIndex
    } else {
      // New item
      const newIndex = uniqueItems.length
      uniqueItems.push(item)
      seen.set(key, newIndex)
      indexMap[originalIndex] = newIndex
    }
  })

  return { uniqueItems, indexMap }
}

/**
 * Reconstruct full results from deduplicated results
 */
export function reconstructResults(
  uniqueResults: TranslationResult[],
  indexMap: number[]
): TranslationResult[] {
  return indexMap.map((uniqueIndex) => uniqueResults[uniqueIndex])
}

/**
 * Get a human-readable label for translation origin
 */
export function getOriginLabel(origin: TranslationOrigin | undefined): string {
  switch (origin) {
    case 'copied':
      return 'Copied from NL'
    case 'translated':
      return 'Translated from NL'
    case 'manual':
      return 'Manually edited'
    default:
      return ''
  }
}

/**
 * Get badge variant for translation origin
 */
export function getOriginBadgeVariant(
  origin: TranslationOrigin | undefined
): 'default' | 'secondary' | 'outline' {
  switch (origin) {
    case 'copied':
      return 'secondary'
    case 'translated':
      return 'default'
    case 'manual':
      return 'outline'
    default:
      return 'secondary'
  }
}

/**
 * Determine the most prominent origin for a language (for tab badges)
 * Uses metadata as source of truth, not dirty flags
 */
export function getLanguageOrigin(
  meta: LanguageTranslationMeta | undefined
): TranslationOrigin | undefined {
  if (!meta) return undefined

  // Use the metadata origin values directly
  const origins = Object.values(meta).filter(Boolean)
  if (origins.length === 0) return undefined

  // Priority: manual > translated > copied
  if (origins.includes('manual')) return 'manual'
  if (origins.includes('translated')) return 'translated'
  if (origins.includes('copied')) return 'copied'

  return undefined
}
