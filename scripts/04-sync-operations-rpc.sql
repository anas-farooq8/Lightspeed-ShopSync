-- =====================================================
-- SYNC OPERATIONS RPC (Run after 03: 04-sync-operations-rpc.sql)
-- =====================================================
--
-- This file defines two RPC functions for the sync operations UI:
--
-- 1. get_sync_operations
--    - CREATE tab: products missing in target shop(s)
--    - EDIT tab: products that exist in at least one target
--    - Uses: product_sync_status (view)
--
-- 2. get_null_sku_products
--    - NULL SKU tab: products where default variant has no valid SKU
--    - Uses: shops, variants, products, product_content, variant_content
--
-- Both return the same row structure for UI consistency.
-- Pagination: page_size limits unique SKUs per page (CREATE/EDIT);
-- duplicate SKUs always appear on the same page.
-- =====================================================


-- =====================================================
-- GET SYNC OPERATIONS (CREATE / EDIT Tabs)
-- =====================================================
--
-- TABLES/VIEWS USED:
--   - product_sync_status (view)
--     View in turn uses: shops, variants, products, product_content, variant_content
--
-- PARAMETERS:
--   p_operation      'create' | 'edit'
--   p_missing_in     'all' | shop TLD (e.g. 'be') | NULL (default: 'all')
--   p_search         Search in product ID, SKU, product title, variant title
--   p_only_duplicates  Filter to products with duplicate SKUs only
--   p_sort_by        'product_id' | 'title' | 'sku' | 'variants' | 'price' | 'created'
--   p_sort_order     'asc' | 'desc'
--   p_page           Page number (1-based)
--   p_page_size      Rows per page (1-1000)
--
-- FILTER LOGIC:
--   CREATE: Products missing in target(s)
--     - p_missing_in='all'  → missing in ALL targets
--     - p_missing_in='be'   → missing in shop 'be' only
--     - p_missing_in=NULL   → missing in at least one target
--   EDIT: Products that exist in at least one target
--     - p_missing_in='all'  → exists in ALL targets
--     - p_missing_in='be'   → exists in shop 'be' only
--     - p_missing_in=NULL   → exists in at least one target (default)
--
-- PAGINATION:
--   Groups by SKU before pagination. All products with same SKU stay on same page.
--   total_count = unique SKU groups; rows can exceed page_size when SKUs have duplicates.
-- =====================================================

