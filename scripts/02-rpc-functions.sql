-- =====================================================
-- RPC FUNCTIONS (Run after 01: 02-rpc-functions.sql)
-- =====================================================
--
-- Defines: get_dashboard_kpis, get_sync_log_dates_paginated, get_last_sync_info, get_product_operation_logs
-- Uses: shops, variants (KPI); sync_logs (dates, last sync); product_operation_logs (create/edit history)
-- =====================================================

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
        (TRIM(v.sku) <> '') AS has_valid_sku
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
      ss.shop_id,
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
--   [
--     {
--       "shop_id":    "123e4567-e89b-12d3-a456-426614174000",
--       "shop_name":  "VerpakkingenXL",
--       "base_url":   "https://www.example.nl",
--       "tld":        "nl",
--       "role":       "source",
--       "total_products":        3289,
--       "total_with_valid_sku": 3285,
--       "unique_products":      3280,
--       "duplicate_skus":       15,
--       "missing_no_sku":       4,
--       "missing_from_source":  null
--     },
--     {
--       "shop_id":    "234e5678-e89b-12d3-a456-426614174001",
--       "shop_name":  "VerpakkingenXL - BE",
--       "base_url":   "https://www.example.be",
--       "tld":        "be",
--       "role":       "target",
--       "total_products":        3188,
--       "total_with_valid_sku": 3184,
--       "unique_products":      3184,
--       "duplicate_skus":       4,
--       "missing_no_sku":       4,
--       "missing_from_source":  199
--     }
--   ]

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
--   - Leverages expression index on (started_at AT TIME ZONE 'UTC')::date
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
  -- ========================================
  -- INPUT VALIDATION
  -- ========================================
  
  -- Validate limit
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid limit. Must be between 1 and 1000, got: %', COALESCE(p_limit::TEXT, 'NULL');
  END IF;
  
  -- Validate offset
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Invalid offset. Must be >= 0, got: %', COALESCE(p_offset::TEXT, 'NULL');
  END IF;
  
  -- Validate status if provided (only completed statuses: success, error, running)
  IF p_status IS NOT NULL AND p_status NOT IN ('success', 'error', 'running') THEN
    RAISE EXCEPTION 'Invalid status. Must be ''success'' or ''error'' or ''running'', got: %', p_status;
  END IF;
  
  -- Validate shop_id exists when provided
  IF p_shop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id) THEN
    RAISE EXCEPTION 'Shop not found with id: %', p_shop_id;
  END IF;
  
  -- ========================================
  -- QUERY EXECUTION
  -- ========================================
  
  RETURN QUERY
  SELECT 
    (started_at AT TIME ZONE 'UTC')::date as log_date,
    COUNT(*) OVER() as total_count
  FROM sync_logs
  WHERE (p_shop_id IS NULL OR shop_id = p_shop_id)
    AND (p_status IS NULL OR status::text = p_status)
  GROUP BY (started_at AT TIME ZONE 'UTC')::date
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
--
-- Example 1: Get first page (all shops, all statuses)
--   SELECT * FROM get_sync_log_dates_paginated(NULL, NULL, 20, 0);
--
--   Response:
--     [
--       { "log_date": "2025-02-04", "total_count": 45 },
--       { "log_date": "2025-02-03", "total_count": 45 },
--       { "log_date": "2025-02-02", "total_count": 45 },
--       { "log_date": "2025-02-01", "total_count": 45 },
--       ...
--       { "log_date": "2025-01-16", "total_count": 45 }
--     ]
--   (20 dates returned, total_count shows 45 distinct dates exist)
--
-- Example 2: Get second page for specific shop
--   SELECT * FROM get_sync_log_dates_paginated(
--     '123e4567-e89b-12d3-a456-426614174000'::uuid,
--     NULL,
--     20,
--     20
--   );
--
--   Response:
--     [
--       { "log_date": "2025-01-15", "total_count": 38 },
--       { "log_date": "2025-01-14", "total_count": 38 },
--       ...
--     ]
--
-- Example 3: Filter by status (only failed syncs)
--   SELECT * FROM get_sync_log_dates_paginated(NULL, 'error', 20, 0);
--
--   Response:
--     [
--       { "log_date": "2025-02-03", "total_count": 5 },
--       { "log_date": "2025-01-28", "total_count": 5 },
--       { "log_date": "2025-01-15", "total_count": 5 },
--       { "log_date": "2025-01-10", "total_count": 5 },
--       { "log_date": "2025-01-05", "total_count": 5 }
--     ]
--   (Only 5 dates with failed syncs exist)
--
-- Example 4: No results (shop has no sync logs)
--   SELECT * FROM get_sync_log_dates_paginated(
--     '999e9999-e99b-99d9-a999-999999999999'::uuid,
--     NULL,
--     20,
--     0
--   );
--
--   Response:
--     []
--   (Empty array)
--
-- =====================================================
-- Notes
-- =====================================================
--   - total_count is the same for all rows in a result set
--   - This is intentional - it represents the total distinct dates
--     that match the filters, used for calculating total pages
--   - The API layer uses: totalPages = Math.ceil(total_count / limit)

