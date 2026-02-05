-- =====================================================
-- PRODUCT DETAILS RPC FUNCTION (BY SKU)
-- =====================================================
--
-- Purpose: Fetch ALL products matching a SKU (source + targets), handling duplicates
-- 
-- Features:
--   - Single query with JSONB aggregation (highly optimized)
--   - Fetches ALL source products with matching SKU (handles duplicates)
--   - Fetches ALL target products with matching SKU (handles duplicates)
--   - Groups target products by shop TLD
--   - Fetches all languages and variants with multi-language content
--   - Returns structured JSONB for easy frontend consumption
--
-- Parameters:
--   p_sku: SKU to search for (required)
--   p_preferred_product_id: Optional product ID to prioritize (for source duplicates)
--
-- Returns: JSONB with structure:
--   {
--     "source": [{...}, {...}],      -- Array of ALL source products with this SKU
--     "targets": {                    -- Grouped by TLD
--       "be": [{...}, {...}],         -- Array of products in .be shop
--       "de": [{...}]                 -- Array of products in .de shop
--     },
--     "shop_languages": {...}         -- Languages per shop
--   }
-- =====================================================

DROP FUNCTION IF EXISTS get_product_details_by_sku(TEXT, BIGINT);

CREATE OR REPLACE FUNCTION get_product_details_by_sku(
    p_sku TEXT,
    p_preferred_product_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    source JSONB,
    targets JSONB,
    shop_languages JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_source_shop_id UUID;
    v_sku TEXT;
BEGIN
    -- ========================================
    -- STEP 1: Validate and normalize SKU
    -- ========================================
    v_sku := TRIM(p_sku);
    
    IF v_sku IS NULL OR v_sku = '' THEN
        RAISE EXCEPTION 'Invalid SKU provided';
    END IF;

    -- ========================================
    -- STEP 2: Get source shop ID
    -- ========================================
    SELECT id INTO v_source_shop_id
    FROM shops
    WHERE role = 'source'
    LIMIT 1;

    IF v_source_shop_id IS NULL THEN
        RAISE EXCEPTION 'No source shop found';
    END IF;

    -- ========================================
    -- STEP 3: Return aggregated product data
    -- ========================================
    RETURN QUERY
    WITH 
    -- Get source and target shops
    all_shops AS (
        SELECT id, name, tld, role, base_url
        FROM shops
        ORDER BY 
            CASE WHEN role = 'source' THEN 0 ELSE 1 END,
            tld
    ),
    -- Get all shop languages
    all_shop_languages AS (
        SELECT
            s.tld,
            jsonb_agg(
                jsonb_build_object(
                    'code', sl.code,
                    'is_active', sl.is_active,
                    'is_default', sl.is_default
                )
                ORDER BY sl.is_default DESC, sl.code
            ) AS languages
        FROM shops s
        INNER JOIN shop_languages sl ON sl.shop_id = s.id
        WHERE sl.is_active = true
        GROUP BY s.id, s.tld
    ),
    -- Find ALL products matching the SKU across all shops
    matched_products AS (
        SELECT DISTINCT
            s.id AS shop_id,
            s.name AS shop_name,
            s.tld AS shop_tld,
            s.role AS shop_role,
            s.base_url,
            v.lightspeed_product_id,
            v.lightspeed_variant_id AS default_variant_id,
            v.is_default AS matched_by_default_variant,
            p.visibility,
            p.image AS product_image,
            p.ls_created_at
        FROM all_shops s
        INNER JOIN variants v ON v.shop_id = s.id 
            AND TRIM(v.sku) = v_sku
        INNER JOIN products p ON p.shop_id = s.id 
            AND p.lightspeed_product_id = v.lightspeed_product_id
    ),
    -- Get all product content (multi-language) for matched products
    product_contents AS (
        SELECT
            mp.shop_id,
            mp.lightspeed_product_id,
            jsonb_object_agg(
                pc.language_code,
                jsonb_build_object(
                    'url', pc.url,
                    'title', pc.title,
                    'fulltitle', pc.fulltitle,
                    'description', pc.description,
                    'content', pc.content
                )
            ) AS content_by_language
        FROM matched_products mp
        LEFT JOIN product_content pc ON pc.shop_id = mp.shop_id 
            AND pc.lightspeed_product_id = mp.lightspeed_product_id
        GROUP BY mp.shop_id, mp.lightspeed_product_id
    ),
    -- Get all variants for matched products
    product_variants AS (
        SELECT
            mp.shop_id,
            mp.lightspeed_product_id,
            jsonb_agg(
                jsonb_build_object(
                    'variant_id', v.lightspeed_variant_id,
                    'sku', v.sku,
                    'is_default', v.is_default,
                    'price_excl', v.price_excl,
                    'image', v.image,
                    'content_by_language', COALESCE(vc_agg.content_by_language, '{}'::jsonb)
                )
                ORDER BY v.is_default DESC, v.lightspeed_variant_id
            ) AS variants
        FROM matched_products mp
        INNER JOIN variants v ON v.shop_id = mp.shop_id 
            AND v.lightspeed_product_id = mp.lightspeed_product_id
        LEFT JOIN LATERAL (
            SELECT jsonb_object_agg(
                vc.language_code,
                jsonb_build_object('title', vc.title)
            ) AS content_by_language
            FROM variant_content vc
            WHERE vc.shop_id = mp.shop_id 
              AND vc.lightspeed_variant_id = v.lightspeed_variant_id
        ) vc_agg ON true
        GROUP BY mp.shop_id, mp.lightspeed_product_id
    ),
    -- Combine all data per product
    full_product_data AS (
        SELECT
            mp.shop_id,
            mp.shop_name,
            mp.shop_tld,
            mp.shop_role,
            mp.base_url,
            mp.lightspeed_product_id,
            mp.default_variant_id,
            mp.matched_by_default_variant,
            mp.visibility,
            mp.product_image,
            mp.ls_created_at,
            COALESCE(pc.content_by_language, '{}'::jsonb) AS content_by_language,
            COALESCE(pv.variants, '[]'::jsonb) AS variants,
            (SELECT COUNT(*) FROM variants WHERE shop_id = mp.shop_id AND lightspeed_product_id = mp.lightspeed_product_id) AS variant_count
        FROM matched_products mp
        LEFT JOIN product_contents pc ON pc.shop_id = mp.shop_id 
            AND pc.lightspeed_product_id = mp.lightspeed_product_id
        LEFT JOIN product_variants pv ON pv.shop_id = mp.shop_id 
            AND pv.lightspeed_product_id = mp.lightspeed_product_id
    )
    -- Final aggregation: source array vs targets grouped by TLD
    SELECT
        -- SOURCE products array (ALL products with this SKU in source shop)
        (SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'shop_id', shop_id,
                'shop_name', shop_name,
                'shop_tld', shop_tld,
                'shop_role', shop_role,
                'base_url', base_url,
                'product_id', lightspeed_product_id,
                'default_variant_id', default_variant_id,
                'sku', v_sku,
                'visibility', visibility,
                'product_image', product_image,
                'ls_created_at', ls_created_at,
                'content_by_language', content_by_language,
                'variants', variants,
                'variant_count', variant_count
            )
            ORDER BY 
                -- Prioritize preferred product if specified
                CASE WHEN p_preferred_product_id IS NOT NULL AND lightspeed_product_id = p_preferred_product_id THEN 0 ELSE 1 END,
                lightspeed_product_id
        ), '[]'::jsonb)
        FROM full_product_data
        WHERE shop_role = 'source'
        ) AS source,
        
        -- TARGETS grouped by TLD (each TLD can have multiple products)
        (SELECT COALESCE(
            jsonb_object_agg(
                shop_tld,
                products
            ),
            '{}'::jsonb
        )
        FROM (
            SELECT 
                shop_tld,
                jsonb_agg(
                    jsonb_build_object(
                        'shop_id', shop_id,
                        'shop_name', shop_name,
                        'shop_tld', shop_tld,
                        'shop_role', shop_role,
                        'base_url', base_url,
                        'product_id', lightspeed_product_id,
                        'default_variant_id', default_variant_id,
                        'sku', v_sku,
                        'matched_by_default_variant', matched_by_default_variant,
                        'visibility', visibility,
                        'product_image', product_image,
                        'ls_created_at', ls_created_at,
                        'content_by_language', content_by_language,
                        'variants', variants,
                        'variant_count', variant_count
                    )
                    ORDER BY lightspeed_product_id
                ) AS products
            FROM full_product_data
            WHERE shop_role = 'target'
            GROUP BY shop_tld
        ) target_groups
        ) AS targets,
        
        -- SHOP LANGUAGES configuration
        (SELECT jsonb_object_agg(tld, languages)
        FROM all_shop_languages
        ) AS shop_languages;
