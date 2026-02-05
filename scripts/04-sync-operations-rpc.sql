-- =====================================================
-- Drop existing function first (signature changed)
-- =====================================================
DROP FUNCTION IF EXISTS get_sync_operations(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER);

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
  p_missing_in TEXT DEFAULT NULL, -- shop TLD | 'all' (for create only)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- ========================================
  -- INPUT VALIDATION
  -- ========================================
  
  -- Validate operation
  IF p_operation IS NULL OR p_operation NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'Invalid operation. Must be ''create'' or ''edit'', got: %', COALESCE(p_operation, 'NULL');
  END IF;
  
  -- Validate sort_by
  IF p_sort_by IS NULL OR p_sort_by NOT IN ('title', 'sku', 'variants', 'price', 'created') THEN
    RAISE EXCEPTION 'Invalid sort_by. Must be one of: title, sku, variants, price, created. Got: %', COALESCE(p_sort_by, 'NULL');
  END IF;
  
  -- Validate sort_order
  IF p_sort_order IS NULL OR p_sort_order NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort_order. Must be ''asc'' or ''desc'', got: %', COALESCE(p_sort_order, 'NULL');
  END IF;
  
  -- Validate page number
  IF p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'Invalid page number. Must be >= 1, got: %', COALESCE(p_page::TEXT, 'NULL');
  END IF;
  
  -- Validate page size
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'Invalid page_size. Must be between 1 and 1000, got: %', COALESCE(p_page_size::TEXT, 'NULL');
  END IF;
  
  -- Trim and normalize search text
  p_search := NULLIF(TRIM(p_search), '');
  
  -- Normalize missing_in to lowercase
  p_missing_in := LOWER(TRIM(COALESCE(p_missing_in, 'all')));
  
  -- ========================================
  -- QUERY EXECUTION
  -- ========================================
  
  RETURN QUERY
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
      -- Operation-specific filters (DYNAMIC - works with any number of target shops)
      (
        -- CREATE operation filters
        (p_operation = 'create' AND (
          -- Missing in ALL targets (all keys in targets JSONB have status = 'not_exists')
          (p_missing_in = 'all' AND 
            NOT EXISTS (
              SELECT 1 FROM jsonb_each(pss.targets) AS t(key, value)
              WHERE t.value->>'status' != 'not_exists'
            ))
          -- Missing in specific shop only
          OR (p_missing_in IS NOT NULL AND p_missing_in != 'all' AND 
              pss.targets->p_missing_in->>'status' = 'not_exists')
          -- Default: missing in at least one target
          OR (p_missing_in IS NULL AND 
            EXISTS (
              SELECT 1 FROM jsonb_each(pss.targets) AS t(key, value)
              WHERE t.value->>'status' = 'not_exists'
            ))
        ))
        -- EDIT operation filters (exists in at least one target)
        OR (p_operation = 'edit' AND 
          EXISTS (
            SELECT 1 FROM jsonb_each(pss.targets) AS t(key, value)
            WHERE t.value->>'status' IN ('exists_single', 'exists_multiple')
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
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_sync_operations(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- =====================================================
-- Example Usage
-- =====================================================

-- Get CREATE operations missing in a specific shop (e.g., 'be') (first page, 100 per page)
-- SELECT * FROM get_sync_operations('create', 'be', NULL, FALSE, 'created', 'desc', 1, 100);

-- Get CREATE operations missing in all targets (with search)
-- SELECT * FROM get_sync_operations('create', 'all', 'box', FALSE, 'created', 'desc', 1, 100);

-- Get EDIT operations (products that exist in at least one target)
-- SELECT * FROM get_sync_operations('edit', NULL, NULL, FALSE, 'created', 'desc', 1, 100);

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
--       "shop_id": "...",
--       "shop_name": "VerpakkingenXL-BE",
--       "shop_tld": "be",
--       "status": "not_exists",
--       "match_type": "no_match",
--       "default_matches": 0,
--       "non_default_matches": 0,
--       "total_matches": 0
--     },
--     "de": {
--       "shop_id": "...",
--       "shop_name": "VerpackungenXL",
--       "shop_tld": "de",
--       "status": "exists_single",
--       "match_type": "default_variant",
--       "default_matches": 1,
--       "non_default_matches": 0,
--       "total_matches": 1
--     }
--   },
--   "total_count": 199,
--   "total_pages": 2
-- }

-- =====================================================
-- GET NULL SKU PRODUCTS (For NULL SKU Tab)
-- =====================================================
-- Purpose: Fetch products where default variant has NULL or empty SKU
-- Returns data in same format as product_sync_status for UI reuse
-- =====================================================

-- Drop existing function first (signature changed)
DROP FUNCTION IF EXISTS get_null_sku_products(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_null_sku_products(
  p_shop_tld TEXT DEFAULT NULL,    -- Filter by shop TLD (nl, be, de) or NULL for all
  p_search TEXT DEFAULT NULL,       -- Search in product title or variant title
  p_sort_by TEXT DEFAULT 'created', -- 'title' | 'variants' | 'price' | 'created'
  p_sort_order TEXT DEFAULT 'desc', -- 'asc' | 'desc'
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 100
)
RETURNS TABLE(
  -- Source product info (matching product_sync_status format)
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
  
  -- Source duplicate info (always 1 for null SKU products)
  source_duplicate_count INTEGER,
  source_has_duplicates BOOLEAN,
  source_duplicate_product_ids BIGINT[],
  
  -- Target shops data (empty for null SKU)
  targets JSONB,
  
  -- Pagination metadata
  total_count BIGINT,
  total_pages INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- ========================================
  -- INPUT VALIDATION
  -- ========================================
  
  -- Validate sort_by (note: no 'sku' option for null SKU products)
  IF p_sort_by IS NULL OR p_sort_by NOT IN ('title', 'variants', 'price', 'created') THEN
    RAISE EXCEPTION 'Invalid sort_by. Must be one of: title, variants, price, created. Got: %', COALESCE(p_sort_by, 'NULL');
  END IF;
  
  -- Validate sort_order
  IF p_sort_order IS NULL OR p_sort_order NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort_order. Must be ''asc'' or ''desc'', got: %', COALESCE(p_sort_order, 'NULL');
  END IF;
  
  -- Validate page number
  IF p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'Invalid page number. Must be >= 1, got: %', COALESCE(p_page::TEXT, 'NULL');
  END IF;
  
  -- Validate page size
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'Invalid page_size. Must be between 1 and 1000, got: %', COALESCE(p_page_size::TEXT, 'NULL');
  END IF;
  
  -- Trim and normalize inputs
  p_search := NULLIF(TRIM(p_search), '');
  p_shop_tld := NULLIF(LOWER(TRIM(COALESCE(p_shop_tld, ''))), '');
  
  -- ========================================
  -- QUERY EXECUTION
  -- ========================================
  
  RETURN QUERY
  WITH filtered_products AS (
    SELECT 
      s.id AS shop_id,
      s.name AS shop_name,
      s.tld AS shop_tld,
      v.lightspeed_product_id AS product_id,
      v.lightspeed_variant_id AS variant_id,
      pc.title AS product_title,
      vc.title AS variant_title,
      p.image AS product_image,
      v.price_excl,
      p.ls_created_at
    FROM shops s
    INNER JOIN variants v ON v.shop_id = s.id
      AND v.is_default = true
      AND (v.sku IS NULL OR TRIM(v.sku) = '')
    INNER JOIN products p ON p.shop_id = s.id 
      AND p.lightspeed_product_id = v.lightspeed_product_id
    LEFT JOIN product_content pc ON pc.shop_id = s.id 
      AND pc.lightspeed_product_id = v.lightspeed_product_id
      AND pc.language_code = s.tld
    LEFT JOIN variant_content vc ON vc.shop_id = s.id 
      AND vc.lightspeed_variant_id = v.lightspeed_variant_id
      AND vc.language_code = s.tld
    WHERE 
      (p_shop_tld IS NULL OR s.tld = p_shop_tld)
      AND
      (
        p_search IS NULL 
        OR p_search = ''
        OR pc.title ILIKE '%' || p_search || '%'
        OR vc.title ILIKE '%' || p_search || '%'
      )
  ),
  variant_counts AS (
    SELECT
      v.shop_id,
      v.lightspeed_product_id,
      COUNT(*) AS variant_count
    FROM variants v
    WHERE v.shop_id IN (SELECT shop_id FROM filtered_products)
      AND v.lightspeed_product_id IN (SELECT product_id FROM filtered_products)
    GROUP BY v.shop_id, v.lightspeed_product_id
  ),
  counted_products AS (
    SELECT 
      fp.*,
      COALESCE(vc.variant_count, 1)::INTEGER AS variant_count,
      COUNT(*) OVER() AS total_count
    FROM filtered_products fp
    LEFT JOIN variant_counts vc ON vc.shop_id = fp.shop_id 
      AND vc.lightspeed_product_id = fp.product_id
  ),
  sorted_products AS (
    SELECT 
      cp.*,
      CEIL(cp.total_count::NUMERIC / p_page_size)::INTEGER AS total_pages
    FROM counted_products cp
    ORDER BY
      CASE 
        WHEN p_sort_by = 'title' AND p_sort_order = 'asc' THEN cp.product_title
      END ASC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'title' AND p_sort_order = 'desc' THEN cp.product_title
      END DESC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'variants' AND p_sort_order = 'asc' THEN cp.variant_count
      END ASC NULLS LAST,
      CASE 
        WHEN p_sort_by = 'variants' AND p_sort_order = 'desc' THEN cp.variant_count
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
      cp.ls_created_at DESC,
      cp.product_title ASC
    LIMIT p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT 
    sp.shop_id AS source_shop_id,
    sp.shop_name AS source_shop_name,
    sp.shop_tld AS source_shop_tld,
    sp.product_id AS source_product_id,
    sp.variant_id AS source_variant_id,
    'NULL' AS default_sku,
    sp.product_title,
    sp.variant_title,
    sp.product_image,
    sp.price_excl,
    sp.variant_count AS source_variant_count,
    sp.ls_created_at,
    1 AS source_duplicate_count,
    false AS source_has_duplicates,
    ARRAY[sp.product_id] AS source_duplicate_product_ids,
    '{}'::JSONB AS targets,
    sp.total_count,
    sp.total_pages
  FROM sorted_products sp;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_null_sku_products(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;