-- =====================================================
-- GET LAST SYNC INFO FUNCTION
--
-- Purpose:
--   Returns the most recent sync operation for each shop
--   with detailed metrics for dashboard display.
--
-- Characteristics:
--   - One row per shop
--   - Shows last completed sync (excludes running/in-progress)
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
        sl.shop_id,
        sl.started_at,
        sl.completed_at,
        sl.duration_seconds,
        sl.status,
        sl.error_message,
        sl.products_fetched,
        sl.variants_fetched,
        sl.products_synced,
        sl.variants_synced,
        sl.products_deleted,
        sl.variants_deleted,
        sl.variants_filtered,
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
--   [
--     {
--       "shop_id":            "123e4567-e89b-12d3-a456-426614174000",
--       "shop_name":          "VerpakkingenXL",
--       "tld":                "nl",
--       "role":               "source",
--       "base_url":           "https://www.verpakkingenxl.nl",
--       "started_at":         "2026-02-04T10:30:00Z",
--       "completed_at":       "2026-02-04T10:32:15Z",
--       "duration_seconds":   135.23,
--       "status":             "success",
--       "error_message":      null,
--       "products_fetched":   3289,
--       "variants_fetched":   4521,
--       "products_synced":    3289,
--       "variants_synced":    4521,
--       "products_deleted":   5,
--       "variants_deleted":   12,
--       "variants_filtered":  3
--     },
--     {
--       "shop_id":            "234e5678-e89b-12d3-a456-426614174001",
--       "shop_name":          "VerpakkingenXL - BE",
--       "tld":                "be",
--       "role":               "target",
--       "base_url":           "https://www.verpakkingenxl.be",
--       "started_at":         "2026-02-04T10:35:00Z",
--       "completed_at":       "2026-02-04T10:36:45Z",
--       "duration_seconds":   105.67,
--       "status":             "success",
--       "error_message":      null,
--       "products_fetched":   3188,
--       "variants_fetched":   4201,
--       "products_synced":    3188,
--       "variants_synced":    4201,
--       "products_deleted":   2,
--       "variants_deleted":   8,
--       "variants_filtered":  1
--     }
--   ]

-- =====================================================
-- PRODUCT OPERATION LOGS (Create & Edit history)
--
-- Purpose:
--   Returns paginated product operation logs with enriched data:
--   - Target/source shop info (name, base_url)
--   - Target/source product info (title, default_sku, image) when product exists in DB
--
-- Characteristics:
--   - Fully dynamic (no hardcoded shops)
--   - Optional filters: p_shop_id, p_operation_type, p_status
--   - Input validation for limit/offset (matches get_sync_log_dates_paginated)
--   - Optimized: LATERAL joins for product title/sku (avoids N+1 correlated subqueries)
--   - Uses idx_product_operation_logs_* indexes
--
-- =====================================================

