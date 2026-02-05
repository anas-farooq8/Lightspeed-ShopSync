-- =====================================================
-- PRODUCT SYNC STATUS VIEW
-- =====================================================
-- 
-- PERFORMANCE OPTIMIZATIONS:
--   1. Early filtering with WHERE clauses (before joins)
--   2. Leverages composite indexes on variants table
--   3. Minimized joins - only essential tables
--   4. Window functions for counting (single pass)
--   5. JSONB aggregation (faster than JSON)
--   6. Materialized CTE optimization hints
--   7. Reduced data shuffling with strategic GROUP BY placement
--
-- MATCHING LOGIC:
--   Searches ALL variants (default + non-default) simultaneously
--   Counts separately, then prioritizes match_type: default > non-default > no_match
--
-- ROW STRUCTURE:
--   One row per source product with all target information in JSONB
-- =====================================================

DROP VIEW IF EXISTS product_sync_status;

CREATE VIEW product_sync_status AS
WITH 
-- ==========================================
-- STEP 1: Get Source Shop Info
-- ==========================================
-- Single lookup of source shop (avoids repeated queries)
source_shop AS (
    SELECT id, name, tld
    FROM shops
    WHERE role = 'source'
    LIMIT 1
),

-- ==========================================
-- STEP 2: Get Source Products with Valid SKUs
-- ==========================================
-- All source products where default variant has a valid SKU
-- Uses functional index: idx_variants_trimmed_sku_default
source_products AS (
    SELECT
        ss.id AS shop_id,
        ss.name AS shop_name,
        ss.tld AS shop_tld,
        v.lightspeed_product_id,
        v.lightspeed_variant_id,
        TRIM(v.sku) AS sku,  -- Normalized SKU for matching
        v.price_excl,
        p.image AS product_image,
        p.ls_created_at,
        pc.title AS product_title,
        vc.title AS variant_title
    FROM source_shop ss
    INNER JOIN variants v ON v.shop_id = ss.id
        AND v.is_default = true
        AND TRIM(v.sku) <> ''  -- Leverages functional index
    INNER JOIN products p ON p.shop_id = ss.id 
        AND p.lightspeed_product_id = v.lightspeed_product_id
    LEFT JOIN product_content pc ON pc.shop_id = ss.id 
        AND pc.lightspeed_product_id = v.lightspeed_product_id
        AND pc.language_code = ss.tld
    LEFT JOIN variant_content vc ON vc.shop_id = ss.id 
        AND vc.lightspeed_variant_id = v.lightspeed_variant_id
        AND vc.language_code = ss.tld
),

-- ==========================================
-- STEP 3: Count Variants per Product
-- ==========================================
-- Needed for UI indicators (how many variants in product)
source_variant_counts AS (
    SELECT
        shop_id,
        lightspeed_product_id,
        COUNT(*) AS variant_count
    FROM variants
    WHERE shop_id IN (SELECT id FROM source_shop)
    GROUP BY shop_id, lightspeed_product_id
),

