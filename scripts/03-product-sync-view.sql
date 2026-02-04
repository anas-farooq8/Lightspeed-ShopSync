-- =====================================================
-- PRODUCT SYNC STATUS VIEW (Product-Level Sync)
-- =====================================================
-- Comprehensive view that handles all sync scenarios:
--
-- CREATE SCENARIOS:
--   a. Source unique SKU doesn't exist in target → simple create
--   b. Source has duplicate SKUs → grouped, user selects source
--
-- EDIT SCENARIOS (with matching priority):
--   Matching Logic: 1) Default variant, 2) Non-default variant, 3) Not exists
--
--   1-1: Source unique SKU matches target unique SKU (default OR non-default)
--        → show with indicators
--
--   M-1: Source has multiple SKUs (duplicates), target has one match 
--        (default OR non-default) → user selects source product
--
--   1-M: Source unique SKU, target has multiple matches 
--        (default OR non-default) → user selects target product
--
--   M-M: Both source and target have multiple matches 
--        → user selects both source and target products
--
-- NULL SKU SCENARIOS:
--   - Products with NULL default_sku → separate handling (not for sync)
--
-- ROW STRUCTURE:
--   One row per source product with all target match information
--   Target matches include both default and non-default variant matches
-- =====================================================

DROP VIEW IF EXISTS product_sync_status;

CREATE VIEW product_sync_status AS
WITH 
-- -----------------------------------------------------
-- All shops info
-- -----------------------------------------------------
shops_info AS (
    SELECT id, name, tld, role
    FROM shops
),

-- -----------------------------------------------------
-- ALL source products (including those with NULL SKU)
-- -----------------------------------------------------
source_products AS (
    SELECT
        s.id                          AS shop_id,
        s.name                        AS shop_name,
        s.tld                         AS shop_tld,
        v.lightspeed_product_id,
        v.lightspeed_variant_id,
        CASE 
            WHEN v.sku IS NULL OR btrim(v.sku) = '' THEN NULL
            ELSE btrim(v.sku)
        END                           AS default_sku,
        v.price_excl,
        p.image                       AS product_image,
        p.ls_created_at,
        p.ls_updated_at,
        pc.title                      AS product_title,
        vc.title                      AS variant_title,
        (SELECT COUNT(*) 
         FROM variants v2 
         WHERE v2.shop_id = v.shop_id 
           AND v2.lightspeed_product_id = v.lightspeed_product_id
        ) AS variant_count
    FROM variants v
    JOIN shops_info s ON s.id = v.shop_id AND s.role = 'source'
    JOIN products p ON p.shop_id = v.shop_id 
                   AND p.lightspeed_product_id = v.lightspeed_product_id
    LEFT JOIN product_content pc ON pc.shop_id = v.shop_id 
                                 AND pc.lightspeed_product_id = v.lightspeed_product_id
                                 AND pc.language_code = s.tld
    LEFT JOIN variant_content vc ON vc.shop_id = v.shop_id 
                                 AND vc.lightspeed_variant_id = v.lightspeed_variant_id
                                 AND vc.language_code = s.tld
    WHERE v.is_default
),

-- -----------------------------------------------------
-- Source SKU counts (for detecting duplicates)
-- -----------------------------------------------------
source_sku_counts AS (
    SELECT 
        default_sku,
        COUNT(*) AS sku_count,
        ARRAY_AGG(lightspeed_product_id ORDER BY lightspeed_product_id) AS product_ids
    FROM source_products
    WHERE default_sku IS NOT NULL
    GROUP BY default_sku
),

-- -----------------------------------------------------
-- Target matches for ALL SKUs (including duplicates)
-- -----------------------------------------------------
target_all_variants AS (
    SELECT
        t.id AS target_shop_id,
        t.name AS target_shop_name,
        t.tld AS target_shop_tld,
        CASE 
            WHEN v.sku IS NULL OR btrim(v.sku) = '' THEN NULL
            ELSE btrim(v.sku)
        END AS sku,
        v.is_default,
        v.lightspeed_product_id,
        v.lightspeed_variant_id,
        (SELECT COUNT(*) 
         FROM variants v2 
         WHERE v2.shop_id = v.shop_id 
           AND v2.lightspeed_product_id = v.lightspeed_product_id
        ) AS variant_count
    FROM shops_info t
    JOIN variants v ON v.shop_id = t.id
    WHERE t.role = 'target'
),

