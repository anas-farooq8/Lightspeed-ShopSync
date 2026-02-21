/**
 * Lib utilities – single file for shared helpers.
 * Merged from: languages, images, variants, product-list, translation.
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Language, ImageInfo, EditableVariant, ProductContent, TranslatableField, TranslationOrigin, LanguageTranslationMeta, TranslationMetaByLang } from '@/types/product'
import type { SyncProduct } from '@/types/product'
import type { TranslationItem, TranslationResult } from '@/lib/services/translation'

// ─── UI / Formatting ────────────────────────────────────────────────────────

/** Merge Tailwind class names with conditional logic and conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Sort shops: source first, then targets alphabetically by TLD. */
export function sortShopsSourceFirstThenByTld<T extends { role?: string; tld: string }>(
  items: T[] | null | undefined
): T[] {
  if (!Array.isArray(items)) return []
  return [...items].sort((a, b) => {
    if (a.role === 'source' && b.role !== 'source') return -1
    if (a.role !== 'source' && b.role === 'source') return 1
    return a.tld.localeCompare(b.tld)
  })
}

/** Format ISO date string for short display (e.g. "17 Feb 2025"). */
export function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Format ISO date string for display (e.g. "Feb 5, 2025, 14:30:00"). */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/** Get display label for shop role. */
export function getShopRoleLabel(role?: string): string {
  return role === 'source' ? 'Source' : role === 'target' ? 'Target' : ''
}

/** Normalize base URL to safe external href (adds https if missing). */
export function toSafeExternalHref(baseUrl: string | null | undefined): string | null {
  const raw = (baseUrl ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `https://${raw}`
}

// ─── Languages ──────────────────────────────────────────────────────────────

/** Sort languages: default first, then alphabetically by code. */
export function sortLanguages(languages: Language[]): Language[] {
  return [...languages].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.code.localeCompare(b.code)
  })
}

/** Get default language code from sorted languages, fallback to first or 'nl'. */
export function getDefaultLanguageCode(languages: Language[]): string {
  const sorted = sortLanguages(languages)
  return sorted.find((l) => l.is_default)?.code ?? sorted[0]?.code ?? ''
}

// ─── Images ─────────────────────────────────────────────────────────────────

/** Compare two ImageInfo objects for equality by src (unique per image). */
export function isSameImageInfo(a: ImageInfo | null, b: ImageInfo | null): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  return (a.src ?? '') === (b.src ?? '')
}

/** Get display URL from image info (prefers src, falls back to thumb). */
export function getImageUrl(
  image: ImageInfo | { src?: string; thumb?: string } | null
): string | null {
  if (!image) return null
  const url = image.src ?? image.thumb
  return url ?? null
}

/** Image with optional sortOrder for display logic */
type ImageWithSortOrder = { id?: number | string; src?: string; thumb?: string; title?: string; sortOrder?: number; sort_order?: number }

/**
 * Get the product image to display.
 * When images array is provided, use the image with sortOrder=1 whose src matches product_image.
 * If multiple have sortOrder=1, only the one matching product_image.src is used.
 */
export function getDisplayProductImage(
  product: { product_image?: { src?: string; thumb?: string; title?: string } | null },
  images?: ImageWithSortOrder[] | null
): { src?: string; thumb?: string; title?: string } | null {
  if (!images?.length) return null
  const sortOrder1 = images.filter((img) => (img.sortOrder ?? img.sort_order ?? 999) === 1)
  if (!sortOrder1.length) return null
  const productSrc = product.product_image?.src ?? ''
  const match = productSrc ? sortOrder1.find((img) => (img.src ?? '') === productSrc) : null
  return match ? { src: match.src, thumb: match.thumb, title: match.title } : null
}

/** Sort by sort_order (or sortOrder) ascending. Use for variants, images, or any item with sort_order. */
export function sortBySortOrder<T extends { sort_order?: number; sortOrder?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.sort_order ?? a.sortOrder ?? 999) - (b.sort_order ?? b.sortOrder ?? 999))
}

/**
 * Sort images for display: product image (matching productImageSrc) first, then by sortOrder.
 * When multiple have sortOrder=1, the one matching productImageSrc is shown first.
 */
export function sortImagesForDisplay<T extends ImageWithSortOrder>(
  images: T[],
  productImageSrc?: string | null
): T[] {
  if (!images.length) return []
  const sorted = sortBySortOrder(images)
  if (!productImageSrc) return sorted
  const matchIdx = sorted.findIndex((img) => (img.src ?? '') === productImageSrc)
  if (matchIdx <= 0) return sorted
  const [match] = sorted.splice(matchIdx, 1)
  return [match, ...sorted]
}

// ─── Variants ───────────────────────────────────────────────────────────────

interface SortableVariant {
  sort_order?: number
  is_default: boolean
  variant_id: number
}

/** Get stable key for editable variant (temp_id for new, variant_id for existing). */
export function getVariantKey(v: EditableVariant): string | number {
  return v.temp_id ?? v.variant_id
}

/** Sort variants: by sort_order, then default first, then by variant_id. */
export function sortVariants<T extends SortableVariant>(variants: T[]): T[] {
  return [...variants].sort((a, b) => {
    const sa = a.sort_order ?? 999999
    const sb = b.sort_order ?? 999999
    if (sa !== sb) return sa - sb
    if (a.is_default && !b.is_default) return -1
    if (!a.is_default && b.is_default) return 1
    return a.variant_id - b.variant_id
  })
}

// ─── Product List ───────────────────────────────────────────────────────────

export interface TargetShop {
  tld: string
  name: string
}

