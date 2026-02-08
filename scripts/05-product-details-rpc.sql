-- =====================================================
-- PRODUCT DETAILS RPC (Run after 01: 05-product-details-rpc.sql)
-- =====================================================
--
-- Defines: get_product_details_by_sku, get_product_details_by_product_id
-- Uses: shops, shop_languages, variants, products, product_content, variant_content
-- =====================================================

-- =====================================================
-- PRODUCT DETAILS RPC (BY SKU)
-- =====================================================
--
-- Purpose:
--   Fetch ALL products matching a SKU (source + targets), handling duplicates.
--
-- TABLES/VIEWS USED:
--   - shops, shop_languages, variants, products, product_content, variant_content
--
-- Features:
--   - Single query with JSONB aggregation
--   - Fetches ALL source/target products with matching SKU
--   - Groups targets by shop TLD
--   - Multi-language content for products and variants
--
-- Parameters:
--   p_sku:                  SKU to search (required, trimmed)
--   p_preferred_product_id: Optional product ID to prioritize in source (must be > 0)
--
-- Returns: TABLE(source JSONB, targets JSONB, shops JSONB)
--   source:   Array of ALL source products with this SKU
--   targets:  Object keyed by TLD, each value array of products
--   shops:    Object keyed by TLD, each value { name, base_url, languages }
--
-- =====================================================

DROP FUNCTION IF EXISTS get_product_details_by_sku(TEXT, BIGINT);

