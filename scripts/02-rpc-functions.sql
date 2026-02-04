-- =====================================================
-- DASHBOARD KPI FUNCTION
--
-- Purpose:
--   Returns per-shop product KPIs for dashboard display:
--     - total_products: all default variants
--     - total_with_valid_sku: default variants with non-empty SKU
--     - unique_products: products where SKU appears exactly once (no duplicate)
--     - duplicate_skus: count of distinct SKUs that appear more than once
--     - duplicate_sku_counts: total product rows that have duplicate SKUs
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
        v.sku,
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
        COUNT(*) FILTER (WHERE has_valid_sku) AS total_with_valid_sku
      FROM all_defaults
      GROUP BY shop_id, shop_name, shop_base_url, tld, role
    ),
    sku_agg AS (
      SELECT
        shop_id,
        SUM(cnt) FILTER (WHERE cnt = 1)       AS unique_products,
        COUNT(*) FILTER (WHERE cnt > 1)       AS duplicate_skus,
        COALESCE(SUM(cnt) FILTER (WHERE cnt > 1), 0) AS duplicate_sku_counts
      FROM sku_counts
      GROUP BY shop_id
    ),
    source_skus AS (
      SELECT DISTINCT sku
      FROM valid_defaults
      WHERE role = 'source'
    ),
    target_skus AS (
      SELECT DISTINCT shop_id, sku
      FROM valid_defaults
      WHERE role = 'target'
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
      COALESCE(sa.unique_products, 0)        AS unique_products,
      COALESCE(sa.duplicate_skus, 0)         AS duplicate_skus,
      COALESCE(sa.duplicate_sku_counts, 0)   AS duplicate_sku_counts,
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
--     "unique_products": 3270,
--     "duplicate_skus": 15,
--     "duplicate_sku_counts": 31,
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
--     "unique_products": 3180,
--     "duplicate_skus": 4,
--     "duplicate_sku_counts": 8,
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