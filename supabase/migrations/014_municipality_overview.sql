-- Municipality price overview: returns median price per municipality.
-- Geometry comes from Statistics Finland WFS (not from postal areas).
--
-- Cascading price lookup for maximum coverage:
--   1. Exact property type + year
--   2. Any property type for that year
--   3. Exact property type, most recent year
--   4. Any property type, most recent year

DROP FUNCTION IF EXISTS get_municipality_overview(INT, TEXT);

CREATE OR REPLACE FUNCTION get_municipality_prices(
  p_year INT DEFAULT 2024,
  p_property_type TEXT DEFAULT 'kerrostalo'
)
RETURNS TABLE (
  municipality TEXT,
  median_price DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  WITH
  scored AS (
    SELECT
      a.municipality AS mun,
      pe.price_per_sqm_avg,
      CASE
        WHEN pe.year = p_year AND pe.property_type = p_property_type THEN 1
        WHEN pe.year = p_year THEN 2
        WHEN pe.property_type = p_property_type THEN 3
        ELSE 4
      END AS match_tier,
      pe.year AS data_year
    FROM areas a
    JOIN price_estimates pe ON pe.area_id = a.id
    WHERE pe.price_per_sqm_avg IS NOT NULL
      AND a.municipality IS NOT NULL
  ),
  best_tier AS (
    SELECT mun, MIN(match_tier) AS tier
    FROM scored
    GROUP BY mun
  ),
  best_year AS (
    SELECT s.mun, s.match_tier AS tier, MAX(s.data_year) AS yr
    FROM scored s
    JOIN best_tier bt ON s.mun = bt.mun AND s.match_tier = bt.tier
    GROUP BY s.mun, s.match_tier
  )
  SELECT
    s.mun,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.price_per_sqm_avg)
  FROM scored s
  JOIN best_year by ON s.mun = by.mun AND s.match_tier = by.tier
  WHERE (by.tier <= 2 OR s.data_year = by.yr)
  GROUP BY s.mun;
END;
$$ LANGUAGE plpgsql STABLE;
