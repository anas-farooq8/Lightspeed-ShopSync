/**
 * Product domain types.
 *
 * Used by:
 * - Sync-operations dashboard pages.
 * - Product display and edit components.
 * - Translation utilities for product content.
 */

// Core product structures

export interface Language {
  code: string
  is_default: boolean
}

export interface ProductContent {
  url?: string
  title?: string
  fulltitle?: string
  description?: string
  content?: string
}

export interface VariantContent {
  title?: string
}

export interface ImageInfo {
  src?: string
  thumb?: string
  title?: string
}

export interface Variant {
  variant_id: number
  sku: string | null
  is_default: boolean
  sort_order?: number
  price_excl: number
  image: ImageInfo | null
  content_by_language?: Record<string, VariantContent>
  content?: Record<string, VariantContent>
}

/**
 * Complete product information used throughout the sync-operations UI.
 */
export interface ProductData {
  shop_id: string
  shop_name: string
  shop_tld: string
  shop_role?: string
  base_url: string
  product_id: number
  default_variant_id: number
  sku?: string
  matched_by_default_variant?: boolean
  visibility: string
  product_image: ImageInfo | null
  ls_created_at: string
  images_link?: string | null
  images?: ProductImage[]
  content_by_language?: Record<string, ProductContent>
  content?: Record<string, ProductContent>
  variants: Variant[]
  variant_count: number
  languages?: Language[]
}

/**
 * Per-shop metadata used in product detail views.
 */
export interface ShopInfo {
  id: string
  name: string
  role: string
  base_url: string
  languages: Language[]
}

/**
 * Aggregated product details for a given SKU (source + targets).
 */
export interface ProductDetails {
  source: ProductData[]
  targets: Record<string, ProductData[]>
  /** Per-TLD shop info: name, base_url, languages */
  shops: Record<string, ShopInfo>
}

/**
 * Image associated with a product (full size + thumbnail).
 */
export interface ProductImage {
  src: string
  thumb?: string
  title?: string
  sort_order: number
  id: string
}

// Editable types for preview-create page

/**
 * Editable variant state used on the preview-create screen.
 */
export interface EditableVariant {
  variant_id: number
  temp_id?: string
  sku: string | null
  is_default: boolean
  sort_order?: number
  price_excl: number
  image: ImageInfo | null
  originalSku?: string | null
  originalPrice?: number
  originalTitle?: Record<string, string>
  content_by_language: Record<string, VariantContent>
  removed?: boolean
}

// Translation types

/**
 * How a translated field value was produced.
 * - copied: Direct copy from source (same language)
 * - translated: Machine translated from source
 * - manual: Manually edited by user
 * - existing: Loaded from existing target product (edit mode)
 */
export type TranslationOrigin = 'copied' | 'translated' | 'manual' | 'existing'

export type TranslatableField = 'title' | 'fulltitle' | 'description' | 'content'

/**
 * Per-field translation origin for a single language.
 */
export type LanguageTranslationMeta = {
  [field in TranslatableField]?: TranslationOrigin
}

/**
 * Per-language translation metadata for a product or variant.
 */
export type TranslationMetaByLang = {
  [langCode: string]: LanguageTranslationMeta
}

/**
 * Types for sync-operations product list UI.
 * Used by ProductListTab, ProductListTable, ProductCard, TargetShopSelectionDialog.
 */
export interface TargetShopInfo {
  shop_id: string
  shop_name: string
  shop_tld: string
  status: 'not_exists' | 'exists' | 'unknown'
  match_type: 'default_variant' | 'non_default_variant' | 'no_match'
  total_matches: number
  default_matches: number
  non_default_matches: number
}

export interface SyncProduct {
  source_shop_id: string
  source_shop_name: string
  source_shop_tld: string
  source_product_id: number
  source_variant_id: number
  default_sku: string
  product_title: string
  variant_title: string
  product_image: unknown
  price_excl: number
  source_variant_count: number
  ls_created_at: string
  source_duplicate_count: number
  source_has_duplicates: boolean
  source_duplicate_product_ids: number[]
  targets: Record<string, TargetShopInfo>
}

/**
 * Editable target-shop product state, including images and dirty tracking.
 */
export interface EditableTargetData {
  content_by_language: Record<string, ProductContent>
  variants: EditableVariant[]
  images: ProductImage[]
  originalImageOrder: number[]
  removedImageIds: Set<string>
  dirty: boolean
  dirtyFields: Set<string>
  dirtyVariants: Set<string | number>
  originalVariantOrder: number[]
  visibility: string
  originalVisibility: string
  productImage: ImageInfo | null
  originalProductImage: ImageInfo | null
  orderChanged: boolean
  imageOrderChanged: boolean
  translationMeta?: TranslationMetaByLang
  sourceProduct?: ProductData // Store source product for comparison in edit mode
  targetProductId?: number // Store target product ID for edit mode
  targetImagesLink?: string | null // Store target product images link for fetching
}
