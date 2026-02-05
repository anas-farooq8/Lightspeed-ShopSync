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
-- Purpose: 
--   Fetch single product details by product ID for null SKU products.
--   Used for viewing standalone products that cannot be synced across shops.
-- 
-- Design:
--   - Simple, flat JSONB structure (not the complex source/targets format)
--   - Single product in single store
--   - No duplicate handling or cross-shop matching
--   - Optimized for quick lookups and easy frontend consumption
--
-- Parameters:
--   p_product_id: Lightspeed product ID (required, must be > 0)
--
-- Returns: 
--   Single JSONB object with structure:
--   {
--     "product_id": 160732943,
--     "shop_id": "uuid",
--     "shop_name": "VerpakkingenXL",
--     "shop_tld": "nl",
--     "base_url": "https://...",
--     "visibility": "visible",
--     "product_image": {...},
--     "ls_created_at": "2025-11-26T11:08:20+00:00",
--     "default_variant_id": 318350202,
--     "variant_count": 2,
--     "languages": [{code: "nl", is_default: true}, ...],
--     "content": {"nl": {title: "...", ...}, ...},
--     "variants": [{variant_id: 123, sku: "...", ...}, ...]
--   }
--
-- Usage:
--   SELECT * FROM get_product_details_by_product_id(160732943);
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
    -- STEP 2: Build complete product data in single optimized query
    -- ========================================
    SELECT jsonb_build_object(
        -- Core product identifiers
        'product_id', p.lightspeed_product_id,
        'shop_id', s.id,
        'shop_name', s.name,
        'shop_tld', s.tld,
        'base_url', s.base_url,
        
        -- Product metadata
        'visibility', p.visibility,
        'product_image', p.image,
        'ls_created_at', p.ls_created_at,
        
        -- Get default variant ID (the main variant for this product)
        'default_variant_id', (
            SELECT lightspeed_variant_id 
            FROM variants 
            WHERE shop_id = p.shop_id 
              AND lightspeed_product_id = p.lightspeed_product_id 
              AND is_default = true 
            LIMIT 1
        ),
        
        -- Count total variants for this product
        'variant_count', (
            SELECT COUNT(*) 
            FROM variants 
            WHERE shop_id = p.shop_id 
              AND lightspeed_product_id = p.lightspeed_product_id
        ),
        
        -- Get all active languages for the shop (filtered by is_active)
        'languages', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'code', sl.code,
                    'is_default', sl.is_default
                )
                ORDER BY sl.is_default DESC, sl.code
            )
            FROM shop_languages sl
            WHERE sl.shop_id = s.id 
              AND sl.is_active = true
        ),
        
        -- Get product content in all languages (title, description, etc.)
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
            WHERE pc.shop_id = p.shop_id 
              AND pc.lightspeed_product_id = p.lightspeed_product_id
        ),
        
        -- Get all variants with their images, prices, and content
        'variants', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'variant_id', v.lightspeed_variant_id,
                    'sku', v.sku,
                    'is_default', v.is_default,
                    'price_excl', v.price_excl,
                    'image', v.image,
                    'content', (
                        SELECT jsonb_object_agg(
                            vc.language_code,
                            jsonb_build_object('title', vc.title)
                        )
                        FROM variant_content vc
                        WHERE vc.shop_id = v.shop_id 
                          AND vc.lightspeed_variant_id = v.lightspeed_variant_id
                    )
                )
                ORDER BY v.is_default DESC, v.lightspeed_variant_id
            )
            FROM variants v
            WHERE v.shop_id = p.shop_id 
              AND v.lightspeed_product_id = p.lightspeed_product_id
        )
    ) INTO v_result
    FROM products p
    INNER JOIN shops s ON s.id = p.shop_id
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

-- =====================================================
-- PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_product_details_by_product_id(BIGINT) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- Example 1: Get product details by SKU (for products with SKUs - CREATE tab)
-- SELECT * FROM get_product_details_by_sku('SKU-001', 12345);
-- 
-- Returns complex structure with source/targets for cross-shop comparison:
-- {
--   "source": [{
--     "shop_id": "uuid",
--     "shop_name": "VerpakkingenXL",
--     "shop_tld": "nl",
--     "shop_role": "source",
--     "base_url": "https://www.verpakkingenxl.nl",
--     "product_id": 12345,
--     "default_variant_id": 67890,
--     "sku": "SKU-001",
--     "visibility": "visible",
--     "product_image": {"src": "...", "thumb": "...", "title": "..."},
--     "ls_created_at": "2025-11-26T11:08:20+00:00",
--     "content_by_language": {
--       "nl": {"url": "product-url", "title": "...", "fulltitle": "...", "description": "...", "content": "..."}
--     },
--     "variants": [
--       {
--         "variant_id": 67890,
--         "sku": "SKU-001",
--         "is_default": true,
--         "price_excl": 10.50,
--         "image": {"src": "...", "thumb": "...", "title": "..."},
--         "content_by_language": {"nl": {"title": "Variant Title"}}
--       }
--     ],
--     "variant_count": 3
--   }],
--   "targets": {
--     "be": [{
--       "shop_id": "uuid",
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
--     "nl": [{"code": "nl", "is_default": true}],
--     "be": [{"code": "nl", "is_default": true}, {"code": "fr", "is_default": false}],
--     "de": [{"code": "de", "is_default": true}]
--   }
-- }

-- Example 2: Get product details by Product ID (for null SKU products - NULL SKU tab)
-- SELECT * FROM get_product_details_by_product_id(160732943);
--
-- Returns simple flat structure for single product view:
-- {
--   "product_id": 160732943,
--   "shop_id": "uuid",
--   "shop_name": "VerpakkingenXL",
--   "shop_tld": "nl",
--   "base_url": "https://www.verpakkingenxl.nl",
--   "visibility": "hidden",
--   "product_image": {"src": "...", "thumb": "...", "title": "..."},
--   "ls_created_at": "2025-11-26T11:08:20+00:00",
--   "default_variant_id": 318350202,
--   "variant_count": 2,
--   "languages": [
--     {"code": "nl", "is_default": true}
--   ],
--   "content": {
--     "nl": {
--       "url": "product-url",
--       "title": "Product Title",
--       "fulltitle": "Full Product Title",
--       "description": "Product Description",
--       "content": "<p>HTML content</p>"
--     }
--   },
--   "variants": [
--     {
--       "variant_id": 318350202,
--       "sku": null,
--       "is_default": true,
--       "price_excl": 2.72,
--       "image": {"src": "...", "thumb": "...", "title": "..."},
--       "content": {"nl": {"title": "Variant Title"}}
--     },
--     {
--       "variant_id": 318350568,
--       "sku": "F427461812ZEG15",
--       "is_default": false,
--       "price_excl": 2.72,
--       "image": null,
--       "content": {"nl": {"title": "Variant Title"}}
--     }
--   ]
-- }
