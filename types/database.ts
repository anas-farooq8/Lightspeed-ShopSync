/**
 * Product Sync Status (Product-Level Sync)
 * 
 * Represents a product from the source shop (via its default variant)
 * and its sync status with all target shops (dynamically loaded from database).
 * 
 * Matching logic: Products matched by variant SKU
 * - First: match by DEFAULT variant SKU
 * - Fallback: match by NON-DEFAULT variant SKU (if not found in default)
 * - Then: not_exists
 * 
 * View only includes products with VALID SKUs (excludes NULL/empty)
 * 
 * Data Source:
 * - View: product_sync_status (direct view query)
 * - RPC: get_sync_operations() (filtered with pagination)
 */
export interface ProductSyncStatus {
  // Source identification
  source_shop_id: string
  source_shop_name: string
  source_shop_tld: string
  source_product_id: number
  source_variant_id: number
  default_sku: string  // 🔑 Matching key (always valid, never NULL)
  
  // Source display data
  product_title: string | null
  variant_title: string | null
  product_image: { title: string | null; thumb: string | null; src: string | null } | null
  price_excl: number | null
  source_variant_count: number
  ls_created_at: string
  ls_updated_at: string
  
  // Source duplicate info
  source_duplicate_count: number
  source_has_duplicates: boolean
  source_duplicate_product_ids: number[]
  
  // All target shops data (dynamically includes all target shops from database)
  targets: {
    [tld: string]: TargetShopStatus
  }
}

/**
 * Product Sync Status with Pagination Metadata
 * 
 * Extended version returned by get_sync_operations() RPC function.
 * Includes pagination metadata that's the same for all rows in the result set.
 */
export interface ProductSyncStatusWithPagination extends ProductSyncStatus {
  // Pagination metadata (same for all rows in result)
  total_count: number
  total_pages: number
}

/**
 * Target shop sync status for a specific product
 * Each target shop will have this structure in the targets object
 * (dynamically loaded from database)
 *
 * Matching logic:
 * - Searches all variants (default + non-default) in one pass
 * - match_type: default_variant > non_default_variant > no_match
 */
export interface TargetShopStatus {
  shop_id: string
  shop_name: string
  shop_tld: string
  status: 'not_exists' | 'exists' | 'unknown'
  match_type: 'default_variant' | 'non_default_variant' | 'no_match'
  total_matches: number
  default_matches: number
  non_default_matches: number
}

/**
 * Per-shop Dashboard KPI
 *
 * Returned by get_dashboard_kpis() RPC.
 * One object per shop with product counts, SKU stats, and missing counts.
 */
export interface DashboardKpi {
  shop_id: string
  shop_name: string
  /** Shop base URL, e.g. "https://www.example.com" */
  base_url: string
  tld: string
  role: 'source' | 'target'
  /** All default variants */
  total_products: number
  /** Default variants with non-empty SKU */
  total_with_valid_sku: number
  /** Count of distinct SKUs (unique products from valid ones) */
  unique_products: number
  /** Number of distinct SKUs that are duplicated */
  duplicate_skus: number
  /** Products without valid SKU (all shops) */
  missing_no_sku: number
  /** Source SKUs not present in this target shop; null for source shops */
  missing_from_source: number | null
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
  shop_tld?: string   // Joined from shops table (dynamically loaded, e.g., nl, de, be, fr, etc.)
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
}

/**
 * Product Details Response
 * 
 * Comprehensive product data returned by get_product_details() RPC.
 * Includes source product, all matching target products, and language configuration.
 */
export interface ProductDetails {
  source: ProductData
  targets: ProductData[]
  shop_languages: Record<string, Language[]>
}

/**
 * Shop Language Configuration
 */
export interface Language {
  code: string
  is_active: boolean
  is_default: boolean
}

/**
 * Product Data (Full Detail)
 * 
 * Complete product information including all languages and variants.
 * Used for product detail page display.
 */
export interface ProductData {
  shop_id: string
  shop_name: string
  shop_tld: string
  shop_role: 'source' | 'target'
  base_url: string
  product_id: number
  default_variant_id: number
  sku: string
  matched_by_default_variant?: boolean  // Only for target products
  visibility: string
  product_image: {
    src?: string
    thumb?: string
    title?: string
  } | null
  ls_created_at: string
  content_by_language: Record<string, ProductContent>
  variants: VariantData[]
  variant_count: number
}

/**
 * Product Content (Language-Specific)
 */
export interface ProductContent {
  url?: string
  title?: string
  fulltitle?: string
  description?: string
  content?: string
}

/**
 * Variant Data (Full Detail)
 * 
 * Complete variant information including multi-language content.
 */
export interface VariantData {
  variant_id: number
  sku: string
  is_default: boolean
  price_excl: number
  image: {
    src?: string
    thumb?: string
    title?: string
  } | null
  content_by_language: Record<string, VariantContent>
}

/**
 * Variant Content (Language-Specific)
 */
export interface VariantContent {
  title?: string
}