END;
$$;

-- =====================================================
-- PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_product_details_by_sku(TEXT, BIGINT) TO authenticated;

-- =====================================================
-- PRODUCT DETAILS RPC FUNCTION (BY PRODUCT ID)
-- =====================================================
--
-- Purpose: Fetch product details by product ID (for null SKU products)
-- 
-- This is a simplified version that fetches a single product and its relationships
-- Used when SKU is not available (null SKU products)
--
-- Parameters:
--   p_product_id: Product ID to search for (required)
--
-- Returns: Same JSONB structure as get_product_details_by_sku
-- =====================================================

DROP FUNCTION IF EXISTS get_product_details_by_product_id(BIGINT);

CREATE OR REPLACE FUNCTION get_product_details_by_product_id(
    p_product_id BIGINT
)
RETURNS TABLE (
    source JSONB,
    targets JSONB,
    shop_languages JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shop_id UUID;
    v_shop_role TEXT;
    v_shop_tld TEXT;
BEGIN
    -- ========================================
    -- STEP 1: Validate input
    -- ========================================
    IF p_product_id IS NULL OR p_product_id <= 0 THEN
        RAISE EXCEPTION 'Invalid product ID provided';
    END IF;

    -- ========================================
    -- STEP 2: Get the product's shop and role
    -- ========================================
    SELECT p.shop_id, s.role, s.tld 
    INTO v_shop_id, v_shop_role, v_shop_tld
    FROM products p
    INNER JOIN shops s ON s.id = p.shop_id
    WHERE p.lightspeed_product_id = p_product_id
    LIMIT 1;

    IF v_shop_id IS NULL THEN
        RAISE EXCEPTION 'Product not found with ID: %', p_product_id;
    END IF;

    -- ========================================
    -- STEP 3: Return product data (follows same pattern as get_product_details_by_sku)
    -- ========================================
    RETURN QUERY
    WITH 
    -- Get all shop languages
    all_shop_languages AS (
        SELECT
            s.tld,
            jsonb_agg(
                jsonb_build_object(
                    'code', sl.code,
                    'is_active', sl.is_active,
                    'is_default', sl.is_default
                )
                ORDER BY sl.is_default DESC, sl.code
            ) AS languages
        FROM shops s
        INNER JOIN shop_languages sl ON sl.shop_id = s.id
        WHERE sl.is_active = true
        GROUP BY s.id, s.tld
    ),
    -- Get the specific product (acts like matched_products in SKU function)
    matched_product AS (
        SELECT
            s.id AS shop_id,
            s.name AS shop_name,
            s.tld AS shop_tld,
            s.role AS shop_role,
            s.base_url,
            p.lightspeed_product_id,
            p.visibility,
            p.image AS product_image,
            p.ls_created_at
        FROM products p
        INNER JOIN shops s ON s.id = p.shop_id
        WHERE p.shop_id = v_shop_id 
          AND p.lightspeed_product_id = p_product_id
    ),
    -- Get all product content (multi-language) for matched product
    product_contents AS (
        SELECT
            mp.shop_id,
            mp.lightspeed_product_id,
            jsonb_object_agg(
                pc.language_code,
                jsonb_build_object(
                    'url', pc.url,
                    'title', pc.title,
                    'fulltitle', pc.fulltitle,
                    'description', pc.description,
                    'content', pc.content
                )
            ) AS content_by_language
        FROM matched_product mp
        LEFT JOIN product_content pc ON pc.shop_id = mp.shop_id 
            AND pc.lightspeed_product_id = mp.lightspeed_product_id
        GROUP BY mp.shop_id, mp.lightspeed_product_id
    ),
    -- Get all variants for matched product
    product_variants AS (
        SELECT
            mp.shop_id,
            mp.lightspeed_product_id,
            jsonb_agg(
                jsonb_build_object(
                    'variant_id', v.lightspeed_variant_id,
                    'sku', v.sku,
                    'is_default', v.is_default,
                    'price_excl', v.price_excl,
                    'image', v.image,
                    'content_by_language', COALESCE(vc_agg.content_by_language, '{}'::jsonb)
                )
                ORDER BY v.is_default DESC, v.lightspeed_variant_id
            ) AS variants
        FROM matched_product mp
        INNER JOIN variants v ON v.shop_id = mp.shop_id 
            AND v.lightspeed_product_id = mp.lightspeed_product_id
        LEFT JOIN LATERAL (
            SELECT jsonb_object_agg(
                vc.language_code,
                jsonb_build_object('title', vc.title)
            ) AS content_by_language
            FROM variant_content vc
            WHERE vc.shop_id = mp.shop_id 
              AND vc.lightspeed_variant_id = v.lightspeed_variant_id
        ) vc_agg ON true
        GROUP BY mp.shop_id, mp.lightspeed_product_id
    ),
    -- Combine all data per product
    full_product_data AS (
        SELECT
            mp.shop_id,
            mp.shop_name,
            mp.shop_tld,
            mp.shop_role,
            mp.base_url,
            mp.lightspeed_product_id,
            mp.visibility,
            mp.product_image,
            mp.ls_created_at,
            COALESCE(pc.content_by_language, '{}'::jsonb) AS content_by_language,
            COALESCE(pv.variants, '[]'::jsonb) AS variants,
            (SELECT COUNT(*) FROM variants WHERE shop_id = mp.shop_id AND lightspeed_product_id = mp.lightspeed_product_id) AS variant_count
        FROM matched_product mp
        LEFT JOIN product_contents pc ON pc.shop_id = mp.shop_id 
            AND pc.lightspeed_product_id = mp.lightspeed_product_id
        LEFT JOIN product_variants pv ON pv.shop_id = mp.shop_id 
            AND pv.lightspeed_product_id = mp.lightspeed_product_id
    )
    -- Final aggregation: source array (same format as get_product_details_by_sku)
    SELECT
        -- SOURCE products array (single product for this function)
        (SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'shop_id', shop_id,
                'shop_name', shop_name,
                'shop_tld', shop_tld,
                'shop_role', shop_role,
                'base_url', base_url,
                'product_id', lightspeed_product_id,
                'default_variant_id', (
                    SELECT lightspeed_variant_id 
                    FROM variants 
                    WHERE shop_id = fpd.shop_id 
                      AND lightspeed_product_id = fpd.lightspeed_product_id 
                      AND is_default = true 
                    LIMIT 1
                ),
                'sku', NULL,  -- No SKU for null SKU products
                'visibility', visibility,
                'product_image', product_image,
                'ls_created_at', ls_created_at,
                'content_by_language', content_by_language,
                'variants', variants,
                'variant_count', variant_count
            )
        ), '[]'::jsonb)
        FROM full_product_data fpd
        ) AS source,
        
        -- Empty targets (null SKU products are standalone)
        '{}'::jsonb AS targets,
        
        -- SHOP LANGUAGES configuration
        (SELECT jsonb_object_agg(tld, languages)
        FROM all_shop_languages
        ) AS shop_languages;