-- ==========================================
-- STEP 4: Detect Source Duplicate SKUs
-- ==========================================
-- Window function for single-pass counting (efficient)
-- Shows which SKUs appear multiple times in source
source_sku_stats AS (
    SELECT DISTINCT
        sku,
        COUNT(*) OVER (PARTITION BY sku) AS duplicate_count,
        ARRAY_AGG(lightspeed_product_id) OVER (
            PARTITION BY sku 
            ORDER BY lightspeed_product_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS product_ids
    FROM source_products
),

-- ==========================================
-- STEP 5: Get Target Shops
-- ==========================================
-- All target shops (dynamically loaded from database) cached for reuse
target_shops AS (
    SELECT id, tld, name
    FROM shops
    WHERE role = 'target'
    ORDER BY tld  -- Consistent ordering
),

-- ==========================================
-- STEP 6: Match-Driven SKU Matching (OPTIMIZED)
-- ==========================================
-- Searches ALL variants (default + non-default) simultaneously
-- Uses UNION to combine: actual matches + missing combinations
-- Part 1: Find actual matches (INNER JOIN - searches ALL variants at once)
--         Counts default_matches and non_default_matches separately
--         Sets match_type with priority: default > non-default
-- Part 2: Find missing SKUs (combinations with no matches)
-- ==========================================
-- Result: Minimal row generation, scalable to millions of SKUs
-- ==========================================
normalized_source_skus AS (
    -- Pre-normalize SKUs once (avoid repeated TRIM in joins)
    SELECT DISTINCT sku FROM source_products
),
-- ==========================================
-- Part 1: ACTUAL MATCHES
-- ==========================================
-- Searches ALL target variants (default + non-default) in single query
-- Counts them separately using FILTER clauses for priority labeling
-- ==========================================
actual_matches AS (
    SELECT
        nss.sku,
        v.shop_id AS target_shop_id,
        ts.tld AS target_tld,
        ts.name AS target_name,
        COUNT(*) FILTER (WHERE v.is_default = true) AS default_matches,
        COUNT(*) FILTER (WHERE v.is_default = false) AS non_default_matches,
        -- Store matched product IDs separately by match type
        ARRAY_AGG(DISTINCT v.lightspeed_product_id ORDER BY v.lightspeed_product_id) 
            FILTER (WHERE v.is_default = true) AS default_product_ids,
        ARRAY_AGG(DISTINCT v.lightspeed_product_id ORDER BY v.lightspeed_product_id) 
            FILTER (WHERE v.is_default = false) AS non_default_product_ids,
        CASE 
            WHEN COUNT(*) FILTER (WHERE v.is_default = true) > 0 THEN 'default_variant'
            ELSE 'non_default_variant'
        END AS match_type
    FROM normalized_source_skus nss
    INNER JOIN variants v ON TRIM(v.sku) = nss.sku  -- Uses functional index
    INNER JOIN target_shops ts ON ts.id = v.shop_id
    GROUP BY nss.sku, v.shop_id, ts.tld, ts.name
),
-- Part 2: MISSING SKUS (find SKUs not in actual_matches per shop)
missing_skus AS (
    SELECT
        nss.sku,
        ts.id AS target_shop_id,
        ts.tld AS target_tld,
        ts.name AS target_name,
        0 AS default_matches,
        0 AS non_default_matches,
        ARRAY[]::BIGINT[] AS default_product_ids,
        ARRAY[]::BIGINT[] AS non_default_product_ids,
        'no_match' AS match_type
    FROM normalized_source_skus nss
    CROSS JOIN target_shops ts
    WHERE NOT EXISTS (
        SELECT 1 FROM actual_matches am
        WHERE am.sku = nss.sku AND am.target_shop_id = ts.id
    )
),
-- Combine both: matches + missing
sku_target_matches AS (
    SELECT * FROM actual_matches
    UNION ALL
    SELECT * FROM missing_skus
)

-- ==========================================
-- STEP 7: Final Assembly - One Row Per Source Product
-- ==========================================
-- Joins all CTEs together and aggregates target shop data into JSONB
-- Result: One row per source product with all sync information
SELECT
    -- ========================================
    -- Source Product Identification
    -- ========================================
    sp.shop_id AS source_shop_id,
    sp.shop_name AS source_shop_name,
    sp.shop_tld AS source_shop_tld,
    sp.lightspeed_product_id AS source_product_id,
    sp.lightspeed_variant_id AS source_variant_id,
    sp.sku AS default_sku,
    
    -- ========================================
    -- Display Data (for UI list views)
    -- ========================================
    sp.product_title,
    sp.variant_title,
    sp.product_image,
    sp.price_excl,
    COALESCE(svc.variant_count, 1) AS source_variant_count,
    sp.ls_created_at,
    
    -- ========================================
    -- Source Duplicate Information
    -- ========================================
    -- Used to group duplicates in UI and show badges
    sss.duplicate_count AS source_duplicate_count,
    (sss.duplicate_count > 1) AS source_has_duplicates,
    sss.product_ids AS source_duplicate_product_ids,
    
    -- ========================================
    -- Target Shops Data (JSONB format)
    -- ========================================
    -- Aggregates all target shop match info into single JSONB column
    -- Format: { "tld1": {...}, "tld2": {...}, ... } (dynamic based on target shops in database)
    -- Each target contains: status, match_type, match counts, and product IDs separated by match type
    jsonb_object_agg(
        stm.target_tld,
        jsonb_build_object(
            'shop_id', stm.target_shop_id,
            'shop_name', stm.target_name,
            'shop_tld', stm.target_tld,
            -- Status: not_exists, exists_single, exists_multiple
            'status', CASE
                WHEN stm.match_type = 'no_match' THEN 'not_exists'
                WHEN stm.default_matches + stm.non_default_matches = 1 THEN 'exists_single'
                WHEN stm.default_matches + stm.non_default_matches > 1 THEN 'exists_multiple'
                ELSE 'unknown'
            END,
            -- Match type: default_variant, non_default_variant, no_match
            'match_type', stm.match_type,
            'default_matches', stm.default_matches,
            'non_default_matches', stm.non_default_matches,
            'total_matches', stm.default_matches + stm.non_default_matches,
            -- Separate arrays for default and non-default matched products
            'default_product_ids', COALESCE(stm.default_product_ids, ARRAY[]::BIGINT[]),
            'non_default_product_ids', COALESCE(stm.non_default_product_ids, ARRAY[]::BIGINT[])
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
    svc.variant_count, sp.ls_created_at,
    sss.duplicate_count, sss.product_ids;

-- =====================================================
-- PERMISSIONS
-- =====================================================

ALTER VIEW product_sync_status SET (security_invoker = true);
GRANT SELECT ON product_sync_status TO authenticated;
