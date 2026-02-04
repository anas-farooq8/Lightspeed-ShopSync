-- =====================================================
-- DASHBOARD KPI FUNCTION
--
-- Purpose:
--   Returns per-shop product KPIs for dashboard display:
--     - total_products: all default variants
--     - total_with_valid_sku: default variants with non-empty SKU
--     - unique_products: count of distinct SKUs (unique products from valid ones)
--     - duplicate_skus: number of distinct SKUs that are duplicated (not their total count)
--     - missing_no_sku: products without valid SKU (all shops)
--     - missing_from_source: source SKUs not present in target shops
--
-- Characteristics:
--   - Fully dynamic (no hardcoded shops or TLDs)
--   - Supports any number of target shops
--   - Optimized: single scan of variants, minimal subqueries
-- =====================================================

CREATE OR REPLACE FUNCTION get_dashboard_kpis()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.role, t.tld), '[]'::json)
  FROM (
    WITH all_defaults AS (
      SELECT
        s.id     AS shop_id,
        s.name   AS shop_name,
        s.base_url AS shop_base_url,
        s.tld,
        s.role,
        TRIM(v.sku) AS sku,
        (v.sku IS NOT NULL AND TRIM(v.sku) <> '') AS has_valid_sku
      FROM variants v
      JOIN shops s ON s.id = v.shop_id
      WHERE v.is_default
    ),
    valid_defaults AS (
      SELECT shop_id, shop_name, shop_base_url, tld, role, sku
      FROM all_defaults
      WHERE has_valid_sku
    ),
    sku_counts AS (
      SELECT
        shop_id,
        sku,
        COUNT(*) AS cnt
      FROM valid_defaults
      GROUP BY shop_id, sku
    ),
    shop_stats AS (
      SELECT
        shop_id,
        shop_name,
        shop_base_url,
        tld,
        role,
        COUNT(*) AS total_products,
        COUNT(*) FILTER (WHERE has_valid_sku) AS total_with_valid_sku,
        COUNT(DISTINCT sku) FILTER (WHERE has_valid_sku) AS unique_products
      FROM all_defaults
      GROUP BY shop_id, shop_name, shop_base_url, tld, role
    ),
    sku_agg AS (
      SELECT
        shop_id,
        COUNT(*) FILTER (WHERE cnt > 1) AS duplicate_skus
      FROM sku_counts
      GROUP BY shop_id
    ),
    source_skus AS (
      SELECT DISTINCT sku
      FROM valid_defaults
      WHERE role = 'source'
    ),
    target_skus AS (
      -- Check against ALL variants in target (default + non-default)
      -- to match sync_operations view behavior
      SELECT DISTINCT v.shop_id, TRIM(v.sku) AS sku
      FROM variants v
      JOIN shops s ON s.id = v.shop_id
      WHERE s.role = 'target'
        AND v.sku IS NOT NULL
        AND TRIM(v.sku) <> ''
    ),
    missing_per_target AS (
      SELECT t.shop_id, COUNT(*) AS missing
      FROM (SELECT DISTINCT shop_id FROM valid_defaults WHERE role = 'target') t
      CROSS JOIN source_skus s
      LEFT JOIN target_skus ts ON ts.shop_id = t.shop_id AND ts.sku = s.sku
      WHERE ts.sku IS NULL
      GROUP BY t.shop_id
    )
    SELECT
      ss.shop_name,
      ss.shop_base_url AS base_url,
      ss.tld,
      ss.role,
      ss.total_products,
      ss.total_with_valid_sku,
      COALESCE(ss.unique_products, 0)       AS unique_products,
      COALESCE(sa.duplicate_skus, 0)         AS duplicate_skus,
      -- Products without valid SKU (all shops)
      (ss.total_products - ss.total_with_valid_sku)   AS missing_no_sku,
      -- Source SKUs that are missing in each target shop (targets only)
      CASE
        WHEN ss.role = 'target' THEN COALESCE(m.missing, 0)
        ELSE NULL
      END AS missing_from_source
    FROM shop_stats ss
    LEFT JOIN sku_agg sa ON sa.shop_id = ss.shop_id
    LEFT JOIN missing_per_target m ON m.shop_id = ss.shop_id
    ORDER BY ss.role, ss.tld
  ) t;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_dashboard_kpis() TO authenticated;

-- Example Response:
-- [
--   {
--     "shop_name": "VerpakkingenXL",
--     "base_url": "https://www.example.nl",
--     "tld": "nl",
--     "role": "source",
--     "total_products": 3289,
--     "total_with_valid_sku": 3285,
--     "unique_products": 3280,
--     "duplicate_skus": 15,
--     "missing_no_sku": 4,
--     "missing_from_source": null
--   },
--   {
--     "shop_name": "VerpakkingenXL - BE",
--     "base_url": "https://www.example.be",
--     "tld": "be",
--     "role": "target",
--     "total_products": 3188,
--     "total_with_valid_sku": 3184,
--     "unique_products": 3184,
--     "duplicate_skus": 4,
--     "missing_no_sku": 4,
--     "missing_from_source": 199
--   }
-- ]

-- =====================================================
-- SYNC LOG DATES PAGINATION FUNCTION
--
-- Purpose:
--   Returns paginated list of distinct sync dates with total count
--   for efficient date-based pagination in the sync logs UI.
--
-- Characteristics:
--   - Uses GROUP BY for efficiency (better than DISTINCT)
--   - Window function (COUNT(*) OVER()) eliminates separate count query
--   - Leverages expression index on DATE(started_at)
--   - Type-safe enum handling with ::text cast
--   - Supports NULL filters for "all" queries
--
-- =====================================================