-- -----------------------------------------------------
-- Aggregate target matches per SKU per shop
-- -----------------------------------------------------
target_matches AS (
    SELECT
        sp.default_sku,
        t.target_shop_id,
        t.target_shop_name,
        t.target_shop_tld,
        -- Count matches by type
        COUNT(*) FILTER (WHERE t.is_default) AS default_match_count,
        COUNT(*) FILTER (WHERE NOT t.is_default) AS non_default_match_count,
        -- Aggregate product/variant IDs
        ARRAY_AGG(DISTINCT t.lightspeed_product_id ORDER BY t.lightspeed_product_id) 
          FILTER (WHERE t.is_default) AS default_product_ids,
        ARRAY_AGG(t.lightspeed_variant_id ORDER BY t.lightspeed_variant_id) 
          FILTER (WHERE t.is_default) AS default_variant_ids,
        ARRAY_AGG(DISTINCT t.lightspeed_product_id ORDER BY t.lightspeed_product_id) 
          FILTER (WHERE NOT t.is_default) AS non_default_product_ids,
        ARRAY_AGG(t.lightspeed_variant_id ORDER BY t.lightspeed_variant_id) 
          FILTER (WHERE NOT t.is_default) AS non_default_variant_ids,
        -- Get variant counts for matched products
        ARRAY_AGG(DISTINCT t.variant_count) 
          FILTER (WHERE t.is_default) AS default_variant_counts,
        ARRAY_AGG(DISTINCT t.variant_count) 
          FILTER (WHERE NOT t.is_default) AS non_default_variant_counts
    FROM source_products sp
    CROSS JOIN shops_info ts
    LEFT JOIN target_all_variants t 
        ON t.target_shop_id = ts.id 
        AND t.sku = sp.default_sku
    WHERE ts.role = 'target'
      AND sp.default_sku IS NOT NULL
    GROUP BY sp.default_sku, t.target_shop_id, t.target_shop_name, t.target_shop_tld
),

-- -----------------------------------------------------
-- Target SKU duplicate detection
-- -----------------------------------------------------
target_sku_counts AS (
    SELECT
        target_shop_id,
        sku,
        COUNT(*) AS sku_count
    FROM target_all_variants
    WHERE sku IS NOT NULL
      AND is_default
    GROUP BY target_shop_id, sku
)

-- =====================================================
-- FINAL OUTPUT
-- =====================================================
SELECT
    -- Source identification
    sp.shop_id AS source_shop_id,
    sp.shop_name AS source_shop_name,
    sp.shop_tld AS source_shop_tld,
    sp.lightspeed_product_id AS source_product_id,
    sp.lightspeed_variant_id AS source_variant_id,
    sp.default_sku,
    
    -- Source display data
    sp.product_title,
    sp.variant_title,
    sp.product_image,
    sp.price_excl,
    sp.variant_count AS source_variant_count,
    sp.ls_created_at,
    sp.ls_updated_at,
    
    -- Source duplicate info
    COALESCE(ssc.sku_count, 1) AS source_sku_count,
    CASE 
        WHEN sp.default_sku IS NULL THEN 0
        WHEN ssc.sku_count > 1 THEN ssc.sku_count
        ELSE 1
    END AS source_duplicate_count,
    (ssc.sku_count > 1) AS source_has_duplicates,
    COALESCE(ssc.product_ids, ARRAY[sp.lightspeed_product_id]) AS source_duplicate_product_ids,
    
    -- Is NULL SKU product
    (sp.default_sku IS NULL) AS is_null_sku,
    
    -- All target shops data as JSON
    COALESCE(
        json_object_agg(
            tm.target_shop_tld,
            json_build_object(
                'shop_id', tm.target_shop_id,
                'shop_name', tm.target_shop_name,
                'shop_tld', tm.target_shop_tld,
                -- Match counts
                'default_matches', COALESCE(tm.default_match_count, 0),
                'non_default_matches', COALESCE(tm.non_default_match_count, 0),
                'total_matches', COALESCE(tm.default_match_count, 0) + COALESCE(tm.non_default_match_count, 0),
                -- IDs for linking
                'default_product_ids', COALESCE(tm.default_product_ids, ARRAY[]::bigint[]),
                'default_variant_ids', COALESCE(tm.default_variant_ids, ARRAY[]::bigint[]),
                'non_default_product_ids', COALESCE(tm.non_default_product_ids, ARRAY[]::bigint[]),
                'non_default_variant_ids', COALESCE(tm.non_default_variant_ids, ARRAY[]::bigint[]),
                -- Variant counts for indicators
                'default_variant_counts', COALESCE(tm.default_variant_counts, ARRAY[]::bigint[]),
                'non_default_variant_counts', COALESCE(tm.non_default_variant_counts, ARRAY[]::bigint[]),
                -- Duplicate detection in target
                'target_has_duplicates', COALESCE(tsc.sku_count, 0) > 1,
                'target_sku_count', COALESCE(tsc.sku_count, 0),
                -- Computed status
                'status', CASE
                    WHEN sp.default_sku IS NULL THEN 'null_sku'
                    WHEN tm.target_shop_id IS NULL 
                         OR (COALESCE(tm.default_match_count, 0) = 0 
                             AND COALESCE(tm.non_default_match_count, 0) = 0) 
                    THEN 'not_exists'
                    WHEN (COALESCE(tm.default_match_count, 0) + COALESCE(tm.non_default_match_count, 0)) = 1 
                    THEN 'exists_single'
                    WHEN (COALESCE(tm.default_match_count, 0) + COALESCE(tm.non_default_match_count, 0)) > 1 
                    THEN 'exists_multiple'
                    ELSE 'unknown'
                END,
                -- Match type for understanding
                'match_type', CASE
                    WHEN tm.default_match_count > 0 THEN 'default_variant'
                    WHEN tm.non_default_match_count > 0 THEN 'non_default_variant'
                    ELSE 'no_match'
                END
            )
        ) FILTER (WHERE tm.target_shop_id IS NOT NULL),
        '{}'::json
    ) AS targets