END;
$$;

-- =====================================================
-- PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_product_details_by_product_id(BIGINT) TO authenticated;

-- =====================================================
-- USAGE EXAMPLE
-- =====================================================
-- SELECT * FROM get_product_details_by_sku('SKU-001', 12345);
-- 
-- Returns:
-- {
--   "source": [{
--     "shop_id": "...",
--     "shop_name": "VerpakkingenXL",
--     "shop_tld": "nl",
--     "product_id": 12345,
--     "sku": "SKU-001",
--     "visibility": "visible",
--     "product_image": {"src": "...", "thumb": "...", "title": "..."},
--     "content_by_language": {
--       "nl": {"title": "...", "description": "...", "content": "..."}
--     },
--     "variants": [
--       {
--         "variant_id": 67890,
--         "sku": "SKU-001",
--         "is_default": true,
--         "price_excl": 10.50,
--         "image": {"src": "...", "thumb": "...", "title": "..."},
--         "content_by_language": {
--           "nl": {"title": "Variant Title"}
--         }
--       }
--     ],
--     "variant_count": 3
--   }],
--   "targets": {
--     "be": [{
--       "shop_id": "...",
--       "shop_name": "VerpakkingenXL-BE",
--       "shop_tld": "be",
--       "product_id": 54321,
--       "sku": "SKU-001",
--       "matched_by_default_variant": true,
--       ...same structure as source...
--     }],
--     "de": [{...}]
--   },
--   "shop_languages": {
--     "nl": [{"code": "nl", "is_active": true, "is_default": true}],
--     "be": [
--       {"code": "nl", "is_active": true, "is_default": true},
--       {"code": "fr", "is_active": true, "is_default": false}
--     ],
--     "de": [{"code": "de", "is_active": true, "is_default": true}]
--   }
-- }
