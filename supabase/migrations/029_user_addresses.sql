-- ============================================================
-- User addresses — link users to buildings they own/live in
-- ============================================================
-- Users can register up to 3 addresses. Each address is geocoded
-- and matched to the nearest building within 50m. Sell intents
-- are restricted to buildings the user has registered.
-- ============================================================

-- ── Table ──
CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address_text TEXT NOT NULL,          -- user-provided address string
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Max 3 addresses per user (enforced in application + partial unique)
CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);
CREATE INDEX idx_user_addresses_building ON user_addresses(building_id);

-- ── RLS ──
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;

-- Users can only see their own addresses
CREATE POLICY user_addresses_select ON user_addresses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_addresses_insert ON user_addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_addresses_delete ON user_addresses
  FOR DELETE USING (auth.uid() = user_id);

-- ── RPC: find nearest building to a point ──
CREATE OR REPLACE FUNCTION find_nearest_building(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_max_distance_m DOUBLE PRECISION DEFAULT 50.0
)
RETURNS TABLE(
  building_id UUID,
  address TEXT,
  distance_m DOUBLE PRECISION,
  building_type TEXT,
  construction_year INT,
  estimated_price_per_sqm DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS building_id,
    b.address,
    ST_Distance(
      ST_Transform(b.geometry, 3067),
      ST_Transform(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), 3067)
    ) AS distance_m,
    b.building_type,
    b.construction_year,
    b.estimated_price_per_sqm::float8
  FROM buildings b
  WHERE ST_DWithin(
    b.geometry,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    p_max_distance_m / 111000.0  -- approximate degrees for pre-filter
  )
  ORDER BY ST_Distance(
    ST_Transform(b.geometry, 3067),
    ST_Transform(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), 3067)
  )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