/** Extract unique target shops from products and sort (source first, then by TLD). */
export function extractTargetShops(products: SyncProduct[]): TargetShop[] {
  if (products.length === 0) return []

  const shopsSet = new Set<string>()
  const shopsMap = new Map<string, string>()

  products.forEach((product) => {
    Object.entries(product.targets ?? {}).forEach(([tld, targetInfo]) => {
      shopsSet.add(tld)
      shopsMap.set(tld, targetInfo.shop_name ?? tld)
    })
  })

  return sortShopsSourceFirstThenByTld(
    Array.from(shopsSet).map((tld) => ({
      tld,
      name: shopsMap.get(tld) ?? tld,
    }))
  )
}

// ─── Translation ────────────────────────────────────────────────────────────

function getTranslationMemoKey(item: TranslationItem, shopTld?: string): string {
  const base = `${item.sourceLang}:${item.targetLang}:${item.field}:${item.text}`
  return shopTld ? `${shopTld}:${base}` : base
}

export async function callTranslationAPI(
  items: TranslationItem[],
  memo?: Map<string, string>,
  shopTld?: string
): Promise<TranslationResult[]> {
  if (items.length === 0) return []

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
    missResults.forEach((result) => {
      memo.set(getTranslationMemoKey(result, shopTld), result.translatedText)
    })
    missOriginalIndices.forEach((origIdx, i) => {
      resultByIndex.set(origIdx, missResults[i])
    })
  }

  return items.map((_, i) => resultByIndex.get(i)!)
}

export function prepareTranslationBatch(
  sourceContent: ProductContent,
  sourceDefaultLang: string,
  targetLanguages: { code: string; is_default: boolean }[]
): { translationItems: TranslationItem[]; copyLanguages: string[] } {
  const translationItems: TranslationItem[] = []
  const copyLanguages: string[] = []
  const translatableFields: TranslatableField[] = ['title', 'fulltitle', 'description', 'content']

  targetLanguages.forEach((lang) => {
    if (lang.code === sourceDefaultLang) {
      copyLanguages.push(lang.code)
    } else {
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
  const resultMap = new Map<string, string>()

  translationResults.forEach((result) => {
    resultMap.set(`${result.targetLang}:${result.field}`, result.translatedText)
  })

  targetLanguages.forEach((lang) => {
    const langCode = lang.code
    const meta: LanguageTranslationMeta = {}

    if (langCode === sourceDefaultLang) {
      content_by_language[langCode] = {
        title: sourceContent?.title || '',
        fulltitle: sourceContent?.fulltitle || '',
        description: sourceContent?.description || '',
        content: sourceContent?.content || '',
      }
      if (sourceContent?.title) meta.title = 'copied'
      if (sourceContent?.fulltitle) meta.fulltitle = 'copied'
      if (sourceContent?.description) meta.description = 'copied'
      if (sourceContent?.content) meta.content = 'copied'
    } else {
      content_by_language[langCode] = {
        title: resultMap.get(`${langCode}:title`) || '',
        fulltitle: resultMap.get(`${langCode}:fulltitle`) || '',
        description: resultMap.get(`${langCode}:description`) || '',
        content: resultMap.get(`${langCode}:content`) || '',
      }
      if (content_by_language[langCode].title) meta.title = 'translated'
      if (content_by_language[langCode].fulltitle) meta.fulltitle = 'translated'
      if (content_by_language[langCode].description) meta.description = 'translated'
      if (content_by_language[langCode].content) meta.content = 'translated'
    }

    translationMeta[langCode] = meta
  })

  return { content_by_language, translationMeta }
}

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
  memo.set(
    getTranslationMemoKey({ sourceLang, targetLang, field, text: sourceText }, shopTld),
    translatedText
  )
}

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
      [{ sourceLang: sourceDefaultLang, targetLang: targetLangCode, field, text: sourceValue }],
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
      storeTranslationInMemo(
        memo,
        sourceDefaultLang,
        targetLang,
        field,
        sourceContent[field as TranslatableField] || '',
        result.value,
        shopTld
      )
    }
  })
}

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

  if (translationItems.length === 0) return results

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

export function deduplicateTranslationItems(items: TranslationItem[]): {
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
      indexMap[originalIndex] = existingIndex
    } else {
      const newIndex = uniqueItems.length
      uniqueItems.push(item)
      seen.set(key, newIndex)
      indexMap[originalIndex] = newIndex
    }
  })

  return { uniqueItems, indexMap }
}

export function reconstructResults(
  uniqueResults: TranslationResult[],
  indexMap: number[]
): TranslationResult[] {
  return indexMap.map((uniqueIndex) => uniqueResults[uniqueIndex])
}

export function getOriginLabel(origin: TranslationOrigin | undefined): string {
  switch (origin) {
    case 'copied':
      return 'Copied from Source'
    case 'translated':
      return 'Translated from Source'
    case 'manual':
      return 'Manually edited'
    default:
      return ''
  }
}

/** Short label for badges (Copied, Translated, Edited) */
export function getOriginShortLabel(origin: TranslationOrigin | undefined): string {
  switch (origin) {
    case 'copied':
      return 'Copied'
    case 'translated':
      return 'Translated'
    case 'manual':
      return 'Edited'
    default:
      return ''
  }
}

export function getLanguageOrigin(meta: LanguageTranslationMeta | undefined): TranslationOrigin | undefined {
  if (!meta) return undefined

  const origins = Object.values(meta).filter(Boolean)
  if (origins.length === 0) return undefined

  if (origins.includes('manual')) return 'manual'
  if (origins.includes('translated')) return 'translated'
  if (origins.includes('copied')) return 'copied'

  return undefined
}
