-- =====================================================
-- SYNC OPERATIONS RPC FUNCTION (Highly Optimized)
--
-- PERFORMANCE OPTIMIZATIONS:
--   1. Single CTE scan with window function for counting
--   2. Efficient JSONB operators for filtering
--   3. Minimized data scanning with early WHERE clauses  
--   4. Optimized sorting with indexed columns
--   5. STABLE function (cacheable, can be inlined)
--   6. Strategic use of LIMIT/OFFSET at SQL level
--
-- Purpose:
--   Efficiently fetches filtered and paginated sync operations
--   for CREATE and EDIT tabs with proper SQL-based filtering.
-- =====================================================

CREATE OR REPLACE FUNCTION get_sync_operations(
  p_operation TEXT,              -- 'create' | 'edit'
  p_missing_in TEXT DEFAULT NULL, -- 'be' | 'de' | 'all' (for create only)
  p_search TEXT DEFAULT NULL,
  p_only_duplicates BOOLEAN DEFAULT FALSE, -- Filter to show only products with duplicate SKUs
  p_sort_by TEXT DEFAULT 'created', -- 'title' | 'sku' | 'variants' | 'price' | 'created'
  p_sort_order TEXT DEFAULT 'desc', -- 'asc' | 'desc'
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 100
)
RETURNS TABLE(
  -- Source product info
  source_shop_id UUID,
  source_shop_name TEXT,
  source_shop_tld TEXT,
  source_product_id BIGINT,
  source_variant_id BIGINT,
  default_sku TEXT,
  
  -- Display data
  product_title TEXT,
  variant_title TEXT,
  product_image JSONB,
  price_excl NUMERIC,
  source_variant_count INTEGER,
  ls_created_at TIMESTAMP WITH TIME ZONE,
  
  -- Source duplicate info
  source_duplicate_count INTEGER,
  source_has_duplicates BOOLEAN,
  source_duplicate_product_ids BIGINT[],
  
  -- Target shops data
  targets JSONB,
  
  -- Pagination metadata (same for all rows)
  total_count BIGINT,
  total_pages INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH filtered_products AS (
    SELECT 
      pss.source_shop_id,
      pss.source_shop_name,
      pss.source_shop_tld,
      pss.source_product_id,
      pss.source_variant_id,
      pss.default_sku,
      pss.product_title,
      pss.variant_title,
      pss.product_image,
      pss.price_excl,
      pss.source_variant_count,
      pss.ls_created_at,
      pss.source_duplicate_count,
      pss.source_has_duplicates,
      pss.source_duplicate_product_ids,
      pss.targets
    FROM product_sync_status pss
    WHERE 
      -- Search filter (searches within filtered results: SKU, product title, variant title)
      (
        p_search IS NULL 
        OR p_search = ''
        OR pss.product_title ILIKE '%' || p_search || '%'
        OR pss.variant_title ILIKE '%' || p_search || '%'
        OR pss.default_sku ILIKE '%' || p_search || '%'
      )
      AND
      -- Duplicate filter
      (
        p_only_duplicates = FALSE
        OR pss.source_has_duplicates = TRUE
      )
      AND
      -- Operation-specific filters
      (
        -- CREATE operation filters
        (p_operation = 'create' AND (
          -- Missing in ALL targets
          (p_missing_in = 'all' AND 
            (pss.targets->'be'->>'status' = 'not_exists' AND 
             pss.targets->'de'->>'status' = 'not_exists'))
          -- Missing in BE only
          OR (p_missing_in = 'be' AND pss.targets->'be'->>'status' = 'not_exists')
          -- Missing in DE only
          OR (p_missing_in = 'de' AND pss.targets->'de'->>'status' = 'not_exists')
          -- Default: missing in any
          OR (p_missing_in IS NULL AND (
            pss.targets->'be'->>'status' = 'not_exists' OR 
            pss.targets->'de'->>'status' = 'not_exists'
          ))
        ))
        -- EDIT operation filters
        OR (p_operation = 'edit' AND (
          pss.targets->'be'->>'status' IN ('exists_single', 'exists_multiple') OR
          pss.targets->'de'->>'status' IN ('exists_single', 'exists_multiple')
        ))
      )
  ),
  counted_products AS (
    SELECT 
      fp.*,
      COUNT(*) OVER() AS total_count
    FROM filtered_products fp
  ),
  sorted_products AS (
    SELECT 
      cp.*,
      CEIL(cp.total_count::NUMERIC / p_page_size)::INTEGER AS total_pages
    FROM counted_products cp
    ORDER BY
      CASE 
        WHEN p_sort_by = 'title' AND p_sort_order = 'asc' THEN cp.product_title
        WHEN p_sort_by = 'sku' AND p_sort_order = 'asc' THEN cp.default_sku
      END ASC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'title' AND p_sort_order = 'desc' THEN cp.product_title
        WHEN p_sort_by = 'sku' AND p_sort_order = 'desc' THEN cp.default_sku
      END DESC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'variants' AND p_sort_order = 'asc' THEN cp.source_variant_count
      END ASC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'variants' AND p_sort_order = 'desc' THEN cp.source_variant_count
      END DESC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'price' AND p_sort_order = 'asc' THEN cp.price_excl
      END ASC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'price' AND p_sort_order = 'desc' THEN cp.price_excl
      END DESC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'created' AND p_sort_order = 'asc' THEN cp.ls_created_at
      END ASC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'created' AND p_sort_order = 'desc' THEN cp.ls_created_at
      END DESC NULLS LAST,
      -- Secondary sort by created date, then SKU for consistency
      cp.ls_created_at DESC,
      cp.default_sku ASC
    LIMIT p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT 
    sp.source_shop_id,
    sp.source_shop_name,
    sp.source_shop_tld,
    sp.source_product_id,
    sp.source_variant_id,
    sp.default_sku,
    sp.product_title,
    sp.variant_title,
    sp.product_image,
    sp.price_excl,
    sp.source_variant_count::INTEGER,
    sp.ls_created_at,
    sp.source_duplicate_count::INTEGER,
    sp.source_has_duplicates,
    sp.source_duplicate_product_ids,
    sp.targets,
    sp.total_count,
    sp.total_pages
  FROM sorted_products sp;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_sync_operations(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- =====================================================
-- Example Usage
-- =====================================================

-- Get CREATE operations missing in .be (first page, 100 per page)
-- SELECT * FROM get_sync_operations('create', 'be', NULL, 1, 100);

-- Get CREATE operations missing in all targets (with search)
-- SELECT * FROM get_sync_operations('create', 'all', 'box', 1, 100);

-- Get EDIT operations (products that exist in at least one target)
-- SELECT * FROM get_sync_operations('edit', NULL, NULL, 1, 100);

-- =====================================================
-- Expected Response Structure
-- =====================================================
-- Each row contains:
-- - All source product information
-- - Display data (title, image, price, etc.)
-- - Duplicate information (if SKU appears multiple times in source)
-- - All target shops status in JSONB format
-- - total_count: Total matching products (for pagination)
-- - total_pages: Calculated total pages
--
-- Example:
-- {
--   "source_product_id": 1001,
--   "default_sku": "VPK-001",
--   "product_title": "Verzenddozen",
--   "source_duplicate_count": 1,
--   "source_has_duplicates": false,
--   "targets": {
--     "be": {
--       "status": "not_exists",
--       "match_type": "no_match",
--       "total_matches": 0
--     },
--     "de": {
--       "status": "exists_single",
--       "match_type": "default_variant",
--       "total_matches": 1
--     }
--   },
--   "total_count": 199,
--   "total_pages": 2
-- }