CREATE OR REPLACE FUNCTION get_product_details_by_sku(
    p_sku TEXT,
    p_preferred_product_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
    source JSONB,
    targets JSONB,
    shops JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sku TEXT;
BEGIN
    -- ========================================
    -- STEP 1: Validate and normalize SKU
    -- ========================================
    v_sku := TRIM(COALESCE(p_sku, ''));
    
    IF v_sku = '' THEN
        RAISE EXCEPTION 'Invalid SKU provided';
    END IF;

    IF p_preferred_product_id IS NOT NULL AND p_preferred_product_id <= 0 THEN
        RAISE EXCEPTION 'Invalid preferred_product_id. Must be > 0, got: %', p_preferred_product_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM shops WHERE role = 'source') THEN
        RAISE EXCEPTION 'No source shop found';
    END IF;

    -- ========================================
    -- STEP 2: Return aggregated product data
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
    -- Get all shop languages (only active ones)
    all_shop_languages AS (
        SELECT
            s.tld,
            jsonb_agg(
                jsonb_build_object(
                    'code', sl.code,
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
    -- DISTINCT ON ensures one row per product when multiple variants match (prefer default variant)
    matched_products AS (
        SELECT DISTINCT ON (s.id, p.lightspeed_product_id)
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
            p.images_link,
            p.ls_created_at
        FROM all_shops s
        INNER JOIN variants v ON v.shop_id = s.id 
            AND TRIM(v.sku) = v_sku
        INNER JOIN products p ON p.shop_id = s.id 
            AND p.lightspeed_product_id = v.lightspeed_product_id
        ORDER BY s.id, p.lightspeed_product_id, v.is_default DESC NULLS LAST
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
                    'sort_order', v.sort_order,
                    'price_excl', v.price_excl,
                    'image', v.image,
                    'content_by_language', COALESCE(vc_agg.content_by_language, '{}'::jsonb)
                )
                ORDER BY v.sort_order ASC NULLS LAST, v.is_default DESC NULLS LAST, v.lightspeed_variant_id
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
            mp.images_link,
            mp.ls_created_at,
            COALESCE(pc.content_by_language, '{}'::jsonb) AS content_by_language,
            COALESCE(pv.variants, '[]'::jsonb) AS variants,
            jsonb_array_length(COALESCE(pv.variants, '[]'::jsonb)) AS variant_count
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
                'images_link', images_link,
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
                        'images_link', images_link,
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
        
        -- SHOPS: one object per TLD with name, base_url, languages
        (SELECT COALESCE(
            jsonb_object_agg(
                s.tld,
                jsonb_build_object(
                    'name', s.name,
                    'base_url', s.base_url,
                    'languages', COALESCE(ash.languages, '[]'::jsonb)
                )
            ),
            '{}'::jsonb
        )
        FROM all_shops s
        LEFT JOIN all_shop_languages ash ON ash.tld = s.tld
        ) AS shops;
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_details_by_sku(TEXT, BIGINT) TO authenticated;

-- =====================================================
-- PRODUCT DETAILS RPC (BY PRODUCT ID)
-- =====================================================
--
-- Purpose:
--   Fetch single product by Lightspeed product ID (for null SKU products).
--   Used for standalone products that cannot be synced across shops.
--
-- TABLES/VIEWS USED:
--   - products, shops, shop_languages, product_content, variants, variant_content
--
-- Design:
--   - Flat JSONB structure (not source/targets format)
--   - Single product, single store
--   - lightspeed_product_id is unique across all shops
--   - LATERAL join for variants (single scan)
--
-- Parameters:
--   p_product_id: Lightspeed product ID (required, must be > 0)
--
-- Returns: JSONB with product_id, shop_id, shop_name, shop_tld, base_url,
--   visibility, product_image, ls_created_at, default_variant_id, variant_count,
--   languages, content, variants
--
-- =====================================================

DROP FUNCTION IF EXISTS get_product_details_by_product_id(BIGINT);

CREATE OR REPLACE FUNCTION get_product_details_by_product_id(
    p_product_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- ========================================
    -- STEP 1: Validate input
    -- ========================================
    IF p_product_id IS NULL OR p_product_id <= 0 THEN
        RAISE EXCEPTION 'Invalid product ID provided';
    END IF;

    -- ========================================
    -- STEP 2: Build complete product data
    -- ========================================
    SELECT jsonb_build_object(
        'product_id', p.lightspeed_product_id,
        'shop_id', s.id,
        'shop_name', s.name,
        'shop_tld', s.tld,
        'base_url', s.base_url,
        'visibility', p.visibility,
        'product_image', p.image,
        'images_link', p.images_link,
        'ls_created_at', p.ls_created_at,
        'default_variant_id', v_agg.default_variant_id,
        'variant_count', COALESCE(v_agg.variant_count, 0),
        'languages', (
            SELECT jsonb_agg(
                jsonb_build_object('code', sl.code, 'is_default', sl.is_default)
                ORDER BY sl.is_default DESC, sl.code
            )
            FROM shop_languages sl
            WHERE sl.shop_id = s.id AND sl.is_active = true
        ),
        'content', (
            SELECT jsonb_object_agg(
                pc.language_code,
                jsonb_build_object(
                    'url', pc.url,
                    'title', pc.title,
                    'fulltitle', pc.fulltitle,
                    'description', pc.description,
                    'content', pc.content
                )
            )
            FROM product_content pc
            WHERE pc.shop_id = p.shop_id AND pc.lightspeed_product_id = p.lightspeed_product_id
        ),
        'variants', COALESCE(v_agg.variants, '[]'::jsonb)
    ) INTO v_result
    FROM products p
    INNER JOIN shops s ON s.id = p.shop_id
    LEFT JOIN LATERAL (
        SELECT
            MAX(v.lightspeed_variant_id) FILTER (WHERE v.is_default = true) AS default_variant_id,
            COUNT(*)::int AS variant_count,
            COALESCE(jsonb_agg(
                jsonb_build_object(
                    'variant_id', v.lightspeed_variant_id,
                    'sku', v.sku,
                    'is_default', v.is_default,
                    'sort_order', v.sort_order,
                    'price_excl', v.price_excl,
                    'image', v.image,
                    'content', (
                        SELECT jsonb_object_agg(vc.language_code, jsonb_build_object('title', vc.title))
                        FROM variant_content vc
                        WHERE vc.shop_id = v.shop_id AND vc.lightspeed_variant_id = v.lightspeed_variant_id
                    )
                )
                ORDER BY v.sort_order ASC NULLS LAST, v.is_default DESC NULLS LAST, v.lightspeed_variant_id
            ), '[]'::jsonb) AS variants
        FROM variants v
        WHERE v.shop_id = p.shop_id AND v.lightspeed_product_id = p.lightspeed_product_id
    ) v_agg ON true
    WHERE p.lightspeed_product_id = p_product_id;

    -- ========================================
    -- STEP 3: Validate result and return
    -- ========================================
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Product not found with ID: %', p_product_id;
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_details_by_product_id(BIGINT) TO authenticated;

-- =====================================================
-- Example Usage & Responses
-- =====================================================
--
-- By SKU (CREATE/EDIT tabs):
--   SELECT * FROM get_product_details_by_sku('SKU-001', 12345);
--
--   Response:
--     {
--       "source": [{
--         "shop_id":            "uuid",
--         "shop_name":          "VerpakkingenXL",
--         "shop_tld":           "nl",
--         "shop_role":          "source",
--         "base_url":           "https://www.verpakkingenxl.nl",
--         "product_id":         12345,
--         "default_variant_id": 67890,
--         "sku":                "SKU-001",
--         "visibility":         "visible",
--         "product_image":      {"src": "...", "thumb": "...", "title": "..."},
--         "ls_created_at":      "2025-11-26T11:08:20+00:00",
--         "content_by_language": {"nl": {"url": "...", "title": "...", ...}},
--         "variants":           [{...}],
--         "variant_count":      3
--       }],
--       "targets": {
--         "be": [{"shop_id": "uuid", "product_id": 54321, "sku": "SKU-001", ...}],
--         "de": [{...}]
--       },
--       "shops": {"nl": {"name": "...", "base_url": "...", "languages": [...]}, "be": {...}, "de": {...}}
--     }
--
-- By Product ID (NULL SKU tab):
--   SELECT * FROM get_product_details_by_product_id(160732943);
--
--   Response:
--     {
--       "product_id":          160732943,
--       "shop_id":             "uuid",
--       "shop_name":           "VerpakkingenXL",
--       "shop_tld":             "nl",
--       "base_url":             "https://www.verpakkingenxl.nl",
--       "visibility":           "hidden",
--       "product_image":       {"src": "...", "thumb": "...", "title": "..."},
--       "ls_created_at":       "2025-11-26T11:08:20+00:00",
--       "default_variant_id":  318350202,
--       "variant_count":       2,
--       "languages":           [{"code": "nl", "is_default": true}],
--       "content":             {"nl": {"url": "...", "title": "...", ...}},
--       "variants":            [
--         {"variant_id": 318350202, "sku": null, "is_default": true, ...},
--         {"variant_id": 318350568, "sku": "F427461812ZEG15", "is_default": false, ...}
--       ]
--     }
