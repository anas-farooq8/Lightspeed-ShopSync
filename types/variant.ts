/**
 * Product Sync Status (Product-Level Sync)
 * 
 * Represents a product from .nl (via its default variant)
 * and its sync status with .de and .be shops.
 * 
 * Matching logic: Products are matched by their DEFAULT VARIANT SKU
 * - .nl product ←→ .de/.be product
 * - Only default variants are used for matching (is_default = true)
 * - All variants within a product are synced together as a unit
 */
export interface ProductSyncStatus {
  // Source (.nl) product data (via default variant)
  nl_default_variant_id: number
  nl_product_id: number
  default_sku: string  // 🔑 Matching key for product-level sync
  price_excl: number
  is_default: boolean  // Always true (filtered to default variants only)
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
  default_variant_title: string
  product_title: string
  description: string | null
  content: string | null
  shop_id: string
  nl_variant_count: number  // Total variants in this .nl product

  // Duplicate default SKU info (multiple .nl products with same default SKU)
  nl_duplicate_count: number
  has_nl_duplicates: boolean
  nl_duplicate_product_ids: number[] | null

  // .de match status (matched by default variant SKU)
  de_match_count: number
  de_product_ids: number[] | null
  de_default_variant_ids: number[] | null
  de_product_titles: string[] | null
  de_variant_counts: number[] | null  // Variant counts per matched product
  de_status: 'not_exists' | 'exists_single' | 'exists_multiple'

  // .be match status (matched by default variant SKU)
  be_match_count: number
  be_product_ids: number[] | null
  be_default_variant_ids: number[] | null
  be_product_titles: string[] | null
  be_variant_counts: number[] | null  // Variant counts per matched product
  be_status: 'not_exists' | 'exists_single' | 'exists_multiple'
}

/**
 * Dashboard KPI Statistics
 * 
 * Provides overview counts for all shops:
 * - Total product counts (includes duplicate default SKUs)
 * - Unique SKU counts
 * - Missing product counts
 * - Duplicate SKU counts
 */
export interface SyncStats {
  // Total product counts (includes duplicates)
  total_nl_products: number
  total_de_products: number
  total_be_products: number
  
  // Unique SKU counts
  unique_nl_skus: number
  unique_de_skus: number
  unique_be_skus: number
  
  // Missing products (based on distinct SKUs)
  missing_in_de: number
  missing_in_be: number
  exists_in_both: number
  
  // Duplicate SKU counts (products with same default SKU)
  nl_duplicate_skus: number
  de_duplicate_skus: number
  be_duplicate_skus: number
}