DROP FUNCTION IF EXISTS get_product_operation_logs(INTEGER, INTEGER, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_product_operation_logs(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_shop_id UUID DEFAULT NULL,
  p_operation_type TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INTEGER;
  v_offset INTEGER;
BEGIN
  -- ========================================
  -- INPUT VALIDATION
  -- ========================================

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  IF p_shop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shops WHERE id = p_shop_id) THEN
    RAISE EXCEPTION 'Shop not found with id: %', p_shop_id;
  END IF;

  IF p_operation_type IS NOT NULL AND p_operation_type NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'Invalid operation_type. Must be ''create'' or ''edit'', got: %', p_operation_type;
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('success', 'error') THEN
    RAISE EXCEPTION 'Invalid status. Must be ''success'' or ''error'', got: %', p_status;
  END IF;

  -- ========================================
  -- QUERY EXECUTION
  -- ========================================

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
    FROM (
      SELECT
        pol.id,
        pol.shop_id,
        pol.lightspeed_product_id,
        pol.operation_type::text,
        pol.status::text,
        pol.error_message,
        pol.details,
        pol.source_shop_id,
        pol.source_lightspeed_product_id,
        pol.created_at,
        json_build_object('id', ts.id, 'name', ts.name, 'base_url', ts.base_url, 'tld', ts.tld) AS target_shop,
        CASE WHEN pol.source_shop_id IS NOT NULL THEN
          json_build_object('id', ss.id, 'name', ss.name, 'base_url', ss.base_url, 'tld', ss.tld)
        ELSE NULL END AS source_shop,
        CASE WHEN tp.shop_id IS NOT NULL THEN
          json_build_object(
            'title', COALESCE(pc_t.title, 'Product #' || tp.lightspeed_product_id),
            'default_sku', v_t.sku,
            'image', tp.image
          )
        ELSE NULL END AS target_product,
        CASE WHEN pol.source_shop_id IS NOT NULL AND sp.shop_id IS NOT NULL THEN
          json_build_object(
            'title', COALESCE(pc_s.title, 'Product #' || sp.lightspeed_product_id),
            'default_sku', v_s.sku
          )
        ELSE NULL END AS source_product
      FROM product_operation_logs pol
      JOIN shops ts ON ts.id = pol.shop_id
      LEFT JOIN shops ss ON ss.id = pol.source_shop_id
      LEFT JOIN products tp ON tp.shop_id = pol.shop_id AND tp.lightspeed_product_id = pol.lightspeed_product_id
      LEFT JOIN products sp ON sp.shop_id = pol.source_shop_id AND sp.lightspeed_product_id = pol.source_lightspeed_product_id
      LEFT JOIN LATERAL (
        SELECT pc.title
        FROM product_content pc
        WHERE pc.shop_id = pol.shop_id AND pc.lightspeed_product_id = pol.lightspeed_product_id
          AND pc.title IS NOT NULL AND pc.title <> ''
        ORDER BY pc.language_code
        LIMIT 1
      ) pc_t ON tp.shop_id IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT v.sku
        FROM variants v
        WHERE v.shop_id = pol.shop_id AND v.lightspeed_product_id = pol.lightspeed_product_id
        ORDER BY v.is_default DESC NULLS LAST, v.sort_order NULLS LAST
        LIMIT 1
      ) v_t ON tp.shop_id IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT pc.title
        FROM product_content pc
        WHERE pc.shop_id = pol.source_shop_id AND pc.lightspeed_product_id = pol.source_lightspeed_product_id
          AND pc.title IS NOT NULL AND pc.title <> ''
        ORDER BY pc.language_code
        LIMIT 1
      ) pc_s ON sp.shop_id IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT v.sku
        FROM variants v
        WHERE v.shop_id = pol.source_shop_id AND v.lightspeed_product_id = pol.source_lightspeed_product_id
        ORDER BY v.is_default DESC NULLS LAST, v.sort_order NULLS LAST
        LIMIT 1
      ) v_s ON sp.shop_id IS NOT NULL
      WHERE (p_shop_id IS NULL OR pol.shop_id = p_shop_id)
        AND (p_operation_type IS NULL OR pol.operation_type::text = p_operation_type)
        AND (p_status IS NULL OR pol.status::text = p_status)
      ORDER BY pol.created_at DESC
      LIMIT v_limit
      OFFSET v_offset
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_operation_logs(INTEGER, INTEGER, UUID, TEXT, TEXT) TO authenticated;

-- Example Response:
--   [
--     {
--       "id": 1,
--       "shop_id": "uuid",
--       "lightspeed_product_id": 12345,
--       "operation_type": "create",
--       "status": "success",
--       "error_message": null,
--       "details": { "changes": ["3 variants", "2 images"] },
--       "source_shop_id": "uuid",
--       "source_lightspeed_product_id": 11111,
--       "created_at": "2026-02-22T14:30:00Z",
--       "target_shop": { "id": "uuid", "name": "Shop BE", "base_url": "https://..." },
--       "source_shop": { "id": "uuid", "name": "Shop NL", "base_url": "https://..." },
--       "target_product": { "title": "Product Name", "default_sku": "SKU-001", "image": {...} },
--       "source_product": { "title": "Product Name", "default_sku": "SKU-001" }
--     }
--   ]