CREATE OR REPLACE FUNCTION get_sync_log_dates_paginated(
  p_shop_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  log_date DATE,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(started_at) as log_date,
    COUNT(*) OVER() as total_count
  FROM sync_logs
  WHERE (p_shop_id IS NULL OR shop_id = p_shop_id)
    AND (p_status IS NULL OR status::text = p_status)
  GROUP BY DATE(started_at)
  ORDER BY log_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_sync_log_dates_paginated(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- =====================================================
-- Example Usage & Responses
-- =====================================================

-- Example 1: Get first page (all shops, all statuses)
-- SELECT * FROM get_sync_log_dates_paginated(NULL, NULL, 20, 0);
--
-- Response:
-- [
--   { "log_date": "2025-02-04", "total_count": 45 },
--   { "log_date": "2025-02-03", "total_count": 45 },
--   { "log_date": "2025-02-02", "total_count": 45 },
--   { "log_date": "2025-02-01", "total_count": 45 },
--   ...
--   { "log_date": "2025-01-16", "total_count": 45 }
-- ]
-- (20 dates returned, total_count shows 45 distinct dates exist)

-- Example 2: Get second page for specific shop
-- SELECT * FROM get_sync_log_dates_paginated(
--   '123e4567-e89b-12d3-a456-426614174000'::uuid,
--   NULL,
--   20,
--   20
-- );
--
-- Response:
-- [
--   { "log_date": "2025-01-15", "total_count": 38 },
--   { "log_date": "2025-01-14", "total_count": 38 },
--   ...
-- ]

-- Example 3: Filter by status (only failed syncs)
-- SELECT * FROM get_sync_log_dates_paginated(NULL, 'failed', 20, 0);
--
-- Response:
-- [
--   { "log_date": "2025-02-03", "total_count": 5 },
--   { "log_date": "2025-01-28", "total_count": 5 },
--   { "log_date": "2025-01-15", "total_count": 5 },
--   { "log_date": "2025-01-10", "total_count": 5 },
--   { "log_date": "2025-01-05", "total_count": 5 }
-- ]
-- (Only 5 dates with failed syncs exist)

-- Example 4: No results (shop has no sync logs)
-- SELECT * FROM get_sync_log_dates_paginated(
--   '999e9999-e99b-99d9-a999-999999999999'::uuid,
--   NULL,
--   20,
--   0
-- );
--
-- Response:
-- []
-- (Empty array)

-- =====================================================
-- Notes:
--   - total_count is the same for all rows in a result set
--   - This is intentional - it represents the total distinct dates
--     that match the filters, used for calculating total pages
--   - The API layer uses: totalPages = Math.ceil(total_count / limit)
-- =====================================================

-- =====================================================
-- GET LAST SYNC INFO FUNCTION
--
-- Purpose:
--   Returns the most recent sync operation for each shop
--   with detailed metrics for dashboard display.
--
-- Characteristics:
--   - One row per shop
--   - Shows last completed sync (not currently running ones)
--   - Includes all metrics (products fetched/synced/deleted, duration, etc.)
--   - Sorted by shop role and TLD
-- =====================================================

CREATE OR REPLACE FUNCTION get_last_sync_info()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.role, t.tld), '[]'::json)
  FROM (
    WITH ranked_syncs AS (
      SELECT
        sl.*,
        s.name AS shop_name,
        s.tld,
        s.role,
        s.base_url,
        ROW_NUMBER() OVER (
          PARTITION BY sl.shop_id 
          ORDER BY sl.started_at DESC
        ) AS rn
      FROM sync_logs sl
      JOIN shops s ON s.id = sl.shop_id
      WHERE sl.status IN ('success', 'error')  -- Only completed syncs
        AND sl.completed_at IS NOT NULL
    )
    SELECT
      shop_id,
      shop_name,
      tld,
      role,
      base_url,
      started_at,
      completed_at,
      duration_seconds,
      status::text,
      error_message,
      products_fetched,
      variants_fetched,
      products_synced,
      variants_synced,
      products_deleted,
      variants_deleted,
      variants_filtered
    FROM ranked_syncs
    WHERE rn = 1
    ORDER BY role, tld
  ) t;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_last_sync_info() TO authenticated;

-- Example Response:
-- [
--   {
--     "shop_id": "123e4567-e89b-12d3-a456-426614174000",
--     "shop_name": "VerpakkingenXL",
--     "tld": "nl",
--     "role": "source",
--     "base_url": "https://www.verpakkingenxl.nl",
--     "started_at": "2026-02-04T10:30:00Z",
--     "completed_at": "2026-02-04T10:32:15Z",
--     "duration_seconds": 135.23,
--     "status": "success",
--     "error_message": null,
--     "products_fetched": 3289,
--     "variants_fetched": 4521,
--     "products_synced": 3289,
--     "variants_synced": 4521,
--     "products_deleted": 5,
--     "variants_deleted": 12,
--     "variants_filtered": 3
--   },
--   {
--     "shop_id": "234e5678-e89b-12d3-a456-426614174001",
--     "shop_name": "VerpakkingenXL - BE",
--     "tld": "be",
--     "role": "target",
--     "base_url": "https://www.verpakkingenxl.be",
--     "started_at": "2026-02-04T10:35:00Z",
--     "completed_at": "2026-02-04T10:36:45Z",
--     "duration_seconds": 105.67,
--     "status": "success",
--     "error_message": null,
--     "products_fetched": 3188,
--     "variants_fetched": 4201,
--     "products_synced": 3188,
--     "variants_synced": 4201,
--     "products_deleted": 2,
--     "variants_deleted": 8,
--     "variants_filtered": 1
--   }
-- ]


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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_null_sku_products(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;