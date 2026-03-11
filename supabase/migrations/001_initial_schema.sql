-- Hintakartta database schema
-- Requires PostGIS extension (enable in Supabase Dashboard → Database → Extensions)

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- AREAS — postal code boundaries from Statistics Finland Paavo
-- ============================================================
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  municipality TEXT NOT NULL,
  geometry GEOMETRY(MultiPolygon, 4326) NOT NULL,
  centroid GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_areas_geometry ON areas USING GIST (geometry);
CREATE INDEX idx_areas_area_code ON areas (area_code);
CREATE INDEX idx_areas_municipality ON areas (municipality);

-- ============================================================
-- PRICE_ESTIMATES — real prices from Statistics Finland PxWeb
-- ============================================================
CREATE TABLE price_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  year INT NOT NULL,
  quarter INT,
  price_per_sqm_avg NUMERIC,
  price_per_sqm_median NUMERIC,
  transaction_count INT DEFAULT 0,
  property_type TEXT NOT NULL CHECK (
    property_type IN ('kerrostalo', 'rivitalo', 'omakotitalo')
  ),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area_id, year, quarter, property_type)
);

CREATE INDEX idx_pe_area_year ON price_estimates(area_id, year);
CREATE INDEX idx_pe_year_type ON price_estimates(year, property_type);

-- ============================================================
-- BUILDING_STATS — area-level aggregates from Paavo
-- ============================================================
CREATE TABLE building_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  year INT NOT NULL,
  buildings_total INT,
  avg_building_year INT,
  pct_pre_1960 NUMERIC,
  pct_1960_1980 NUMERIC,
  pct_1980_2000 NUMERIC,
  pct_post_2000 NUMERIC,
  avg_floor_count NUMERIC,
  UNIQUE(area_id, year)
);

-- ============================================================
-- DEMOGRAPHIC_STATS — from Paavo
-- ============================================================
CREATE TABLE demographic_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  year INT NOT NULL,
  population INT,
  median_age NUMERIC,
  pct_under_18 NUMERIC,
  pct_18_64 NUMERIC,
  pct_over_65 NUMERIC,
  avg_household_size NUMERIC,
  UNIQUE(area_id, year)
);

-- ============================================================
-- BUILDINGS — individual building outlines from OpenStreetMap
-- ============================================================
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
  osm_id BIGINT,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  centroid GEOMETRY(Point, 4326),
  building_type TEXT,
  construction_year INT,
  floor_count INT,
  footprint_area_sqm NUMERIC,
  address TEXT,
  min_distance_to_water_m NUMERIC,
  estimated_price_per_sqm NUMERIC,
  estimation_year INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_buildings_geometry ON buildings USING GIST (geometry);
CREATE INDEX idx_buildings_centroid ON buildings USING GIST (centroid);
CREATE INDEX idx_buildings_area_id ON buildings (area_id);
CREATE INDEX idx_buildings_type ON buildings (building_type);

