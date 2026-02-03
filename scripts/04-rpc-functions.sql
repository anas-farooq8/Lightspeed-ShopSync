-- Optimized: single base scan, conditional aggregation, SKU-presence join

CREATE OR REPLACE FUNCTION get_sync_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT row_to_json(stats)
  FROM (
    WITH base AS (
      SELECT s.tld, v.sku, v.is_default
      FROM variants v
      INNER JOIN shops s ON s.id = v.shop_id
      WHERE s.tld IN ('nl', 'de', 'be') AND v.sku IS NOT NULL AND v.sku != ''
    ),
    agg AS (
      SELECT
        COUNT(*) FILTER (WHERE tld = 'nl' AND is_default) AS total_nl,
        COUNT(*) FILTER (WHERE tld = 'de' AND is_default) AS total_de,
        COUNT(*) FILTER (WHERE tld = 'be' AND is_default) AS total_be,
        COUNT(DISTINCT sku) FILTER (WHERE tld = 'nl' AND is_default) AS unique_nl,
        COUNT(DISTINCT sku) FILTER (WHERE tld = 'de' AND is_default) AS unique_de,
        COUNT(DISTINCT sku) FILTER (WHERE tld = 'be' AND is_default) AS unique_be
      FROM base
    ),
    dups AS (
      SELECT tld, COUNT(*) AS cnt
      FROM (
        SELECT tld, sku FROM base
        WHERE is_default = true
        GROUP BY tld, sku HAVING COUNT(*) > 1
      ) x
      GROUP BY tld
    ),
    sku_presence AS (
      SELECT sku,
        bool_or(tld = 'de') AS in_de,
        bool_or(tld = 'be') AS in_be
      FROM base
      WHERE tld IN ('de', 'be')
      GROUP BY sku
    ),
    nl_presence AS (
      SELECT n.sku, s.in_de, s.in_be
      FROM (SELECT DISTINCT sku FROM base WHERE tld = 'nl' AND is_default = true) n
      LEFT JOIN sku_presence s ON s.sku = n.sku
    )
    SELECT
      a.total_nl AS total_nl_products,
      a.total_de AS total_de_products,
      a.total_be AS total_be_products,
      a.unique_nl AS unique_nl_skus,
      a.unique_de AS unique_de_skus,
      a.unique_be AS unique_be_skus,
      (SELECT COUNT(*) FROM nl_presence WHERE in_de IS NOT TRUE) AS missing_in_de,
      (SELECT COUNT(*) FROM nl_presence WHERE in_be IS NOT TRUE) AS missing_in_be,
      (SELECT COUNT(*) FROM nl_presence WHERE in_de IS TRUE AND in_be IS TRUE) AS exists_in_both,
      COALESCE((SELECT cnt FROM dups WHERE tld = 'nl'), 0) AS nl_duplicate_skus,
      COALESCE((SELECT cnt FROM dups WHERE tld = 'de'), 0) AS de_duplicate_skus,
      COALESCE((SELECT cnt FROM dups WHERE tld = 'be'), 0) AS be_duplicate_skus
    FROM agg a
  ) stats;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_sync_stats() TO authenticated;