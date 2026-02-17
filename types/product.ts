/**
 * Shared product types used across sync-operations pages
 */

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

export interface ShopInfo {
  id: string
  name: string
  role: string
  base_url: string
  languages: Language[]
}

export interface ProductDetails {
  source: ProductData[]
  targets: Record<string, ProductData[]>
  /** Per-TLD shop info: name, base_url, languages */
  shops: Record<string, ShopInfo>
}

export interface ProductImage {
  src: string
  thumb?: string
  title?: string
  sort_order: number
  id: string
}

// Editable types for preview-create page
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
export type TranslationOrigin = 'copied' | 'translated' | 'manual'

export type TranslatableField = 'title' | 'fulltitle' | 'description' | 'content'

export type LanguageTranslationMeta = {
  [field in TranslatableField]?: TranslationOrigin
}

export type TranslationMetaByLang = {
  [langCode: string]: LanguageTranslationMeta
}

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
}
