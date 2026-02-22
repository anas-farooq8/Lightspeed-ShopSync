-- =====================================================
-- PRODUCT SYNC STATUS VIEW (Run after 01: 03-product-sync-view.sql)
-- =====================================================
--
-- Uses: shops, variants, products, product_content, variant_content
--
-- Purpose:
--   One row per source product with target match status in JSONB.
--   Used by get_sync_operations for CREATE/EDIT tabs.
--
-- Matching logic:
--   Searches ALL variants (default + non-default) in one pass.
--   match_type: default_variant > non_default_variant > no_match
--
-- Output structure:
--   targets: { "tld": { status, match_type, total_matches, default_matches, non_default_matches, shop_id, shop_name, shop_tld }, ... }
--
-- Performance:
--   - Single-pass variant matching (no separate default/non-default scans)
--   - COUNT only (no ARRAY_AGG of product IDs - not needed for list view)
--   - GROUP BY for source_sku_stats (cleaner than window + DISTINCT)
--   - Uses idx_variants_trimmed_sku for SKU lookups
--   - Uses idx_shops_role for source_shop / target_shops CTEs (01-init-schema)
--
-- Example row (targets excerpt):
--   "be": {
--     "status": "not_exists",
--     "match_type": "no_match",
--     "total_matches": 0,
--     "default_matches": 0,
--     "non_default_matches": 0,
--     "shop_id": "e9a669f2-...",
--     "shop_name": "VerpakkingenXL - BE",
--     "shop_tld": "be"
--   },
--   "de": {
--     "status": "exists",
--     "match_type": "default_variant",
--     "total_matches": 1,
--     "default_matches": 1,
--     "non_default_matches": 0,
--     "shop_id": "a1f64422-...",
--     "shop_name": "VerpackungenXL",
--     "shop_tld": "de"
--   }
-- =====================================================

DROP VIEW IF EXISTS product_sync_status;

CREATE VIEW product_sync_status AS
WITH
source_shop AS (
    SELECT id, name, tld
    FROM shops
    WHERE role = 'source'
    LIMIT 1
),

source_products AS (
    SELECT
        ss.id AS shop_id,
        ss.name AS shop_name,
        ss.tld AS shop_tld,
        v.lightspeed_product_id,
        v.lightspeed_variant_id,
        TRIM(v.sku) AS sku,
        v.price_excl,
        p.image AS product_image,
        p.ls_created_at,
        p.updated_at,
        pc.title AS product_title,
        vc.title AS variant_title
    FROM source_shop ss
    INNER JOIN variants v ON v.shop_id = ss.id
        AND v.is_default = true
        AND TRIM(v.sku) <> ''
    INNER JOIN products p ON p.shop_id = ss.id
        AND p.lightspeed_product_id = v.lightspeed_product_id
    LEFT JOIN product_content pc ON pc.shop_id = ss.id
        AND pc.lightspeed_product_id = v.lightspeed_product_id
        AND pc.language_code = ss.tld
    LEFT JOIN variant_content vc ON vc.shop_id = ss.id
        AND vc.lightspeed_variant_id = v.lightspeed_variant_id
        AND vc.language_code = ss.tld
),

source_variant_counts AS (
    SELECT v.shop_id, v.lightspeed_product_id, COUNT(*) AS variant_count
    FROM variants v
    INNER JOIN source_shop ss ON v.shop_id = ss.id
    GROUP BY v.shop_id, v.lightspeed_product_id
),

source_sku_stats AS (
    SELECT
        sku,
        COUNT(*) AS duplicate_count,
        ARRAY_AGG(lightspeed_product_id ORDER BY lightspeed_product_id) AS product_ids
    FROM source_products
    GROUP BY sku
),

target_shops AS (
    SELECT id, tld, name
    FROM shops
    WHERE role = 'target'
    ORDER BY tld
),

normalized_source_skus AS (
    SELECT DISTINCT sku FROM source_products
),

