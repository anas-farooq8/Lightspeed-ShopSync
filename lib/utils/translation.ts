/**
 * Frontend translation utilities for Preview-Create page.
 * Optional translation memo = runtime-only reuse (like product images / targetData;
 * cleared on refresh or navigate).
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
 * Generate memo key for translation (Hybrid Model Option 3).
 * - Initial translations: shared key (no shopTld) - same translation reused across shops
 * - Re-translations: shop-specific key (with shopTld) - allows shop-specific override
 */
function getTranslationMemoKey(item: TranslationItem, shopTld?: string): string {
  const base = `${item.sourceLang}:${item.targetLang}:${item.field}:${item.text}`
  return shopTld ? `${shopTld}:${base}` : base
}

/**
 * Call the translation API. If memo is provided, hits are served from memo and
 * only misses are sent to the API; new results are stored in memo (runtime-only,
 * gone when the page unmounts).
 * 
 * Hybrid Model Option 3:
 * - shopTld undefined: shared memo (initial translations) - reused across shops
 * - shopTld provided: shop-specific memo (re-translations) - allows per-shop override
 */
export async function callTranslationAPI(
  items: TranslationItem[],
  memo?: Map<string, string>,
  shopTld?: string
): Promise<TranslationResult[]> {
  if (items.length === 0) {
    return []
  }

  if (!memo) {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Translation failed')
    }
    return await response.json()
  }

  const resultByIndex = new Map<number, TranslationResult>()
  const misses: TranslationItem[] = []
  const missOriginalIndices: number[] = []

  items.forEach((item, index) => {
    // Try shop-specific first (if shopTld provided), then fall back to shared
    const cached = shopTld
      ? memo.get(getTranslationMemoKey(item, shopTld)) ?? memo.get(getTranslationMemoKey(item))
      : memo.get(getTranslationMemoKey(item))
    
    if (cached !== undefined) {
      resultByIndex.set(index, { ...item, translatedText: cached })
    } else {
      missOriginalIndices.push(index)
      misses.push(item)
    }
  })

  if (misses.length > 0) {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: misses }),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Translation failed')
    }
    const missResults: TranslationResult[] = await response.json()
    // Store results in memo (shop-specific if shopTld provided, otherwise shared)
    missResults.forEach((result) => {
      memo.set(getTranslationMemoKey(result, shopTld), result.translatedText)
    })
    // Map results back to original indices
    missOriginalIndices.forEach((origIdx, i) => {
      resultByIndex.set(origIdx, missResults[i])
    })
  }

  return items.map((_, i) => resultByIndex.get(i)!)
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
 * Store translation result in memo (generalized helper).
 * Used after re-translate operations to cache fresh translations.
 * Only stores if both sourceText and translatedText are non-empty.
 */
export function storeTranslationInMemo(
  memo: Map<string, string>,
  sourceLang: string,
  targetLang: string,
  field: string,
  sourceText: string,
  translatedText: string,
  shopTld?: string
): void {
  if (!sourceText?.trim() || !translatedText?.trim()) return
  
  const key = getTranslationMemoKey(
    { sourceLang, targetLang, field, text: sourceText },
    shopTld
  )
  memo.set(key, translatedText)
}

/**
 * Get base value for a field (reset / re-translate). Uses optional memo for
 * runtime-only reuse (cleared on refresh/navigate).
 * 
 * @param memo - Optional memo for caching (undefined = always call API)
 * @param shopTld - Optional shop TLD for shop-specific memo (re-translations)
 */
export async function getBaseValueForField(
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLangCode: string,
  field: TranslatableField,
  memo?: Map<string, string>,
  shopTld?: string
): Promise<{ value: string; origin: TranslationOrigin }> {
  const sourceValue = sourceContent?.[field] || ''

  if (targetLangCode === sourceDefaultLang) {
    return { value: sourceValue, origin: 'copied' }
  }
  if (!sourceValue || sourceValue.trim() === '') {
    return { value: '', origin: 'translated' }
  }

  try {
    const results = await callTranslationAPI(
      [
        {
          sourceLang: sourceDefaultLang,
          targetLang: targetLangCode,
          field,
          text: sourceValue,
        },
      ],
      memo,
      shopTld
    )
    return {
      value: results[0]?.translatedText || sourceValue,
      origin: 'translated',
    }
  } catch (error) {
    console.error('Failed to translate field:', error)
    return { value: sourceValue, origin: 'translated' }
  }
}

/**
 * Store multiple translation results in memo (generalized helper for batch operations).
 * Used after re-translate language operations to cache fresh translations.
 * Only stores translations with origin 'translated' (skips 'copied' and 'manual').
 */
export function storeTranslationsInMemo(
  memo: Map<string, string>,
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLang: string,
  results: Record<TranslatableField, { value: string; origin: TranslationOrigin }>,
  shopTld?: string
): void {
  Object.entries(results).forEach(([field, result]) => {
    if (result.origin === 'translated') {
      const sourceValue = sourceContent[field as TranslatableField]
      storeTranslationInMemo(
        memo,
        sourceDefaultLang,
        targetLang,
        field,
        sourceValue || '',
        result.value,
        shopTld
      )
    }
  })
}

/**
 * Get base values for all fields in a language (batch). Uses optional memo for
 * runtime-only reuse (cleared on refresh/navigate).
 * 
 * @param memo - Optional memo for caching (undefined = always call API)
 * @param shopTld - Optional shop TLD for shop-specific memo (re-translations)
 */
export async function getBaseValuesForLanguage(
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLangCode: string,
  fields: TranslatableField[],
  memo?: Map<string, string>,
  shopTld?: string
): Promise<Record<TranslatableField, { value: string; origin: TranslationOrigin }>> {
  const results: Record<string, { value: string; origin: TranslationOrigin }> = {}

  if (targetLangCode === sourceDefaultLang) {
    fields.forEach((field) => {
      results[field] = { value: sourceContent?.[field] || '', origin: 'copied' }
    })
    return results
  }

  const translationItems: TranslationItem[] = []
  const fieldIndexMap: Record<number, TranslatableField> = {}

  fields.forEach((field) => {
    const sourceValue = sourceContent?.[field] || ''
    if (sourceValue && sourceValue.trim() !== '') {
      fieldIndexMap[translationItems.length] = field
      translationItems.push({
        sourceLang: sourceDefaultLang,
        targetLang: targetLangCode,
        field,
        text: sourceValue,
      })
    } else {
      results[field] = { value: '', origin: 'translated' }
    }
  })

  if (translationItems.length === 0) {
    return results
  }

  try {
    const translationResults = await callTranslationAPI(translationItems, memo, shopTld)
    translationResults.forEach((result, index) => {
      const f = fieldIndexMap[index]
      if (f) {
        results[f] = {
          value: result.translatedText || sourceContent?.[f] || '',
          origin: 'translated',
        }
      }
    })
  } catch (error) {
    console.error('Failed to translate fields:', error)
    fields.forEach((field) => {
      if (!results[field]) {
        results[field] = {
          value: sourceContent?.[field] || '',
          origin: 'translated',
        }
      }
    })
  }

  return results
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
