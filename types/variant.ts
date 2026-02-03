/**
 * Product Sync Status (Product-Level Sync)
 * 
 * Represents a product from .nl (via its default variant)
 * and its sync status with .de and .be shops.
 * 
 * Matching logic: Products matched by variant SKU (default first, then non-default)
 * - .nl product ←→ .de/.be product
 * - First: match by DEFAULT variant SKU
 * - Fallback: match by NON-DEFAULT variant SKU (product exists but structured differently)
 */
export interface ProductSyncStatus {
  // Source (.nl) - list display only; fetch full details on product/sync page
  nl_default_variant_id: number
  nl_product_id: number
  default_sku: string  // 🔑 Matching key
  price_excl: number | null
  product_image: { title: string | null; thumb: string | null; src: string | null } | null
  updated_at: string
  default_variant_title: string | null  // variant_content (default lang)
  product_title: string | null         // product_content (default lang)
  shop_id: string
  nl_variant_count: number

  // Duplicate default SKU info
  nl_duplicate_count: number
  has_nl_duplicates: boolean

  // .de match (default first, then non-default for structure mismatch)
  de_match_count: number
  de_product_ids: number[] | null
  de_default_variant_ids: number[] | null
  de_variant_counts: number[] | null
  de_status: 'not_exists' | 'exists_single' | 'exists_multiple'

  // .be match (default first, then non-default for structure mismatch)
  be_match_count: number
  be_product_ids: number[] | null
  be_default_variant_ids: number[] | null
  be_variant_counts: number[] | null
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

/**
 * Sync Log Entry
 * 
 * Represents a single sync operation from the sync_logs table.
 * Tracks API fetch counts, DB operation counts, timing, and status.
 */
export interface SyncLog {
  id: number
  shop_id: string
  shop_name?: string  // Joined from shops table
  shop_tld?: string   // Joined from shops table (nl | de | be)
  shop_role?: string  // Joined from shops table (source | target)
  
  // Timing
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  
  // Status
  status: 'running' | 'success' | 'error'
  error_message: string | null
  
  // Metrics: API fetch counts
  products_fetched: number
  variants_fetched: number
  
  // Metrics: DB operation counts
  products_synced: number
  variants_synced: number
  products_deleted: number
  variants_deleted: number
  variants_filtered: number  // Orphaned variants filtered out
  
  // Standard timestamps
  created_at: string
  updated_at: string
}