-- ============================================================
-- WATER_BODIES — from SYKE / OpenStreetMap
-- ============================================================
CREATE TABLE water_bodies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  water_type TEXT,
  geometry GEOMETRY(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_water_geometry ON water_bodies USING GIST (geometry);

-- ============================================================
-- Building price estimation function (SQL)
-- ============================================================
CREATE OR REPLACE FUNCTION compute_building_price(
  p_area_id UUID,
  p_construction_year INT,
  p_distance_to_water NUMERIC,
  p_floor_count INT,
  p_building_type TEXT,
  p_year INT
)
RETURNS NUMERIC AS $$
DECLARE
  v_property_type TEXT;
  v_base_price NUMERIC;
  v_age_factor NUMERIC;
  v_water_factor NUMERIC;
  v_floor_factor NUMERIC;
  v_age INT;
BEGIN
  -- Map building type to property type
  IF p_floor_count >= 3 OR p_building_type IN ('apartments', 'residential') THEN
    v_property_type := 'kerrostalo';
  ELSIF p_floor_count = 2 OR p_building_type IN ('terrace', 'semidetached_house') THEN
    v_property_type := 'rivitalo';
  ELSE
    v_property_type := 'omakotitalo';
  END IF;

  -- Get base price from real StatFin data.
  -- Omakotitalo uses cascading fallback: rivitalo×0.85 → kerrostalo×0.75.
  IF v_property_type = 'omakotitalo' THEN
    -- Try omakotitalo first (future-proofing if data becomes available)
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id
      AND year <= p_year
      AND property_type = 'omakotitalo'
      AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC
    LIMIT 1;

    -- Fallback to rivitalo × 0.85
    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 0.85
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id
        AND year <= p_year
        AND property_type = 'rivitalo'
        AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC
      LIMIT 1;
    END IF;

    -- Fallback to kerrostalo × 0.75
    IF v_base_price IS NULL THEN
      SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg) * 0.75
      INTO v_base_price
      FROM price_estimates
      WHERE area_id = p_area_id
        AND year <= p_year
        AND property_type = 'kerrostalo'
        AND price_per_sqm_avg IS NOT NULL
      ORDER BY year DESC
      LIMIT 1;
    END IF;
  ELSE
    -- Direct lookup for kerrostalo / rivitalo
    SELECT COALESCE(price_per_sqm_median, price_per_sqm_avg)
    INTO v_base_price
    FROM price_estimates
    WHERE area_id = p_area_id
      AND year <= p_year
      AND property_type = v_property_type
      AND price_per_sqm_avg IS NOT NULL
    ORDER BY year DESC
    LIMIT 1;
  END IF;

  IF v_base_price IS NULL THEN
    RETURN NULL;
  END IF;

  -- Age factor (U-shaped curve)
  -- 1960s-70s panel houses are cheapest; pre-war buildings recover value.
  IF p_construction_year IS NULL THEN
    v_age_factor := 1.0;
  ELSE
    v_age := p_year - p_construction_year;
    v_age_factor := CASE
      WHEN v_age <= 0 THEN 1.15
      WHEN v_age <= 5 THEN 1.10
      WHEN v_age <= 10 THEN 1.05
      WHEN v_age <= 20 THEN 1.00
      WHEN v_age <= 30 THEN 0.95
      WHEN v_age <= 40 THEN 0.88
      WHEN v_age <= 50 THEN 0.78   -- late 70s panels
      WHEN v_age <= 60 THEN 0.72   -- 60s-70s panels (valley — cheapest)
      WHEN v_age <= 70 THEN 0.75   -- post-war, starting recovery
      WHEN v_age <= 80 THEN 0.80   -- 1940s-50s recovery
      WHEN v_age <= 100 THEN 0.85  -- pre-war, good value retention
      ELSE 0.88                     -- historical, character premium
    END;
  END IF;

  -- Water proximity factor
  IF p_distance_to_water IS NULL THEN
    v_water_factor := 1.0;
  ELSE
    v_water_factor := CASE
      WHEN p_distance_to_water <= 50 THEN 1.15
      WHEN p_distance_to_water <= 100 THEN 1.10
      WHEN p_distance_to_water <= 200 THEN 1.06
      WHEN p_distance_to_water <= 500 THEN 1.03
      ELSE 1.0
    END;
  END IF;

  -- Floor count factor
  IF p_floor_count IS NULL THEN
    v_floor_factor := 1.0;
  ELSE
    v_floor_factor := CASE
      WHEN p_floor_count >= 8 THEN 1.03
      WHEN p_floor_count >= 5 THEN 1.01
      ELSE 1.0
    END;
  END IF;

  RETURN ROUND(v_base_price * v_age_factor * v_water_factor * v_floor_factor);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- RPC: Get buildings within a bounding box (for map layer)
-- ============================================================
CREATE OR REPLACE FUNCTION get_buildings_in_bbox(
  min_lng DOUBLE PRECISION,
  min_lat DOUBLE PRECISION,
  max_lng DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  limit_count INT DEFAULT 5000
)
RETURNS TABLE (
  id UUID,
  geometry JSON,
  building_type TEXT,
  construction_year INT,
  floor_count INT,
  address TEXT,
  estimated_price_per_sqm NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    ST_AsGeoJSON(b.geometry)::JSON AS geometry,
    b.building_type,
    b.construction_year,
    b.floor_count,
    b.address,
    b.estimated_price_per_sqm
  FROM buildings b
  WHERE b.geometry && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    AND b.estimated_price_per_sqm IS NOT NULL
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- RPC: Update area centroids
-- ============================================================
CREATE OR REPLACE FUNCTION update_centroids()
RETURNS VOID AS $$
BEGIN
  UPDATE areas
  SET centroid = ST_Centroid(geometry)
  WHERE centroid IS NULL AND geometry IS NOT NULL;

  UPDATE buildings
  SET centroid = ST_Centroid(geometry)
  WHERE centroid IS NULL AND geometry IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
