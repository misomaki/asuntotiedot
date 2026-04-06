-- 028: Marketplace analytics — popularity rankings, matches, area/city aggregations
-- Provides insights into which buildings and areas have the most buyer/seller activity

-- ============================================================
-- 1. Top buildings by buyer interest (optionally filtered by municipality)
-- ============================================================
CREATE OR REPLACE FUNCTION get_top_buildings_by_interest(
  p_municipality TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  building_id UUID,
  address TEXT,
  area_code TEXT,
  area_name TEXT,
  municipality TEXT,
  estimated_price_per_sqm NUMERIC,
  construction_year INT,
  interest_count BIGINT,
  sell_intent_count BIGINT,
  has_match BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    b.id AS building_id,
    b.address,
    a.area_code,
    a.name AS area_name,
    a.municipality,
    b.estimated_price_per_sqm,
    b.construction_year,
    bi_counts.cnt AS interest_count,
    COALESCE(si_counts.cnt, 0) AS sell_intent_count,
    COALESCE(si_counts.cnt, 0) > 0 AS has_match
  FROM (
    SELECT building_id, COUNT(*) AS cnt
    FROM building_interests
    WHERE expires_at > NOW()
    GROUP BY building_id
    ORDER BY cnt DESC
    LIMIT p_limit * 2  -- over-fetch before municipality filter
  ) bi_counts
  JOIN buildings b ON b.id = bi_counts.building_id
  JOIN areas a ON a.id = b.area_id
  LEFT JOIN (
    SELECT building_id, COUNT(*) AS cnt
    FROM building_sell_intents
    WHERE expires_at > NOW()
    GROUP BY building_id
  ) si_counts ON si_counts.building_id = b.id
  WHERE (p_municipality IS NULL OR a.municipality = p_municipality)
  ORDER BY bi_counts.cnt DESC, si_counts.cnt DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 2. Top buildings by sell intent
-- ============================================================
CREATE OR REPLACE FUNCTION get_top_buildings_by_sell_intent(
  p_municipality TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  building_id UUID,
  address TEXT,
  area_code TEXT,
  area_name TEXT,
  municipality TEXT,
  estimated_price_per_sqm NUMERIC,
  construction_year INT,
  sell_intent_count BIGINT,
  interest_count BIGINT,
  has_match BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    b.id AS building_id,
    b.address,
    a.area_code,
    a.name AS area_name,
    a.municipality,
    b.estimated_price_per_sqm,
    b.construction_year,
    si_counts.cnt AS sell_intent_count,
    COALESCE(bi_counts.cnt, 0) AS interest_count,
    COALESCE(bi_counts.cnt, 0) > 0 AS has_match
  FROM (
    SELECT building_id, COUNT(*) AS cnt
    FROM building_sell_intents
    WHERE expires_at > NOW()
    GROUP BY building_id
    ORDER BY cnt DESC
    LIMIT p_limit * 2
  ) si_counts
  JOIN buildings b ON b.id = si_counts.building_id
  JOIN areas a ON a.id = b.area_id
  LEFT JOIN (
    SELECT building_id, COUNT(*) AS cnt
    FROM building_interests
    WHERE expires_at > NOW()
    GROUP BY building_id
  ) bi_counts ON bi_counts.building_id = b.id
  WHERE (p_municipality IS NULL OR a.municipality = p_municipality)
  ORDER BY si_counts.cnt DESC, bi_counts.cnt DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 3. Top areas by signal activity (interests + sell intents aggregated)
-- ============================================================
CREATE OR REPLACE FUNCTION get_top_areas_by_signals(
  p_municipality TEXT DEFAULT NULL,
  p_signal_type TEXT DEFAULT 'all',  -- 'interest', 'sell_intent', or 'all'
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  area_id UUID,
  area_code TEXT,
  area_name TEXT,
  municipality TEXT,
  interest_count BIGINT,
  sell_intent_count BIGINT,
  match_count BIGINT,
  unique_buildings_with_signals BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH area_interests AS (
    SELECT a.id AS area_id, COUNT(*) AS cnt
    FROM building_interests bi
    JOIN buildings b ON b.id = bi.building_id
    JOIN areas a ON a.id = b.area_id
    WHERE bi.expires_at > NOW()
      AND (p_municipality IS NULL OR a.municipality = p_municipality)
    GROUP BY a.id
  ),
  area_sell_intents AS (
    SELECT a.id AS area_id, COUNT(*) AS cnt
    FROM building_sell_intents si
    JOIN buildings b ON b.id = si.building_id
    JOIN areas a ON a.id = b.area_id
    WHERE si.expires_at > NOW()
      AND (p_municipality IS NULL OR a.municipality = p_municipality)
    GROUP BY a.id
  ),
  area_matches AS (
    -- Buildings that have BOTH at least one interest AND at least one sell intent
    SELECT a.id AS area_id, COUNT(DISTINCT b.id) AS cnt
    FROM buildings b
    JOIN areas a ON a.id = b.area_id
    WHERE (p_municipality IS NULL OR a.municipality = p_municipality)
      AND EXISTS (
        SELECT 1 FROM building_interests bi
        WHERE bi.building_id = b.id AND bi.expires_at > NOW()
      )
      AND EXISTS (
        SELECT 1 FROM building_sell_intents si
        WHERE si.building_id = b.id AND si.expires_at > NOW()
      )
    GROUP BY a.id
  ),
  area_unique_buildings AS (
    SELECT area_id, COUNT(DISTINCT building_id) AS cnt
    FROM (
      SELECT b.area_id, bi.building_id
      FROM building_interests bi
      JOIN buildings b ON b.id = bi.building_id
      WHERE bi.expires_at > NOW()
      UNION
      SELECT b.area_id, si.building_id
      FROM building_sell_intents si
      JOIN buildings b ON b.id = si.building_id
      WHERE si.expires_at > NOW()
    ) all_signals
    WHERE (p_municipality IS NULL OR area_id IN (
      SELECT id FROM areas WHERE municipality = p_municipality
    ))
    GROUP BY area_id
  ),
  combined AS (
    SELECT
      a.id AS area_id,
      a.area_code,
      a.name AS area_name,
      a.municipality,
      COALESCE(ai.cnt, 0) AS interest_count,
      COALESCE(asi.cnt, 0) AS sell_intent_count,
      COALESCE(am.cnt, 0) AS match_count,
      COALESCE(aub.cnt, 0) AS unique_buildings_with_signals
    FROM areas a
    LEFT JOIN area_interests ai ON ai.area_id = a.id
    LEFT JOIN area_sell_intents asi ON asi.area_id = a.id
    LEFT JOIN area_matches am ON am.area_id = a.id
    LEFT JOIN area_unique_buildings aub ON aub.area_id = a.id
    WHERE (p_municipality IS NULL OR a.municipality = p_municipality)
      AND (COALESCE(ai.cnt, 0) > 0 OR COALESCE(asi.cnt, 0) > 0)
  )
  SELECT * FROM combined
  ORDER BY
    CASE
      WHEN p_signal_type = 'interest' THEN interest_count
      WHEN p_signal_type = 'sell_intent' THEN sell_intent_count
      ELSE interest_count + sell_intent_count
    END DESC,
    match_count DESC
  LIMIT p_limit;
$$;

-- ============================================================
-- 4. Marketplace summary stats (overall or per municipality)
-- ============================================================
CREATE OR REPLACE FUNCTION get_marketplace_summary(
  p_municipality TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_interests', (
      SELECT COUNT(*)
      FROM building_interests bi
      JOIN buildings b ON b.id = bi.building_id
      JOIN areas a ON a.id = b.area_id
      WHERE bi.expires_at > NOW()
        AND (p_municipality IS NULL OR a.municipality = p_municipality)
    ),
    'total_sell_intents', (
      SELECT COUNT(*)
      FROM building_sell_intents si
      JOIN buildings b ON b.id = si.building_id
      JOIN areas a ON a.id = b.area_id
      WHERE si.expires_at > NOW()
        AND (p_municipality IS NULL OR a.municipality = p_municipality)
    ),
    'total_matches', (
      SELECT COUNT(DISTINCT b.id)
      FROM buildings b
      JOIN areas a ON a.id = b.area_id
      WHERE (p_municipality IS NULL OR a.municipality = p_municipality)
        AND EXISTS (
          SELECT 1 FROM building_interests bi
          WHERE bi.building_id = b.id AND bi.expires_at > NOW()
        )
        AND EXISTS (
          SELECT 1 FROM building_sell_intents si
          WHERE si.building_id = b.id AND si.expires_at > NOW()
        )
    ),
    'unique_buildings_with_interest', (
      SELECT COUNT(DISTINCT bi.building_id)
      FROM building_interests bi
      JOIN buildings b ON b.id = bi.building_id
      JOIN areas a ON a.id = b.area_id
      WHERE bi.expires_at > NOW()
        AND (p_municipality IS NULL OR a.municipality = p_municipality)
    ),
    'unique_buildings_with_sell_intent', (
      SELECT COUNT(DISTINCT si.building_id)
      FROM building_sell_intents si
      JOIN buildings b ON b.id = si.building_id
      JOIN areas a ON a.id = b.area_id
      WHERE si.expires_at > NOW()
        AND (p_municipality IS NULL OR a.municipality = p_municipality)
    ),
    'unique_areas_with_signals', (
      SELECT COUNT(DISTINCT b.area_id)
      FROM (
        SELECT building_id FROM building_interests WHERE expires_at > NOW()
        UNION
        SELECT building_id FROM building_sell_intents WHERE expires_at > NOW()
      ) signals
      JOIN buildings b ON b.id = signals.building_id
      JOIN areas a ON a.id = b.area_id
      WHERE (p_municipality IS NULL OR a.municipality = p_municipality)
    ),
    'unique_users', (
      SELECT COUNT(DISTINCT user_id)
      FROM (
        SELECT bi.user_id, b.area_id
        FROM building_interests bi
        JOIN buildings b ON b.id = bi.building_id
        JOIN areas a ON a.id = b.area_id
        WHERE bi.expires_at > NOW()
          AND (p_municipality IS NULL OR a.municipality = p_municipality)
        UNION
        SELECT si.user_id, b.area_id
        FROM building_sell_intents si
        JOIN buildings b ON b.id = si.building_id
        JOIN areas a ON a.id = b.area_id
        WHERE si.expires_at > NOW()
          AND (p_municipality IS NULL OR a.municipality = p_municipality)
      ) all_users
    )
  );
$$;

-- ============================================================
-- 5. Per-city breakdown (top municipalities by signal activity)
-- ============================================================
CREATE OR REPLACE FUNCTION get_marketplace_by_city(
  p_limit INT DEFAULT 50
)
RETURNS TABLE(
  municipality TEXT,
  interest_count BIGINT,
  sell_intent_count BIGINT,
  match_count BIGINT,
  unique_buildings BIGINT,
  unique_areas BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH city_interests AS (
    SELECT a.municipality, COUNT(*) AS cnt, COUNT(DISTINCT bi.building_id) AS bldg_cnt
    FROM building_interests bi
    JOIN buildings b ON b.id = bi.building_id
    JOIN areas a ON a.id = b.area_id
    WHERE bi.expires_at > NOW()
    GROUP BY a.municipality
  ),
  city_sell_intents AS (
    SELECT a.municipality, COUNT(*) AS cnt, COUNT(DISTINCT si.building_id) AS bldg_cnt
    FROM building_sell_intents si
    JOIN buildings b ON b.id = si.building_id
    JOIN areas a ON a.id = b.area_id
    WHERE si.expires_at > NOW()
    GROUP BY a.municipality
  ),
  city_matches AS (
    SELECT a.municipality, COUNT(DISTINCT b.id) AS cnt
    FROM buildings b
    JOIN areas a ON a.id = b.area_id
    WHERE EXISTS (
      SELECT 1 FROM building_interests bi
      WHERE bi.building_id = b.id AND bi.expires_at > NOW()
    )
    AND EXISTS (
      SELECT 1 FROM building_sell_intents si
      WHERE si.building_id = b.id AND si.expires_at > NOW()
    )
    GROUP BY a.municipality
  ),
  city_areas AS (
    SELECT a.municipality, COUNT(DISTINCT b.area_id) AS cnt
    FROM (
      SELECT building_id FROM building_interests WHERE expires_at > NOW()
      UNION
      SELECT building_id FROM building_sell_intents WHERE expires_at > NOW()
    ) signals
    JOIN buildings b ON b.id = signals.building_id
    JOIN areas a ON a.id = b.area_id
    GROUP BY a.municipality
  )
  SELECT
    COALESCE(ci.municipality, csi.municipality) AS municipality,
    COALESCE(ci.cnt, 0) AS interest_count,
    COALESCE(csi.cnt, 0) AS sell_intent_count,
    COALESCE(cm.cnt, 0) AS match_count,
    COALESCE(ci.bldg_cnt, 0) + COALESCE(csi.bldg_cnt, 0)
      - COALESCE(cm.cnt, 0) AS unique_buildings,  -- union approximation
    COALESCE(ca.cnt, 0) AS unique_areas
  FROM city_interests ci
  FULL OUTER JOIN city_sell_intents csi ON csi.municipality = ci.municipality
  LEFT JOIN city_matches cm ON cm.municipality = COALESCE(ci.municipality, csi.municipality)
  LEFT JOIN city_areas ca ON ca.municipality = COALESCE(ci.municipality, csi.municipality)
  ORDER BY COALESCE(ci.cnt, 0) + COALESCE(csi.cnt, 0) DESC
  LIMIT p_limit;
$$;
