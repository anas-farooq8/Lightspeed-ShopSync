-- scripts/04-rpc-functions.sql

CREATE OR REPLACE FUNCTION get_sync_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result json;
BEGIN
  -- Execute the KPI query and return as JSON
  SELECT row_to_json(stats) INTO result
  FROM (
    WITH nl_products AS (
      SELECT v.sku
      FROM variants v
      JOIN shops s ON s.id = v.shop_id
      WHERE s.tld = 'nl'
        AND v.is_default = true
        AND v.sku IS NOT NULL 
        AND v.sku != ''
    ),
    de_products AS (
      SELECT v.sku
      FROM variants v
      JOIN shops s ON s.id = v.shop_id
      WHERE s.tld = 'de'
        AND v.is_default = true
        AND v.sku IS NOT NULL 
        AND v.sku != ''
    ),
    be_products AS (
      SELECT v.sku
      FROM variants v
      JOIN shops s ON s.id = v.shop_id
      WHERE s.tld = 'be'
        AND v.is_default = true
        AND v.sku IS NOT NULL 
        AND v.sku != ''
    )
    SELECT 
      (SELECT COUNT(*) FROM nl_products) AS total_nl_products,
      (SELECT COUNT(*) FROM de_products) AS total_de_products,
      (SELECT COUNT(*) FROM be_products) AS total_be_products,
      (SELECT COUNT(DISTINCT sku) FROM nl_products) AS unique_nl_skus,
      (SELECT COUNT(DISTINCT sku) FROM de_products) AS unique_de_skus,
      (SELECT COUNT(DISTINCT sku) FROM be_products) AS unique_be_skus,
      (SELECT COUNT(DISTINCT nl.sku) FROM nl_products nl WHERE nl.sku NOT IN (SELECT sku FROM de_products)) AS missing_in_de,
      (SELECT COUNT(DISTINCT nl.sku) FROM nl_products nl WHERE nl.sku NOT IN (SELECT sku FROM be_products)) AS missing_in_be,
      (SELECT COUNT(DISTINCT nl.sku) FROM nl_products nl WHERE nl.sku IN (SELECT sku FROM de_products) AND nl.sku IN (SELECT sku FROM be_products)) AS exists_in_both,
      (SELECT COUNT(*) FROM (SELECT sku, COUNT(*) as cnt FROM nl_products GROUP BY sku HAVING COUNT(*) > 1) AS dups) AS nl_duplicate_skus,
      (SELECT COUNT(*) FROM (SELECT sku, COUNT(*) as cnt FROM de_products GROUP BY sku HAVING COUNT(*) > 1) AS dups) AS de_duplicate_skus,
      (SELECT COUNT(*) FROM (SELECT sku, COUNT(*) as cnt FROM be_products GROUP BY sku HAVING COUNT(*) > 1) AS dups) AS be_duplicate_skus
  ) stats;
  
  RETURN result;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION get_sync_stats() TO authenticated;