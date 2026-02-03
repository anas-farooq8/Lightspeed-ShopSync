export interface VariantSyncStatus {
  // Source (.nl) data
  nl_variant_id: number
  nl_product_id: number
  sku: string
  price_excl: number
  is_default: boolean
  variant_image: {
    title: string | null
    thumb: string | null
    src: string | null
  } | null
  product_image: {
    title: string | null
    thumb: string | null
    src: string | null
  } | null
  updated_at: string
  variant_title: string
  product_title: string
  description: string | null
  content: string | null
  shop_id: string

  // Duplicate info
  nl_duplicate_count: number
  has_nl_duplicates: boolean

  // .de match status
  de_match_count: number
  de_variant_ids: number[] | null
  de_variant_titles: string[] | null
  de_status: 'not_exists' | 'exists_single' | 'exists_multiple'

  // .be match status
  be_match_count: number
  be_variant_ids: number[] | null
  be_variant_titles: string[] | null
  be_status: 'not_exists' | 'exists_single' | 'exists_multiple'
}

export interface SyncStats {
  total_nl_skus: number
  total_de_skus: number
  total_be_skus: number
  missing_in_de: number
  missing_in_be: number
  exists_in_both: number
}
