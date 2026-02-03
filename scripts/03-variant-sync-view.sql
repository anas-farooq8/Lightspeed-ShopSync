-- =====================================================
-- PRODUCT SYNC STATUS VIEW (Product-Level Sync)
-- =====================================================
-- Minimal: only list-display data. Fetch full details on product/sync page.
-- Source: .nl, default language. Matching: default first, then non-default.
-- Structure mismatch: .nl 5 products (1 var each) → .be 1 product (5 vars):
--   all 5 match same .be product via tb_non (non-default variant fallback).
--
-- MATCHING LOGIC (target_matches CTE + COALESCE in SELECT):
--   1. Match by DEFAULT variant SKU first (def_*)
--   2. Fallback: match by NON-DEFAULT variant SKU if no default match (non_def_*)
--   3. COALESCE(td.def_*, td.non_def_*) picks default first, then non-default
-- =====================================================

DROP VIEW IF EXISTS product_sync_status;

-- Optimized: single base scan, conditional aggregation per (tld, sku), 2 joins instead of 4
CREATE VIEW product_sync_status AS
WITH variant_counts_de_be AS (
    SELECT v.shop_id, v.lightspeed_product_id, count(*)::int AS cnt
    FROM variants v
    INNER JOIN shops s ON s.id = v.shop_id
    WHERE s.tld IN ('de', 'be')
    GROUP BY v.shop_id, v.lightspeed_product_id
),
base AS (
    SELECT v.shop_id, v.lightspeed_variant_id, v.lightspeed_product_id, v.sku,
        v.price_excl, v.is_default, v.updated_at, s.tld,
        vc.cnt AS product_variant_count
    FROM variants v
    INNER JOIN shops s ON s.id = v.shop_id
    LEFT JOIN variant_counts_de_be vc ON vc.shop_id = v.shop_id AND vc.lightspeed_product_id = v.lightspeed_product_id
    WHERE s.tld IN ('nl', 'de', 'be') AND v.sku IS NOT NULL AND v.sku != ''
),
-- NL default products: driver set (smallest)
nl_base AS (
    SELECT 
        b.lightspeed_variant_id AS nl_default_variant_id,
        b.lightspeed_product_id AS nl_product_id,
        b.sku AS default_sku,
        b.price_excl,
        b.updated_at,
        vc.title AS default_variant_title,
        pc.title AS product_title,
        p.image AS product_image,
        b.shop_id
    FROM base b
    LEFT JOIN variant_content vc ON vc.shop_id = b.shop_id 
        AND vc.lightspeed_variant_id = b.lightspeed_variant_id AND vc.language_code = 'nl'
    LEFT JOIN product_content pc ON pc.shop_id = b.shop_id 
        AND pc.lightspeed_product_id = b.lightspeed_product_id AND pc.language_code = 'nl'
    LEFT JOIN products p ON p.shop_id = b.shop_id AND p.lightspeed_product_id = b.lightspeed_product_id
    WHERE b.tld = 'nl' AND b.is_default = true
),
nl_variant_cnt AS (
    SELECT shop_id, lightspeed_product_id, COUNT(*) AS cnt
    FROM base WHERE tld = 'nl'
    GROUP BY shop_id, lightspeed_product_id
),
-- Consolidated: one row per (tld, sku) with def/non-def via FILTER (like get_sync_stats)
-- product_variant_count: real variant count per matched product (for de_variant_counts/be_variant_counts)
target_matches AS (
    SELECT tld, sku,
        COUNT(*) FILTER (WHERE is_default) AS def_match_count,
        ARRAY_AGG(lightspeed_product_id ORDER BY lightspeed_product_id) FILTER (WHERE is_default) AS def_product_ids,
        ARRAY_AGG(lightspeed_variant_id ORDER BY lightspeed_product_id) FILTER (WHERE is_default) AS def_variant_ids,
        ARRAY_AGG(COALESCE(product_variant_count, 1) ORDER BY lightspeed_product_id) FILTER (WHERE is_default) AS def_variant_counts,
        COUNT(*) FILTER (WHERE NOT is_default) AS non_def_match_count,
        ARRAY_AGG(lightspeed_product_id ORDER BY lightspeed_product_id) FILTER (WHERE NOT is_default) AS non_def_product_ids,
        ARRAY_AGG(lightspeed_variant_id ORDER BY lightspeed_product_id) FILTER (WHERE NOT is_default) AS non_def_variant_ids,
        ARRAY_AGG(COALESCE(product_variant_count, 1) ORDER BY lightspeed_product_id) FILTER (WHERE NOT is_default) AS non_def_variant_counts
    FROM base
    WHERE tld IN ('de', 'be')
    GROUP BY tld, sku
),
nl_dups AS (
    SELECT sku, COUNT(*) AS nl_duplicate_count
    FROM base
    WHERE tld = 'nl' AND is_default = true
    GROUP BY sku
    HAVING COUNT(*) > 1
)
SELECT 
    nb.*,
    COALESCE(nvc.cnt, 1)::int AS nl_variant_count,
    COALESCE(nd.nl_duplicate_count, 1) AS nl_duplicate_count,
    (nd.nl_duplicate_count IS NOT NULL) AS has_nl_duplicates,
    COALESCE(td.def_match_count, td.non_def_match_count, 0)::int AS de_match_count,
    COALESCE(td.def_product_ids, td.non_def_product_ids) AS de_product_ids,
    COALESCE(td.def_variant_ids, td.non_def_variant_ids) AS de_default_variant_ids,
    COALESCE(td.def_variant_counts, td.non_def_variant_counts) AS de_variant_counts,
    CASE WHEN COALESCE(td.def_match_count, td.non_def_match_count) IS NULL THEN 'not_exists'
         WHEN COALESCE(td.def_match_count, td.non_def_match_count) = 1 THEN 'exists_single'
         ELSE 'exists_multiple' END AS de_status,
    COALESCE(tb.def_match_count, tb.non_def_match_count, 0)::int AS be_match_count,
    COALESCE(tb.def_product_ids, tb.non_def_product_ids) AS be_product_ids,
    COALESCE(tb.def_variant_ids, tb.non_def_variant_ids) AS be_default_variant_ids,
    COALESCE(tb.def_variant_counts, tb.non_def_variant_counts) AS be_variant_counts,
    CASE WHEN COALESCE(tb.def_match_count, tb.non_def_match_count) IS NULL THEN 'not_exists'
         WHEN COALESCE(tb.def_match_count, tb.non_def_match_count) = 1 THEN 'exists_single'
         ELSE 'exists_multiple' END AS be_status
FROM nl_base nb
LEFT JOIN nl_variant_cnt nvc ON nvc.shop_id = nb.shop_id AND nvc.lightspeed_product_id = nb.nl_product_id
LEFT JOIN target_matches td ON td.tld = 'de' AND td.sku = nb.default_sku
LEFT JOIN target_matches tb ON tb.tld = 'be' AND tb.sku = nb.default_sku
LEFT JOIN nl_dups nd ON nd.sku = nb.default_sku;


-- =====================================================
-- PERMISSIONS & RLS
-- =====================================================
-- Enable RLS on the view
ALTER VIEW product_sync_status SET (security_invoker = true);

-- Grant SELECT to authenticated users (for UI access)
GRANT SELECT ON product_sync_status TO authenticated;


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
        tld,
        role,
        COUNT(*) FILTER (WHERE is_default)            AS total_products,
        COUNT(DISTINCT sku) FILTER (WHERE is_default) AS unique_skus
    FROM base
    GROUP BY shop_id, shop_name, tld, role
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