actual_matches AS (
    SELECT
        nss.sku,
        v.shop_id AS target_shop_id,
        ts.tld AS target_tld,
        ts.name AS target_name,
        COUNT(*) FILTER (WHERE v.is_default = true) AS default_matches,
        COUNT(*) FILTER (WHERE v.is_default = false) AS non_default_matches,
        CASE
            WHEN COUNT(*) FILTER (WHERE v.is_default = true) > 0 THEN 'default_variant'
            ELSE 'non_default_variant'
        END AS match_type
    FROM normalized_source_skus nss
    INNER JOIN variants v ON TRIM(v.sku) = nss.sku
    INNER JOIN target_shops ts ON ts.id = v.shop_id
    GROUP BY nss.sku, v.shop_id, ts.tld, ts.name
),

missing_skus AS (
    SELECT
        nss.sku,
        ts.id AS target_shop_id,
        ts.tld AS target_tld,
        ts.name AS target_name,
        0 AS default_matches,
        0 AS non_default_matches,
        'no_match' AS match_type
    FROM normalized_source_skus nss
    CROSS JOIN target_shops ts
    WHERE NOT EXISTS (
        SELECT 1 FROM actual_matches am
        WHERE am.sku = nss.sku AND am.target_shop_id = ts.id
    )
),

sku_target_matches AS (
    SELECT sku, target_shop_id, target_tld, target_name,
           default_matches, non_default_matches,
           default_matches + non_default_matches AS total_matches,
           match_type
    FROM actual_matches
    UNION ALL
    SELECT sku, target_shop_id, target_tld, target_name,
           0 AS default_matches, 0 AS non_default_matches,
           0 AS total_matches,
           match_type
    FROM missing_skus
)

SELECT
    sp.shop_id AS source_shop_id,
    sp.shop_name AS source_shop_name,
    sp.shop_tld AS source_shop_tld,
    sp.lightspeed_product_id AS source_product_id,
    sp.lightspeed_variant_id AS source_variant_id,
    sp.sku AS default_sku,
    sp.product_title,
    sp.variant_title,
    sp.product_image,
    sp.price_excl,
    COALESCE(svc.variant_count, 1) AS source_variant_count,
    sp.ls_created_at,
    sp.updated_at,
    sss.duplicate_count AS source_duplicate_count,
    (sss.duplicate_count > 1) AS source_has_duplicates,
    sss.product_ids AS source_duplicate_product_ids,
    jsonb_object_agg(
        stm.target_tld,
        jsonb_build_object(
            'status', CASE
                WHEN stm.match_type = 'no_match' THEN 'not_exists'
                WHEN stm.total_matches > 0 THEN 'exists'
                ELSE 'unknown'
            END,
            'match_type', stm.match_type,
            'total_matches', stm.total_matches,
            'default_matches', stm.default_matches,
            'non_default_matches', stm.non_default_matches,
            'shop_id', stm.target_shop_id,
            'shop_name', stm.target_name,
            'shop_tld', stm.target_tld
        )
    ) AS targets
FROM source_products sp
INNER JOIN source_sku_stats sss ON sss.sku = sp.sku
INNER JOIN sku_target_matches stm ON stm.sku = sp.sku
LEFT JOIN source_variant_counts svc ON svc.shop_id = sp.shop_id
    AND svc.lightspeed_product_id = sp.lightspeed_product_id
GROUP BY
    sp.shop_id, sp.shop_name, sp.shop_tld,
    sp.lightspeed_product_id, sp.lightspeed_variant_id, sp.sku,
    sp.product_title, sp.variant_title, sp.product_image, sp.price_excl,
    svc.variant_count, sp.ls_created_at, sp.updated_at,
    sss.duplicate_count, sss.product_ids;

-- =====================================================
-- PERMISSIONS
-- =====================================================

ALTER VIEW product_sync_status SET (security_invoker = true);
GRANT SELECT ON product_sync_status TO authenticated;
