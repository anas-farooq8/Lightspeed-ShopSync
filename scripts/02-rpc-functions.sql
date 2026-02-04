-- =====================================================
-- DASHBOARD KPI FUNCTION
--
-- Purpose:
--   Returns per-shop product KPIs for dashboard display:
--     - total products (default variants)
--     - unique SKUs
--     - duplicate SKUs
--     - missing SKUs per target (relative to source)
--
-- Characteristics:
--   - Fully dynamic (no hardcoded shops or TLDs)
--   - Supports any number of target shops
--   - Optimized using a single normalized base dataset
--   - SKU-based missing detection (correct logic)
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
    WITH base AS (
      SELECT
        s.id     AS shop_id,
        s.name   AS shop_name,
        s.base_url AS shop_base_url,
        s.tld,
        s.role,
        v.sku,
        v.is_default
      FROM variants v
      JOIN shops s ON s.id = v.shop_id
      WHERE v.sku IS NOT NULL
        AND v.sku <> ''
    ),
    shop_stats AS (
      SELECT
        shop_id,
        shop_name,
        shop_base_url,
        tld,
        role,
        COUNT(*) FILTER (WHERE is_default)             AS total_products,
        COUNT(DISTINCT sku) FILTER (WHERE is_default)  AS unique_skus
      FROM base
      GROUP BY shop_id, shop_name, shop_base_url, tld, role
    ),
    duplicates AS (
      SELECT
        shop_id,
        COUNT(*) AS duplicate_skus
      FROM (
        SELECT shop_id, sku
        FROM base
        WHERE is_default
        GROUP BY shop_id, sku
        HAVING COUNT(*) > 1
      ) d
      GROUP BY shop_id
    ),
    source_skus AS (
      SELECT DISTINCT sku
      FROM base
      WHERE role = 'source'
        AND is_default
    ),
    target_skus AS (
      SELECT DISTINCT
        shop_id,
        sku
      FROM base
      WHERE role = 'target'
        AND is_default
    ),
    missing_per_target AS (
      SELECT
        t.shop_id,
        COUNT(*) AS missing
      FROM (
        SELECT DISTINCT shop_id
        FROM base
        WHERE role = 'target'
      ) t
      CROSS JOIN source_skus s
      LEFT JOIN target_skus ts
        ON ts.shop_id = t.shop_id
       AND ts.sku = s.sku
      WHERE ts.sku IS NULL
      GROUP BY t.shop_id
    )
    SELECT
      ss.shop_name,
      ss.shop_base_url AS base_url,
      ss.tld,
      ss.role,
      ss.total_products,
      ss.unique_skus,
      COALESCE(d.duplicate_skus, 0) AS duplicate_skus,
      CASE
        WHEN ss.role = 'target'
        THEN COALESCE(m.missing, 0)
      END AS missing
    FROM shop_stats ss
    LEFT JOIN duplicates d ON d.shop_id = ss.shop_id
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
--     "tld": "nl",
--     "role": "source",
--     "total_products": 3289,
--     "unique_skus": 3274,
--     "duplicate_skus": 15,
--     "missing": null
--  },
--   {
--     "shop_name": "VerpakkingenXL - BE",
--     "tld": "be",
--     "role": "target",
--     "total_products": 3188,
--     "unique_skus": 3184,
--     "duplicate_skus": 4,
--     "missing": 199
--   },
--   {
--     "shop_name": "VerpackungenXL",
--     "tld": "de",
--     "role": "target",
--     "total_products": 3155,
--     "unique_skus": 3141,
--     "duplicate_skus": 14,
--     "missing": 170
--   }
-- ]


-- =====================================================
-- DASHBOARD KPI QUERY
--
-- Purpose:
--   Returns per-shop product KPIs for dashboard display:
--     - total products (default variants)
--     - unique SKUs
--     - duplicate SKUs
--     - missing SKUs per target (relative to source)
--
-- Characteristics:
--   - Fully dynamic (no hardcoded shops or TLDs)
--   - Supports any number of target shops
--   - Optimized using a single normalized base dataset
--   - SKU-based missing detection (correct logic)
-- =====================================================

WITH base AS (
    -- Normalized variant + shop dataset
    SELECT
        s.id     AS shop_id,
        s.name   AS shop_name,
        s.base_url AS shop_base_url,
        s.tld,
        s.role,
        v.sku,
        v.is_default
    FROM variants v
    JOIN shops s ON s.id = v.shop_id
    WHERE v.sku IS NOT NULL
      AND v.sku <> ''
),

-- -----------------------------------------------------
-- Per-shop totals and unique SKU counts
-- -----------------------------------------------------
shop_stats AS (
    SELECT
        shop_id,
        shop_name,
        shop_base_url,
        tld,
        role,
        COUNT(*) FILTER (WHERE is_default)            AS total_products,
        COUNT(DISTINCT sku) FILTER (WHERE is_default) AS unique_skus
    FROM base
    GROUP BY shop_id, shop_name, shop_base_url, tld, role
),

-- -----------------------------------------------------
-- Duplicate default SKUs per shop
-- -----------------------------------------------------
duplicates AS (
    SELECT
        shop_id,
        COUNT(*) AS duplicate_skus
    FROM (
        SELECT shop_id, sku
        FROM base
        WHERE is_default
        GROUP BY shop_id, sku
        HAVING COUNT(*) > 1
    ) d
    GROUP BY shop_id
),

-- -----------------------------------------------------
-- Default SKUs from the source shop
-- -----------------------------------------------------
source_skus AS (
    SELECT DISTINCT sku
    FROM base
    WHERE role = 'source'
      AND is_default
),

-- -----------------------------------------------------
-- Default SKUs per target shop
-- -----------------------------------------------------
target_skus AS (
    SELECT DISTINCT
        shop_id,
        sku
    FROM base
    WHERE role = 'target'
      AND is_default
),

-- -----------------------------------------------------
-- Missing SKUs per target shop
--   = source SKUs that do not exist in the target
-- -----------------------------------------------------
missing_per_target AS (
    SELECT
        t.shop_id,
        COUNT(*) AS missing
    FROM (
        SELECT DISTINCT shop_id
        FROM base
        WHERE role = 'target'
    ) t
    CROSS JOIN source_skus s
    LEFT JOIN target_skus ts
        ON ts.shop_id = t.shop_id
       AND ts.sku = s.sku
    WHERE ts.sku IS NULL
    GROUP BY t.shop_id
)

-- =====================================================
-- Final dashboard result
-- =====================================================
SELECT
    ss.shop_name,
    ss.shop_base_url AS base_url,
    ss.tld,
    ss.role,
    ss.total_products,
    ss.unique_skus,
    COALESCE(d.duplicate_skus, 0) AS duplicate_skus,
    CASE
        WHEN ss.role = 'target'
        THEN COALESCE(m.missing, 0)
    END AS missing
FROM shop_stats ss
LEFT JOIN duplicates d ON d.shop_id = ss.shop_id
LEFT JOIN missing_per_target m ON m.shop_id = ss.shop_id
ORDER BY ss.role, ss.tld;