FROM source_products sp
LEFT JOIN source_sku_counts ssc ON ssc.default_sku = sp.default_sku
LEFT JOIN target_matches tm ON tm.default_sku = sp.default_sku
LEFT JOIN target_sku_counts tsc 
    ON tsc.target_shop_id = tm.target_shop_id 
    AND tsc.sku = sp.default_sku
GROUP BY 
    sp.shop_id,
    sp.shop_name,
    sp.shop_tld,
    sp.lightspeed_product_id,
    sp.lightspeed_variant_id,
    sp.default_sku,
    sp.product_title,
    sp.variant_title,
    sp.product_image,
    sp.price_excl,
    sp.variant_count,
    sp.ls_created_at,
    sp.ls_updated_at,
    ssc.sku_count,
    ssc.product_ids;

-- =====================================================
-- INDEXES & PERMISSIONS
-- =====================================================

-- Enable RLS on the view
ALTER VIEW product_sync_status SET (security_invoker = true);

-- Grant SELECT to authenticated users
GRANT SELECT ON product_sync_status TO authenticated;

-- =====================================================
-- USAGE EXAMPLES BY SCENARIO
-- =====================================================

-- ===== CREATE TAB =====

-- CREATE Scenario A: Simple create (unique SKU, doesn't exist in target)
-- SELECT * FROM product_sync_status 
-- WHERE source_duplicate_count = 1
--   AND is_null_sku = false
--   AND (targets->'be'->>'status') = 'not_exists'
-- ORDER BY product_title;

-- CREATE Scenario B: Source has duplicate SKUs (grouped display)
-- SELECT 
--   default_sku,
--   source_duplicate_count,
--   source_duplicate_product_ids,
--   json_agg(json_build_object(
--     'product_id', source_product_id,
--     'title', product_title,
--     'image', product_image
--   )) as source_products
-- FROM product_sync_status 
-- WHERE source_has_duplicates = true
--   AND is_null_sku = false
-- GROUP BY default_sku, source_duplicate_count, source_duplicate_product_ids;

-- CREATE: Missing in all target shops
-- SELECT * FROM product_sync_status 
-- WHERE is_null_sku = false
--   AND source_duplicate_count = 1
--   AND (SELECT bool_and((value->>'status')::text = 'not_exists') 
--        FROM json_each(targets));

-- ===== EDIT TAB =====

-- EDIT Scenario 1-1: Unique source SKU matches unique target SKU 
-- (can be default or non-default variant match)
-- SELECT * FROM product_sync_status 
-- WHERE source_duplicate_count = 1
--   AND is_null_sku = false
--   AND (targets->'be'->>'status') = 'exists_single'
--   AND (targets->'be'->>'total_matches')::int = 1;

-- EDIT Scenario M-1: Multiple source SKUs (duplicates), one target match
-- User must select which source product to use
-- SELECT * FROM product_sync_status 
-- WHERE source_has_duplicates = true
--   AND is_null_sku = false
--   AND (targets->'be'->>'status') = 'exists_single'
--   AND (targets->'be'->>'total_matches')::int = 1;

-- EDIT Scenario 1-M: Unique source SKU, multiple target matches
-- User must select which target product to update
-- SELECT * FROM product_sync_status 
-- WHERE source_duplicate_count = 1
--   AND is_null_sku = false
--   AND (targets->'be'->>'status') = 'exists_multiple'
--   AND (targets->'be'->>'total_matches')::int > 1;

-- EDIT Scenario M-M: Multiple source SKUs, multiple target matches
-- User must select both source and target products
-- SELECT * FROM product_sync_status 
-- WHERE source_has_duplicates = true
--   AND is_null_sku = false
--   AND (targets->'be'->>'status') = 'exists_multiple'
--   AND (targets->'be'->>'total_matches')::int > 1;

-- Check match type (for understanding matching logic)
-- SELECT 
--   default_sku,
--   product_title,
--   targets->'be'->>'match_type' as be_match_type,
--   targets->'be'->>'default_matches' as be_default_matches,
--   targets->'be'->>'non_default_matches' as be_non_default_matches
-- FROM product_sync_status 
-- WHERE (targets->'be'->>'status') IN ('exists_single', 'exists_multiple');

-- ===== NULL SKU TAB =====

-- NULL SKU: All products with NULL default SKU
-- SELECT * FROM product_sync_status 
-- WHERE is_null_sku = true
-- ORDER BY source_shop_tld, product_title;

-- ===== UTILITY QUERIES =====

-- Get variant count differences (for indicators in EDIT)
-- SELECT 
--   default_sku,
--   product_title,
--   source_variant_count,
--   targets->'be'->'default_variant_counts' as be_variant_counts
-- FROM product_sync_status 
-- WHERE (targets->'be'->>'status') = 'exists_single';