DROP FUNCTION IF EXISTS get_sync_operations(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_sync_operations(
  p_operation TEXT,              -- 'create' | 'edit'
  p_missing_in TEXT DEFAULT NULL, -- For CREATE: 'all' | shop TLD | NULL; For EDIT: 'all' | shop TLD | NULL (exists in)
  p_search TEXT DEFAULT NULL,
  p_only_duplicates BOOLEAN DEFAULT FALSE,
  p_sort_by TEXT DEFAULT 'created',
  p_sort_order TEXT DEFAULT 'desc',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 100
)
RETURNS TABLE(
  source_shop_id UUID,
  source_shop_name TEXT,
  source_shop_tld TEXT,
  source_product_id BIGINT,
  source_variant_id BIGINT,
  default_sku TEXT,
  product_title TEXT,
  variant_title TEXT,
  product_image JSONB,
  price_excl NUMERIC,
  source_variant_count INTEGER,
  ls_created_at TIMESTAMP WITH TIME ZONE,
  source_duplicate_count INTEGER,
  source_has_duplicates BOOLEAN,
  source_duplicate_product_ids BIGINT[],
  targets JSONB,
  total_count BIGINT,
  total_pages INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Input validation
  IF p_operation IS NULL OR p_operation NOT IN ('create', 'edit') THEN
    RAISE EXCEPTION 'Invalid operation. Must be ''create'' or ''edit'', got: %', COALESCE(p_operation, 'NULL');
  END IF;
  IF p_sort_by IS NULL OR p_sort_by NOT IN ('product_id', 'title', 'sku', 'variants', 'price', 'created') THEN
    RAISE EXCEPTION 'Invalid sort_by. Must be one of: product_id, title, sku, variants, price, created. Got: %', COALESCE(p_sort_by, 'NULL');
  END IF;
  IF p_sort_order IS NULL OR p_sort_order NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort_order. Must be ''asc'' or ''desc'', got: %', COALESCE(p_sort_order, 'NULL');
  END IF;
  IF p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'Invalid page number. Must be >= 1, got: %', COALESCE(p_page::TEXT, 'NULL');
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'Invalid page_size. Must be between 1 and 1000, got: %', COALESCE(p_page_size::TEXT, 'NULL');
  END IF;

  p_search := NULLIF(TRIM(p_search), '');
  p_missing_in := LOWER(TRIM(COALESCE(p_missing_in, 'all')));

  RETURN QUERY
  WITH
  -- Step 1: Filter products by operation, search, duplicates
  filtered_products AS (
    SELECT
      pss.source_shop_id,
      pss.source_shop_name,
      pss.source_shop_tld,
      pss.source_product_id,
      pss.source_variant_id,
      pss.default_sku,
      pss.product_title,
      pss.variant_title,
      pss.product_image,
      pss.price_excl,
      pss.source_variant_count,
      pss.ls_created_at,
      pss.source_duplicate_count,
      pss.source_has_duplicates,
      pss.source_duplicate_product_ids,
      pss.targets
    FROM product_sync_status pss
    WHERE
      (p_search IS NULL OR p_search = ''
        OR pss.source_product_id::TEXT ILIKE '%' || p_search || '%'
        OR pss.product_title ILIKE '%' || p_search || '%'
        OR pss.variant_title ILIKE '%' || p_search || '%'
        OR pss.default_sku ILIKE '%' || p_search || '%')
      AND (NOT p_only_duplicates OR pss.source_has_duplicates)
      AND (
        (p_operation = 'create' AND (
          (p_missing_in = 'all' AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(pss.targets) AS t(k, v)
            WHERE t.v->>'status' != 'not_exists'
          ))
          OR (p_missing_in != 'all' AND pss.targets->p_missing_in->>'status' = 'not_exists')
          OR (p_missing_in IS NULL AND EXISTS (
            SELECT 1 FROM jsonb_each(pss.targets) AS t(k, v)
            WHERE t.v->>'status' = 'not_exists'
          ))
        ))
        OR (p_operation = 'edit' AND (
          (p_missing_in = 'all' AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(pss.targets) AS t(k, v)
            WHERE t.v->>'status' = 'not_exists'
          ))
          OR (p_missing_in != 'all' AND p_missing_in IS NOT NULL AND pss.targets->p_missing_in->>'status' = 'exists')
          OR (p_missing_in IS NULL AND EXISTS (
            SELECT 1 FROM jsonb_each(pss.targets) AS t(k, v)
            WHERE t.v->>'status' = 'exists'
          ))
        ))
      )
  ),

  -- Step 2: Assign sort value per SKU group (all products with same SKU get same value)
  sku_groups AS (
    SELECT
      fp.*,
      FIRST_VALUE(
        CASE
          WHEN p_sort_by = 'product_id' THEN fp.source_product_id::TEXT
          WHEN p_sort_by = 'title' THEN fp.product_title
          WHEN p_sort_by = 'sku' THEN fp.default_sku
          WHEN p_sort_by = 'variants' THEN fp.source_variant_count::TEXT
          WHEN p_sort_by = 'price' THEN fp.price_excl::TEXT
          ELSE fp.ls_created_at::TEXT
        END
      ) OVER (
        PARTITION BY fp.default_sku
        ORDER BY fp.ls_created_at DESC, fp.source_product_id ASC
      ) AS group_sort_value,
      FIRST_VALUE(fp.ls_created_at::TEXT) OVER (
        PARTITION BY fp.default_sku
        ORDER BY fp.ls_created_at DESC, fp.source_product_id ASC
      ) AS group_secondary_sort
    FROM filtered_products fp
  ),

  -- Step 3: Rank SKU groups for pagination
  ranked_groups AS (
    SELECT
      sg.*,
      DENSE_RANK() OVER (
        ORDER BY
          CASE WHEN p_sort_by IN ('title', 'sku') AND p_sort_order = 'asc' THEN sg.group_sort_value END ASC NULLS LAST,
          CASE WHEN p_sort_by IN ('title', 'sku') AND p_sort_order = 'desc' THEN sg.group_sort_value END DESC NULLS LAST,
          CASE WHEN p_sort_by IN ('product_id', 'variants', 'price') AND p_sort_order = 'asc' THEN sg.group_sort_value::NUMERIC END ASC NULLS LAST,
          CASE WHEN p_sort_by IN ('product_id', 'variants', 'price') AND p_sort_order = 'desc' THEN sg.group_sort_value::NUMERIC END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'created' AND p_sort_order = 'asc' THEN sg.group_sort_value::TIMESTAMP WITH TIME ZONE END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'created' AND p_sort_order = 'desc' THEN sg.group_sort_value::TIMESTAMP WITH TIME ZONE END DESC NULLS LAST,
          sg.group_secondary_sort DESC,
          sg.default_sku ASC
      ) AS sku_group_rank
    FROM sku_groups sg
  ),

  total_count_calc AS (
    SELECT MAX(sku_group_rank) AS total_sku_groups FROM ranked_groups
  ),

  page_groups AS (
    SELECT DISTINCT rg.default_sku
    FROM ranked_groups rg
    WHERE rg.sku_group_rank > (p_page - 1) * p_page_size
      AND rg.sku_group_rank <= p_page * p_page_size
  ),

  page_products AS (
    SELECT rg.*, tcc.total_sku_groups
    FROM ranked_groups rg
    INNER JOIN page_groups pg ON pg.default_sku = rg.default_sku
    CROSS JOIN total_count_calc tcc
  )

  SELECT
    pp.source_shop_id,
    pp.source_shop_name,
    pp.source_shop_tld,
    pp.source_product_id,
    pp.source_variant_id,
    pp.default_sku,
    pp.product_title,
    pp.variant_title,
    pp.product_image,
    pp.price_excl,
    pp.source_variant_count::INTEGER,
    pp.ls_created_at,
    pp.source_duplicate_count::INTEGER,
    pp.source_has_duplicates,
    pp.source_duplicate_product_ids,
    pp.targets,
    pp.total_sku_groups AS total_count,
    CEIL(pp.total_sku_groups::NUMERIC / p_page_size)::INTEGER AS total_pages
  FROM page_products pp
  ORDER BY
    CASE WHEN p_sort_by IN ('title', 'sku') AND p_sort_order = 'asc' THEN pp.group_sort_value END ASC NULLS LAST,
    CASE WHEN p_sort_by IN ('title', 'sku') AND p_sort_order = 'desc' THEN pp.group_sort_value END DESC NULLS LAST,
    CASE WHEN p_sort_by IN ('product_id', 'variants', 'price') AND p_sort_order = 'asc' THEN pp.group_sort_value::NUMERIC END ASC NULLS LAST,
    CASE WHEN p_sort_by IN ('product_id', 'variants', 'price') AND p_sort_order = 'desc' THEN pp.group_sort_value::NUMERIC END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'created' AND p_sort_order = 'asc' THEN pp.group_sort_value::TIMESTAMP WITH TIME ZONE END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'created' AND p_sort_order = 'desc' THEN pp.group_sort_value::TIMESTAMP WITH TIME ZONE END DESC NULLS LAST,
    pp.group_secondary_sort DESC,
    pp.default_sku ASC,
    pp.source_product_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_sync_operations(TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;


-- =====================================================
-- GET NULL SKU PRODUCTS (NULL SKU Tab)
-- =====================================================
--
-- TABLES/VIEWS USED:
--   - shops
--   - variants
--   - products
--   - product_content
--   - variant_content
--
-- PARAMETERS:
--   p_shop_tld   Filter by shop TLD (e.g. 'nl', 'be') or NULL for all shops
--   p_search     Search in product ID, product title, variant title
--   p_sort_by    'product_id' | 'title' | 'variants' | 'price' | 'created' (no 'sku' - products have no SKU)
--   p_sort_order 'asc' | 'desc'
--   p_page       Page number (1-based)
--   p_page_size  Rows per page (1-1000)
--
-- Returns same structure as get_sync_operations for UI reuse.
-- targets is always {} (empty) for null-SKU products.
-- =====================================================

DROP FUNCTION IF EXISTS get_null_sku_products(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_null_sku_products(
  p_shop_tld TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created',
  p_sort_order TEXT DEFAULT 'desc',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 100
)
RETURNS TABLE(
  source_shop_id UUID,
  source_shop_name TEXT,
  source_shop_tld TEXT,
  source_product_id BIGINT,
  source_variant_id BIGINT,
  default_sku TEXT,
  product_title TEXT,
  variant_title TEXT,
  product_image JSONB,
  price_excl NUMERIC,
  source_variant_count INTEGER,
  ls_created_at TIMESTAMP WITH TIME ZONE,
  source_duplicate_count INTEGER,
  source_has_duplicates BOOLEAN,
  source_duplicate_product_ids BIGINT[],
  targets JSONB,
  total_count BIGINT,
  total_pages INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Input validation
  IF p_sort_by IS NULL OR p_sort_by NOT IN ('product_id', 'title', 'variants', 'price', 'created') THEN
    RAISE EXCEPTION 'Invalid sort_by. Must be one of: product_id, title, variants, price, created. Got: %', COALESCE(p_sort_by, 'NULL');
  END IF;
  IF p_sort_order IS NULL OR p_sort_order NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'Invalid sort_order. Must be ''asc'' or ''desc'', got: %', COALESCE(p_sort_order, 'NULL');
  END IF;
  IF p_page IS NULL OR p_page < 1 THEN
    RAISE EXCEPTION 'Invalid page number. Must be >= 1, got: %', COALESCE(p_page::TEXT, 'NULL');
  END IF;
  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'Invalid page_size. Must be between 1 and 1000, got: %', COALESCE(p_page_size::TEXT, 'NULL');
  END IF;

  p_search := NULLIF(TRIM(p_search), '');
  p_shop_tld := NULLIF(LOWER(TRIM(COALESCE(p_shop_tld, ''))), '');

  RETURN QUERY
  WITH
  filtered_products AS (
    SELECT
      s.id AS shop_id,
      s.name AS shop_name,
      s.tld AS shop_tld,
      v.lightspeed_product_id AS product_id,
      v.lightspeed_variant_id AS variant_id,
      pc.title AS product_title,
      vc.title AS variant_title,
      p.image AS product_image,
      v.price_excl,
      p.ls_created_at
    FROM shops s
    INNER JOIN variants v ON v.shop_id = s.id
      AND v.is_default = true
      AND (v.sku IS NULL OR TRIM(v.sku) = '')
    INNER JOIN products p ON p.shop_id = s.id
      AND p.lightspeed_product_id = v.lightspeed_product_id
    LEFT JOIN product_content pc ON pc.shop_id = s.id
      AND pc.lightspeed_product_id = v.lightspeed_product_id
      AND pc.language_code = s.tld
    LEFT JOIN variant_content vc ON vc.shop_id = s.id
      AND vc.lightspeed_variant_id = v.lightspeed_variant_id
      AND vc.language_code = s.tld
    WHERE
      (p_shop_tld IS NULL OR s.tld = p_shop_tld)
      AND (
        p_search IS NULL OR p_search = ''
        OR v.lightspeed_product_id::TEXT ILIKE '%' || p_search || '%'
        OR pc.title ILIKE '%' || p_search || '%'
        OR vc.title ILIKE '%' || p_search || '%'
      )
  ),

  variant_counts AS (
    SELECT v.shop_id, v.lightspeed_product_id, COUNT(*) AS variant_count
    FROM variants v
    INNER JOIN filtered_products fp ON fp.shop_id = v.shop_id AND fp.product_id = v.lightspeed_product_id
    GROUP BY v.shop_id, v.lightspeed_product_id
  ),

  counted_products AS (
    SELECT
      fp.*,
      COALESCE(vc.variant_count, 1)::INTEGER AS variant_count,
      COUNT(*) OVER () AS total_count
    FROM filtered_products fp
    LEFT JOIN variant_counts vc ON vc.shop_id = fp.shop_id AND vc.lightspeed_product_id = fp.product_id
  ),

  paginated AS (
    SELECT
      cp.*,
      CEIL(cp.total_count::NUMERIC / p_page_size)::INTEGER AS total_pages,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_sort_by = 'product_id' AND p_sort_order = 'asc' THEN cp.product_id END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'product_id' AND p_sort_order = 'desc' THEN cp.product_id END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'title' AND p_sort_order = 'asc' THEN cp.product_title END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'title' AND p_sort_order = 'desc' THEN cp.product_title END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'variants' AND p_sort_order = 'asc' THEN cp.variant_count END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'variants' AND p_sort_order = 'desc' THEN cp.variant_count END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'price' AND p_sort_order = 'asc' THEN cp.price_excl END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'price' AND p_sort_order = 'desc' THEN cp.price_excl END DESC NULLS LAST,
          CASE WHEN p_sort_by = 'created' AND p_sort_order = 'asc' THEN cp.ls_created_at END ASC NULLS LAST,
          CASE WHEN p_sort_by = 'created' AND p_sort_order = 'desc' THEN cp.ls_created_at END DESC NULLS LAST,
          cp.ls_created_at DESC,
          cp.product_title ASC
      ) AS rn
    FROM counted_products cp
  )

  SELECT
    p.shop_id AS source_shop_id,
    p.shop_name AS source_shop_name,
    p.shop_tld AS source_shop_tld,
    p.product_id AS source_product_id,
    p.variant_id AS source_variant_id,
    'NULL' AS default_sku,
    p.product_title,
    p.variant_title,
    p.product_image,
    p.price_excl,
    p.variant_count AS source_variant_count,
    p.ls_created_at,
    1 AS source_duplicate_count,
    false AS source_has_duplicates,
    ARRAY[p.product_id] AS source_duplicate_product_ids,
    '{}'::JSONB AS targets,
    p.total_count,
    p.total_pages
  FROM paginated p
  WHERE p.rn > (p_page - 1) * p_page_size
    AND p.rn <= p_page * p_page_size
  ORDER BY p.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION get_null_sku_products(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;


-- =====================================================
-- EXAMPLE RESPONSE (both functions)
-- =====================================================
--
-- {
--   "source_shop_id": "uuid",
--   "source_shop_name": "VerpakkingenXL",
--   "source_shop_tld": "nl",
--   "source_product_id": 1001,
--   "source_variant_id": 2001,
--   "default_sku": "VPK-001",
--   "product_title": "Verzenddozen",
--   "variant_title": "Verzenddozen",
--   "product_image": null,
--   "price_excl": 1.45,
--   "source_variant_count": 1,
--   "ls_created_at": "2026-01-16T13:01:23+00:00",
--   "source_duplicate_count": 1,
--   "source_has_duplicates": false,
--   "source_duplicate_product_ids": [1001],
--   "targets": {
--     "be": {
--       "status": "not_exists",
--       "match_type": "no_match",
--       "total_matches": 0,
--       "default_matches": 0,
--       "non_default_matches": 0,
--       "shop_id": "uuid",
--       "shop_name": "VerpakkingenXL-BE",
--       "shop_tld": "be"
--     },
--     "de": {
--       "status": "exists",
--       "match_type": "default_variant",
--       "total_matches": 1,
--       "default_matches": 1,
--       "non_default_matches": 0,
--       "shop_id": "uuid",
--       "shop_name": "VerpackungenXL",
--       "shop_tld": "de"
--     }
--   },
--   "total_count": 199,
--   "total_pages": 2
-- }
--
-- Note: get_null_sku_products returns targets: {} (empty).
-- Pagination: total_count = unique SKUs (CREATE/EDIT) or total rows (NULL SKU).
